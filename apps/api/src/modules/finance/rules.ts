// Pay rules for delivery partners and admins, ported from the Figma prototype's
// financeEngine.ts and moved to integer paise. Pure functions: the accrual job
// feeds them one day of activity at a time and stores the result in DailyAccrual,
// and statements sum those rows, so statements, payouts and reports reconcile.
import {
  formatINR,
  percentOf,
  type AdminPlan,
  type PartnerPlan,
  type Paise,
  type PayoutLine,
} from "@zoauro/shared"

// ---------- dates (ISO yyyy-mm-dd strings; cycles are yyyy-mm) ----------
export const cycleOf = (day: string) => day.slice(0, 7)
export function daysInCycle(cycle: string) {
  const [y, m] = cycle.split("-").map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export const cycleEnd = (cycle: string) => `${cycle}-${String(daysInCycle(cycle)).padStart(2, "0")}`
export const isClosed = (cycle: string, today: string) => cycleEnd(cycle) < today
/** Days of the cycle up to and including `today`. */
export function cycleDays(cycle: string, today: string) {
  const out: string[] = []
  for (let d = 1; d <= daysInCycle(cycle); d++) {
    const day = `${cycle}-${String(d).padStart(2, "0")}`
    if (day > today) break
    out.push(day)
  }
  return out
}
/** Payouts for a cycle fall due on the 5th of the next month. */
export function dueDateFor(cycle: string) {
  const [y, m] = cycle.split("-").map(Number) as [number, number]
  const next = new Date(Date.UTC(y, m, 5))
  return next.toISOString().slice(0, 10)
}

// ---------- plans ----------
export type PlanVersion<T> = { from: string; plan: T }

/** The plan in force on `day`: the latest version that started on or before it. */
export function planOn<T>(history: PlanVersion<T>[], day: string): T {
  if (!history.length) throw new Error("No pay plan on record")
  let plan = history[0]!.plan
  for (const v of history) if (v.from <= day) plan = v.plan
  return plan
}

/** A monthly amount split into daily shares that add up exactly to it over the month. */
export function dayShare(monthly: Paise, day: string): Paise {
  const dim = daysInCycle(cycleOf(day))
  const i = Number(day.slice(8)) - 1
  return Math.floor((monthly * (i + 1)) / dim) - Math.floor((monthly * i) / dim)
}

// ---------- one day ----------
export type PartnerActivity = {
  deliveries: number
  onTime: number
  codPaise: Paise // cash collected from customers
  feesPaise: Paise // delivery fees earned
  revenuePaise: Paise // platform revenue (fees + commission on order value)
}

export function partnerDayPay(plan: PartnerPlan, day: string, a: PartnerActivity) {
  return {
    salaryPaise: dayShare(plan.salaryPaise, day),
    fixedPaise: dayShare(plan.fixedPaise, day),
    incentivePaise: a.deliveries * plan.perDeliveryPaise,
    commissionPaise: percentOf(a.feesPaise, plan.commissionPct),
  }
}

/** `managed` is the summed activity of the partners this admin manages on that day. */
export function adminDayPay(plan: AdminPlan, day: string, managed: PartnerActivity) {
  return {
    salaryPaise: dayShare(plan.salaryPaise, day),
    commissionPaise: percentOf(managed.revenuePaise, plan.commissionPct),
  }
}

/** Earned only once the cycle has closed and the on-time target was met. */
export function adminIncentive(
  plan: AdminPlan,
  deliveries: number,
  onTime: number,
  closed: boolean,
): Paise {
  if (!closed || deliveries === 0) return 0
  return (onTime / deliveries) * 100 >= plan.targetOnTimePct ? plan.incentivePaise : 0
}

// ---------- statements ----------
export type DayAccrual = PartnerActivity & {
  day: string
  salaryPaise: Paise
  fixedPaise: Paise
  incentivePaise: Paise
  commissionPaise: Paise
}
export type Adjustment = {
  kind: "bonus" | "deduction"
  amountPaise: Paise
  reason: string
  day: string
  by: string
}

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0)

function adjustmentLines(adjustments: Adjustment[]): PayoutLine[] {
  return adjustments.map((j) => ({
    label: j.kind === "bonus" ? "Bonus" : "Deduction",
    formula: `${j.reason} · ${j.day} · by ${j.by}`,
    amountPaise: j.kind === "bonus" ? j.amountPaise : -j.amountPaise,
  }))
}

export function partnerStatement(input: {
  cycle: string
  today: string
  history: PlanVersion<PartnerPlan>[]
  days: DayAccrual[]
  adjustments: Adjustment[]
  remittedPaise: Paise
}) {
  const { cycle, today, history, days } = input
  const dim = daysInCycle(cycle)
  const counted = days.length
  const last = days.at(-1)?.day ?? cycleDays(cycle, today).at(-1) ?? `${cycle}-01`
  const plan = planOn(history, last)
  const changed = history.some((v) => v.from > `${cycle}-01` && v.from <= last)
  const note = changed ? " · plan changed mid-cycle, accrued per day" : ""
  const deliveries = sum(days, (d) => d.deliveries)
  const fees = sum(days, (d) => d.feesPaise)
  const parts = {
    salary: sum(days, (d) => d.salaryPaise),
    fixed: sum(days, (d) => d.fixedPaise),
    incentive: sum(days, (d) => d.incentivePaise),
    commission: sum(days, (d) => d.commissionPaise),
  }

  const lines: PayoutLine[] = []
  if (plan.salaryPaise || parts.salary)
    lines.push({
      label: "Salary",
      formula: `${formatINR(plan.salaryPaise)}/month, accrued for ${counted} of ${dim} days${note}`,
      amountPaise: parts.salary,
    })
  if (plan.fixedPaise || parts.fixed)
    lines.push({
      label: "Fixed payment",
      formula: `${formatINR(plan.fixedPaise)}/month, accrued for ${counted} of ${dim} days${note}`,
      amountPaise: parts.fixed,
    })
  if (plan.perDeliveryPaise || parts.incentive)
    lines.push({
      label: "Per-delivery incentive",
      formula: `${deliveries} deliveries × ${formatINR(plan.perDeliveryPaise)}${note}`,
      amountPaise: parts.incentive,
    })
  if (plan.commissionPct || parts.commission)
    lines.push({
      label: "Commission",
      formula: `${plan.commissionPct}% of ${formatINR(fees)} delivery fees, rounded per day${note}`,
      amountPaise: parts.commission,
    })
  lines.push(...adjustmentLines(input.adjustments))

  const cod = sum(days, (d) => d.codPaise)
  return {
    lines,
    totalPaise: sum(lines, (l) => l.amountPaise),
    deliveries,
    codPaise: cod,
    remittedPaise: input.remittedPaise,
    outstandingPaise: cod - input.remittedPaise,
    parts,
  }
}

export function adminStatement(input: {
  cycle: string
  today: string
  history: PlanVersion<AdminPlan>[]
  /** One row per day: this admin's accrual plus the managed partners' summed activity. */
  days: (DayAccrual & { managedPartners: number })[]
  adjustments: Adjustment[]
}) {
  const { cycle, today, history, days } = input
  const dim = daysInCycle(cycle)
  const closed = isClosed(cycle, today)
  const plan = planOn(history, closed ? cycleEnd(cycle) : (days.at(-1)?.day ?? `${cycle}-01`))
  const deliveries = sum(days, (d) => d.deliveries)
  const onTime = sum(days, (d) => d.onTime)
  const revenue = sum(days, (d) => d.revenuePaise)
  const salary = sum(days, (d) => d.salaryPaise)
  const commission = sum(days, (d) => d.commissionPaise)
  const incentive = adminIncentive(plan, deliveries, onTime, closed)
  const pct = deliveries ? ((onTime / deliveries) * 100).toFixed(1) : "0.0"
  const managed = days.at(-1)?.managedPartners ?? 0

  const lines: PayoutLine[] = [
    {
      label: "Salary",
      formula: `${formatINR(plan.salaryPaise)}/month, accrued for ${days.length} of ${dim} days`,
      amountPaise: salary,
    },
    {
      label: "Commission",
      formula: `${plan.commissionPct}% of ${formatINR(revenue)} platform revenue from ${managed} managed partners, rounded per day`,
      amountPaise: commission,
    },
    {
      label: "Performance incentive",
      formula: closed
        ? `On-time ${pct}% vs target ${plan.targetOnTimePct}% · ${incentive ? "target met" : "target missed"}`
        : `Evaluated at cycle close · on-time ${pct}% so far vs target ${plan.targetOnTimePct}% (${formatINR(plan.incentivePaise)} if met)`,
      amountPaise: incentive,
    },
    ...adjustmentLines(input.adjustments),
  ]
  return {
    lines,
    totalPaise: sum(lines, (l) => l.amountPaise),
    deliveries,
    onTimeRate: deliveries ? onTime / deliveries : 0,
    revenuePaise: revenue,
    parts: { salary, fixed: 0, incentive, commission },
  }
}
