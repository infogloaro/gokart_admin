// Finance & payouts: daily accruals from real deliveries, statements built with the pure
// rules in ./rules, payouts frozen at generation and moved through
// pending approval → approved → paid → settled, with every change audited.
import {
  AdminPlan,
  businessName,
  formatINR,
  PartnerPlan,
  type AccountDetail,
  type AccountType,
  type AdminAccount,
  type CycleInfo,
  type FinanceAuditEntry,
  type FinanceOverview,
  type FinanceReportRow,
  type MoneyMovement,
  type PartnerAccount,
  type PayChangeRequestInfo,
  type PayoutDetail,
  type PayoutDisplayStatus,
  type PayoutSummary,
  type ReportPeriod,
  type Statement,
} from "@zoauro/shared"
import type { Payout } from "../../generated/prisma/client"
import { audit, type Actor } from "../../lib/audit"
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors"
import * as repo from "./finance.repository"
import { dateOnly, dayOf, istDay, istStart } from "./finance.repository"
import {
  adminDayPay,
  adminStatement,
  cycleDays,
  cycleEnd,
  cycleOf,
  daysInCycle,
  dueDateFor,
  isClosed,
  partnerDayPay,
  partnerStatement,
  planOn,
  type DayAccrual,
  type PlanVersion,
} from "./rules"

const ZERO_PARTNER: PartnerPlan = {
  salaryPaise: 0,
  fixedPaise: 0,
  perDeliveryPaise: 0,
  commissionPct: 0,
}
const ZERO_ADMIN: AdminPlan = {
  salaryPaise: 0,
  commissionPct: 0,
  targetOnTimePct: 100,
  incentivePaise: 0,
}

export const today = () => istDay(Date.now())
const shiftCycle = (cycle: string, n: number) => {
  const [y, m] = cycle.split("-").map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
const cycleLabel = (cycle: string) =>
  new Date(`${cycle}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

/** The current cycle and the two before it. */
export function cycles(): CycleInfo[] {
  const now = cycleOf(today())
  return [-2, -1, 0].map((n) => {
    const cycle = shiftCycle(now, n)
    return { cycle, label: cycleLabel(cycle), closed: isClosed(cycle, today()) }
  })
}
const cycleInfo = (cycle: string): CycleInfo => ({
  cycle,
  label: cycleLabel(cycle),
  closed: isClosed(cycle, today()),
})
function checkCycle(cycle: string) {
  if (!cycles().some((c) => c.cycle === cycle))
    throw badRequest("Choose one of the last three pay cycles.", { cycle: ["Unknown cycle"] })
}

// ---------- accounts ----------

type PartnerRow = Awaited<ReturnType<typeof repo.partners>>[number]
type AdminRow = Awaited<ReturnType<typeof repo.admins>>[number]

async function accounts() {
  const [partners, admins] = await Promise.all([repo.partners(), repo.admins()])
  // ADM-01, ADM-02 … in the order admins joined, for payout codes.
  const adminCode = new Map(admins.map((a, i) => [a.id, `ADM-${String(i + 1).padStart(2, "0")}`]))
  return { partners, admins, adminCode }
}

const history = <T>(rows: { effectiveFrom: Date; plan: unknown }[], fallback: T, first: string) =>
  rows.length
    ? rows.map((r) => ({ from: dayOf(r.effectiveFrom), plan: r.plan as T }))
    : [{ from: first, plan: fallback }]

// ---------- accruals ----------

const fresh = new Map<string, number>()
/** Forget cached accruals after anything that changes pay. */
export const invalidate = () => fresh.clear()

/**
 * Rebuilds a cycle's day-by-day accruals from delivered orders and the plan in effect each
 * day. Cheap enough to run on demand; recent results are reused for 20 seconds.
 */
export async function accrue(cycle: string) {
  if (Date.now() - (fresh.get(cycle) ?? 0) < 20_000) return
  const days = cycleDays(cycle, today())
  if (!days.length) return
  const first = days[0]!
  const last = days.at(-1)!
  const { partners, admins } = await accounts()
  const [activity, partnerPlans, adminPlans] = await Promise.all([
    repo.deliveredActivity(istStart(first), new Date(istStart(last).getTime() + 86_400_000)),
    repo.planVersions("partner"),
    repo.planVersions("admin"),
  ])
  const act = new Map(activity.map((a) => [`${a.partner}|${a.day}`, a]))
  const plansFor = <T>(rows: typeof partnerPlans, id: string, fallback: T) =>
    history(
      rows.filter((p) => p.accountId === id),
      fallback,
      `${cycle}-01`,
    ) as PlanVersion<T>[]

  const rows: repo.AccrualInput[] = []
  const managedByDay = new Map<
    string,
    {
      deliveries: number
      onTime: number
      revenuePaise: number
      feesPaise: number
      codPaise: number
    }
  >()
  for (const p of partners) {
    const plans = plansFor<PartnerPlan>(partnerPlans, p.id, ZERO_PARTNER)
    for (const day of days) {
      const a = act.get(`${p.id}|${day}`)
      const activityOf = {
        deliveries: a?.deliveries ?? 0,
        onTime: a?.on_time ?? 0,
        codPaise: Number(a?.cod ?? 0),
        feesPaise: Number(a?.fees ?? 0),
        revenuePaise: Number(a?.revenue ?? 0),
      }
      const pay = partnerDayPay(planOn(plans, day), day, activityOf)
      rows.push({
        accountType: "partner",
        accountId: p.id,
        day: dateOnly(day),
        ...pay,
        ...activityOf,
      })
      if (p.managedByAdminId) {
        const key = `${p.managedByAdminId}|${day}`
        const m = managedByDay.get(key) ?? {
          deliveries: 0,
          onTime: 0,
          revenuePaise: 0,
          feesPaise: 0,
          codPaise: 0,
        }
        m.deliveries += activityOf.deliveries
        m.onTime += activityOf.onTime
        m.revenuePaise += activityOf.revenuePaise
        m.feesPaise += activityOf.feesPaise
        m.codPaise += activityOf.codPaise
        managedByDay.set(key, m)
      }
    }
  }
  for (const a of admins) {
    const plans = plansFor<AdminPlan>(adminPlans, a.id, ZERO_ADMIN)
    for (const day of days) {
      const m = managedByDay.get(`${a.id}|${day}`) ?? {
        deliveries: 0,
        onTime: 0,
        revenuePaise: 0,
        feesPaise: 0,
        codPaise: 0,
      }
      const pay = adminDayPay(planOn(plans, day), day, m)
      rows.push({
        accountType: "admin",
        accountId: a.id,
        day: dateOnly(day),
        salaryPaise: pay.salaryPaise,
        commissionPaise: pay.commissionPaise,
        deliveries: m.deliveries,
        onTime: m.onTime,
        feesPaise: m.feesPaise,
        revenuePaise: m.revenuePaise,
      })
    }
  }
  await repo.replaceAccruals(cycle, first, last, rows)
  fresh.set(cycle, Date.now())
}

// ---------- statements ----------

const toDay = (r: Awaited<ReturnType<typeof repo.accruals>>[number]): DayAccrual => ({
  day: dayOf(r.day),
  deliveries: r.deliveries,
  onTime: r.onTime,
  codPaise: r.codPaise,
  feesPaise: r.feesPaise,
  revenuePaise: r.revenuePaise,
  salaryPaise: r.salaryPaise,
  fixedPaise: r.fixedPaise,
  incentivePaise: r.incentivePaise,
  commissionPaise: r.commissionPaise,
})

type Inputs = Awaited<ReturnType<typeof loadInputs>>

/** Everything statements need for one cycle, fetched once. */
async function loadInputs(cycle: string) {
  await accrue(cycle)
  const from = `${cycle}-01`
  const to = cycleEnd(cycle)
  const [acc, partnerAcc, adminAcc, partnerPlans, adminPlans, adjustments, remits] =
    await Promise.all([
      accounts(),
      repo.accruals("partner", from, to),
      repo.accruals("admin", from, to),
      repo.planVersions("partner"),
      repo.planVersions("admin"),
      repo.adjustments(cycle),
      repo.remittances({ cycle }),
    ])
  const names = new Map(
    (await repo.memberNames([...new Set(adjustments.map((a) => a.createdById))])).map((m) => [
      m.id,
      m.name,
    ]),
  )
  return {
    cycle,
    ...acc,
    partnerAcc,
    adminAcc,
    partnerPlans,
    adminPlans,
    adjustments,
    remits,
    names,
  }
}

function adjustmentsFor(inp: Inputs, type: AccountType, id: string) {
  return inp.adjustments
    .filter((a) => a.accountType === type && a.accountId === id)
    .map((a) => ({
      kind: a.kind,
      amountPaise: a.amountPaise,
      reason: a.reason,
      day: dayOf(a.day),
      by: inp.names.get(a.createdById) ?? "Super Admin",
    }))
}

function partnerStatementOf(inp: Inputs, p: PartnerRow): Statement {
  const days = inp.partnerAcc.filter((r) => r.accountId === p.id).map(toDay)
  const adj = adjustmentsFor(inp, "partner", p.id)
  const remitted = inp.remits
    .filter((r) => r.partnerId === p.id)
    .reduce((t, r) => t + r.amountPaise, 0)
  const st = partnerStatement({
    cycle: inp.cycle,
    today: today(),
    history: history(
      inp.partnerPlans.filter((x) => x.accountId === p.id),
      ZERO_PARTNER,
      `${inp.cycle}-01`,
    ),
    days,
    adjustments: adj,
    remittedPaise: remitted,
  })
  return {
    lines: st.lines,
    totalPaise: st.totalPaise,
    deliveries: st.deliveries,
    salaryPaise: st.parts.salary,
    fixedPaise: st.parts.fixed,
    incentivePaise: st.parts.incentive,
    commissionPaise: st.parts.commission,
    bonusPaise: adj.filter((a) => a.kind === "bonus").reduce((t, a) => t + a.amountPaise, 0),
    deductionPaise: adj
      .filter((a) => a.kind === "deduction")
      .reduce((t, a) => t + a.amountPaise, 0),
    codPaise: st.codPaise,
    remittedPaise: st.remittedPaise,
    outstandingPaise: st.outstandingPaise,
    feesPaise: days.reduce((t, d) => t + d.feesPaise, 0),
    revenuePaise: days.reduce((t, d) => t + d.revenuePaise, 0),
    onTimeRate: st.deliveries ? days.reduce((t, d) => t + d.onTime, 0) / st.deliveries : 0,
    managedPartners: 0,
  }
}

function adminStatementOf(inp: Inputs, a: AdminRow): Statement {
  const managed = inp.partners.filter((p) => p.managedByAdminId === a.id).length
  const days = inp.adminAcc
    .filter((r) => r.accountId === a.id)
    .map((r) => ({ ...toDay(r), managedPartners: managed }))
  const adj = adjustmentsFor(inp, "admin", a.id)
  const st = adminStatement({
    cycle: inp.cycle,
    today: today(),
    history: history(
      inp.adminPlans.filter((x) => x.accountId === a.id),
      ZERO_ADMIN,
      `${inp.cycle}-01`,
    ),
    days,
    adjustments: adj,
  })
  return {
    lines: st.lines,
    totalPaise: st.totalPaise,
    deliveries: st.deliveries,
    salaryPaise: st.parts.salary,
    fixedPaise: 0,
    incentivePaise: st.parts.incentive,
    commissionPaise: st.parts.commission,
    bonusPaise: adj.filter((x) => x.kind === "bonus").reduce((t, x) => t + x.amountPaise, 0),
    deductionPaise: adj
      .filter((x) => x.kind === "deduction")
      .reduce((t, x) => t + x.amountPaise, 0),
    codPaise: 0,
    remittedPaise: 0,
    outstandingPaise: 0,
    feesPaise: days.reduce((t, d) => t + d.feesPaise, 0),
    revenuePaise: st.revenuePaise,
    onTimeRate: st.onTimeRate,
    managedPartners: managed,
  }
}

// ---------- payouts ----------

const displayStatus = (p: Payout): PayoutDisplayStatus =>
  (p.status === "pending_approval" || p.status === "approved") && dayOf(p.dueDate) < today()
    ? "overdue"
    : p.status

async function nameMaps() {
  const { partners, admins } = await accounts()
  return {
    partner: new Map(partners.map((p) => [p.id, p.name])),
    admin: new Map(admins.map((a) => [a.id, a.name])),
  }
}
type Names = Awaited<ReturnType<typeof nameMaps>>

async function summaries(rows: Payout[], names?: Names): Promise<PayoutSummary[]> {
  const n = names ?? (await nameMaps())
  const people = new Map(
    (
      await repo.memberNames([
        ...new Set(
          rows.flatMap(
            (p) => [p.createdById, p.approvedById, p.rejectedById].filter(Boolean) as string[],
          ),
        ),
      ])
    ).map((m) => [m.id, m.name]),
  )
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    accountType: p.accountType as AccountType,
    accountId: p.accountId,
    accountName:
      (p.accountType === "partner" ? n.partner : n.admin).get(p.accountId) ?? p.accountId,
    cycle: p.cycle,
    amountPaise: p.amountPaise,
    status: p.status,
    displayStatus: displayStatus(p),
    version: p.version,
    dueDate: dayOf(p.dueDate),
    createdAt: p.createdAt.toISOString(),
    createdBy: people.get(p.createdById) ?? "Super Admin",
    approvedAt: p.approvedAt?.toISOString() ?? null,
    approvedBy: p.approvedById ? (people.get(p.approvedById) ?? null) : null,
    paidAt: p.paidAt?.toISOString() ?? null,
    paidRef: p.paidRef,
    paidMethod: p.paidMethod,
    settledAt: p.settledAt?.toISOString() ?? null,
    rejectedBy: p.rejectedById ? (people.get(p.rejectedById) ?? null) : null,
    rejectedReason: p.rejectedReason,
  }))
}

const bankText = (b?: { bankName: string | null; upiId: string | null; last4: string }) =>
  b ? `${b.bankName ?? (b.upiId ? "UPI" : "Bank")} ••${b.last4}` : "No bank account"

export async function overview(cycle: string): Promise<FinanceOverview> {
  checkCycle(cycle)
  const inp = await loadInputs(cycle)
  const [partnerBanks, adminBanks, payouts] = await Promise.all([
    repo.bankAccounts(
      "partner",
      inp.partners.map((p) => p.id),
    ),
    repo.bankAccounts(
      "admin",
      inp.admins.map((a) => a.id),
    ),
    repo.payouts({ cycle, status: { not: "rejected" } }),
  ])
  const names: Names = {
    partner: new Map(inp.partners.map((p) => [p.id, p.name])),
    admin: new Map(inp.admins.map((a) => [a.id, a.name])),
  }
  const sums = await summaries(payouts, names)
  const payoutOf = (type: AccountType, id: string) =>
    sums.find((p) => p.accountType === type && p.accountId === id) ?? null
  const plansNow = (rows: typeof inp.partnerPlans, id: string) =>
    rows.filter((r) => r.accountId === id)

  const partners: PartnerAccount[] = inp.partners.map((p) => {
    const last = inp.remits.find((r) => r.partnerId === p.id)
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      business: p.businesses[0]?.business ?? "food",
      managerId: p.managedByAdminId,
      managerName: p.managedByAdminId ? (names.admin.get(p.managedByAdminId) ?? null) : null,
      bank: bankText(partnerBanks.find((b) => b.accountId === p.id)),
      plan: planOn(history(plansNow(inp.partnerPlans, p.id), ZERO_PARTNER, `${cycle}-01`), today()),
      statement: partnerStatementOf(inp, p),
      payout: payoutOf("partner", p.id),
      lastRemittance: last ? { day: dayOf(last.day), method: last.method } : null,
    }
  })
  const admins: AdminAccount[] = inp.admins.map((a) => {
    const districts = [...new Set(a.zones.map((z) => z.zone.district))]
    return {
      id: a.id,
      code: inp.adminCode.get(a.id)!,
      name: a.name,
      region: `${districts.slice(0, 2).join(", ") || "All zones"} · ${a.businesses.map((b) => businessName[b.business]).join(" & ")}`,
      bank: bankText(adminBanks.find((b) => b.accountId === a.id)),
      plan: planOn(history(plansNow(inp.adminPlans, a.id), ZERO_ADMIN, `${cycle}-01`), today()),
      statement: adminStatementOf(inp, a),
      payout: payoutOf("admin", a.id),
    }
  })
  return { cycle: cycleInfo(cycle), today: today(), dueDate: dueDateFor(cycle), partners, admins }
}

export async function account(
  type: AccountType,
  id: string,
  cycle: string,
): Promise<AccountDetail> {
  checkCycle(cycle)
  const inp = await loadInputs(cycle)
  const p = type === "partner" ? inp.partners.find((x) => x.id === id) : undefined
  const a = type === "admin" ? inp.admins.find((x) => x.id === id) : undefined
  if (!p && !a) throw notFound("Account")
  const [plans, payouts, remits, bank] = await Promise.all([
    repo.planVersions(type, [id]),
    repo.payouts({ accountType: type, accountId: id }),
    type === "partner" ? repo.remittances({ partnerId: id }) : Promise.resolve([]),
    repo.bankAccounts(type, [id]),
  ])
  const people = new Map(
    (
      await repo.memberNames([
        ...new Set([...plans.map((x) => x.createdById), ...remits.map((r) => r.receivedBy)]),
      ])
    ).map((m) => [m.id, m.name]),
  )
  return {
    accountType: type,
    id,
    name: (p ?? a)!.name,
    bank: bankText(bank[0]),
    cycle: cycleInfo(cycle),
    statement: p ? partnerStatementOf(inp, p) : adminStatementOf(inp, a!),
    planHistory: [...plans].reverse().map((v) => ({
      from: dayOf(v.effectiveFrom),
      plan: v.plan as PartnerPlan | AdminPlan,
      by: people.get(v.createdById) ?? "Super Admin",
      reason: v.reason,
    })),
    payouts: await summaries(payouts),
    remittances: remits.slice(0, 20).map((r) => ({
      id: r.id,
      cycle: r.cycle,
      day: dayOf(r.day),
      amountPaise: r.amountPaise,
      method: r.method,
      receivedBy: people.get(r.receivedBy) ?? "Super Admin",
    })),
  }
}

export async function listPayouts(q: {
  cycle?: string | undefined
  accountType?: AccountType | undefined
  status?: PayoutDisplayStatus | undefined
}) {
  const rows = await repo.payouts({
    ...(q.cycle && { cycle: q.cycle }),
    ...(q.accountType && { accountType: q.accountType }),
  })
  const list = await summaries(rows)
  return q.status ? list.filter((p) => p.displayStatus === q.status) : list
}

export async function getPayout(id: string): Promise<PayoutDetail> {
  const p = await repo.payout(id)
  if (!p) throw notFound("Payout")
  const [s] = await summaries([p])
  return {
    ...s!,
    lines: p.lines.map((l) => ({ label: l.label, formula: l.formula, amountPaise: l.amountPaise })),
  }
}

/** Freezes each account's statement for the cycle into a payout awaiting approval. */
export async function generate(cycle: string, actor: Actor) {
  checkCycle(cycle)
  fresh.delete(cycle)
  const inp = await loadInputs(cycle)
  const existing = await repo.payouts({ cycle })
  const has = (type: AccountType, id: string) =>
    existing.some((p) => p.accountType === type && p.accountId === id)
  const statements = [
    ...inp.partners
      .filter((p) => !has("partner", p.id))
      .map((p) => ({
        type: "partner" as const,
        id: p.id,
        code: `PPO-${cycle.replace("-", "")}-${p.code.replace("-", "")}`,
        st: partnerStatementOf(inp, p),
      })),
    ...inp.admins
      .filter((a) => !has("admin", a.id))
      .map((a) => ({
        type: "admin" as const,
        id: a.id,
        code: `APO-${cycle.replace("-", "")}-${inp.adminCode.get(a.id)!.replace("-", "")}`,
        st: adminStatementOf(inp, a),
      })),
  ].filter((x) => x.st.totalPaise > 0)
  if (!statements.length)
    throw conflict("Every account with earnings already has a payout for this cycle.")
  await repo.prisma.$transaction(async (tx) => {
    for (const s of statements)
      await tx.payout.create({
        data: {
          code: s.code,
          accountType: s.type,
          accountId: s.id,
          cycle,
          amountPaise: s.st.totalPaise,
          dueDate: dateOnly(dueDateFor(cycle)),
          createdById: actor.id!,
          lines: { create: s.st.lines.map((l, i) => ({ position: i, ...l })) },
        },
      })
    await audit(
      tx,
      actor,
      "finance.payouts_generated",
      { type: "cycle", id: cycle },
      {
        summary: `${cycleLabel(cycle)} · ${statements.filter((s) => s.type === "partner").length} partner and ${statements.filter((s) => s.type === "admin").length} admin payouts · ${formatINR(statements.reduce((t, s) => t + s.st.totalPaise, 0))}${isClosed(cycle, today()) ? "" : ` · cycle open, calculated to ${today()}`}`,
      },
    )
  })
  return { created: statements.length }
}

async function loadPayout(id: string) {
  const p = await repo.payout(id)
  if (!p) throw notFound("Payout")
  return p
}
const staleMsg = "This payout changed while you were looking at it. Reload and try again."

export async function approve(id: string, version: number, actor: Actor) {
  const p = await loadPayout(id)
  await repo.prisma.$transaction(async (tx) => {
    if (
      !(await repo.transition(tx, id, version, ["pending_approval"], {
        status: "approved",
        approvedById: actor.id,
        approvedAt: new Date(),
      }))
    )
      throw conflict(staleMsg)
    await audit(
      tx,
      actor,
      "finance.payout_approved",
      { type: "payout", id },
      { summary: `${p.code} · ${formatINR(p.amountPaise)}` },
    )
  })
  return getPayout(id)
}

export async function reject(id: string, version: number, reason: string, actor: Actor) {
  const p = await loadPayout(id)
  await repo.prisma.$transaction(async (tx) => {
    if (
      !(await repo.transition(tx, id, version, ["pending_approval", "approved"], {
        status: "rejected",
        rejectedById: actor.id,
        rejectedReason: reason,
      }))
    )
      throw conflict(staleMsg)
    await audit(
      tx,
      actor,
      "finance.payout_rejected",
      { type: "payout", id },
      { summary: `${p.code} · ${reason}` },
    )
  })
  return getPayout(id)
}

/** A paid payout is settled once nothing is owed back: partners must have remitted all cash. */
async function settleIfClear(id: string) {
  const p = await repo.payout(id)
  if (!p || p.status !== "paid") return
  if (p.accountType === "partner") {
    fresh.delete(p.cycle)
    const inp = await loadInputs(p.cycle)
    const partner = inp.partners.find((x) => x.id === p.accountId)
    if (partner && partnerStatementOf(inp, partner).outstandingPaise > 0) return
  }
  await repo.transition(repo.prisma, id, p.version, ["paid"], {
    status: "settled",
    settledAt: new Date(),
  })
}

export async function pay(
  id: string,
  body: { version: number; reference: string; method: string },
  actor: Actor,
) {
  const p = await loadPayout(id)
  await repo.prisma.$transaction(async (tx) => {
    if (
      !(await repo.transition(tx, id, body.version, ["approved"], {
        status: "paid",
        paidAt: new Date(),
        paidRef: body.reference,
        paidMethod: body.method,
      }))
    )
      throw conflict(staleMsg)
    await audit(
      tx,
      actor,
      "finance.payout_paid",
      { type: "payout", id },
      {
        summary: `${p.code} · ${formatINR(p.amountPaise)} · ${body.method} · ${body.reference}`,
      },
    )
  })
  await settleIfClear(id)
  return getPayout(id)
}

/** After a rejection: recalculate from current data and send for approval again. */
export async function recalculate(id: string, version: number, actor: Actor) {
  const p = await loadPayout(id)
  if (p.status !== "rejected") throw conflict("Only rejected payouts can be recalculated.")
  fresh.delete(p.cycle)
  const inp = await loadInputs(p.cycle)
  const partner = inp.partners.find((x) => x.id === p.accountId)
  const admin = inp.admins.find((x) => x.id === p.accountId)
  const st =
    p.accountType === "partner" && partner
      ? partnerStatementOf(inp, partner)
      : admin
        ? adminStatementOf(inp, admin)
        : null
  if (!st) throw notFound("Account")
  await repo.prisma.$transaction(async (tx) => {
    if (
      !(await repo.transition(tx, id, version, ["rejected"], {
        status: "pending_approval",
        amountPaise: st.totalPaise,
        rejectedById: null,
        rejectedReason: null,
        approvedById: null,
        approvedAt: null,
        createdById: actor.id!,
        createdAt: new Date(),
      }))
    )
      throw conflict(staleMsg)
    await tx.payoutLine.deleteMany({ where: { payoutId: id } })
    await tx.payoutLine.createMany({
      data: st.lines.map((l, i) => ({ payoutId: id, position: i, ...l })),
    })
    await audit(
      tx,
      actor,
      "finance.payout_recalculated",
      { type: "payout", id },
      {
        summary: `${p.code} · ${formatINR(p.amountPaise)} → ${formatINR(st.totalPaise)}`,
      },
    )
  })
  return getPayout(id)
}

// ---------- cash, adjustments, plans ----------

export async function remit(
  body: { partnerId: string; cycle: string; amountPaise: number; method: string },
  actor: Actor,
) {
  checkCycle(body.cycle)
  fresh.delete(body.cycle)
  const inp = await loadInputs(body.cycle)
  const partner = inp.partners.find((p) => p.id === body.partnerId)
  if (!partner) throw notFound("Partner")
  const owed = partnerStatementOf(inp, partner).outstandingPaise
  if (body.amountPaise > owed)
    throw badRequest(`Only ${formatINR(owed)} is still to be remitted.`, {
      amountPaise: ["Too much"],
    })
  await repo.prisma.$transaction(async (tx) => {
    await tx.remittance.create({
      data: {
        partnerId: partner.id,
        cycle: body.cycle,
        day: dateOnly(today()),
        amountPaise: body.amountPaise,
        method: body.method,
        receivedBy: actor.id!,
      },
    })
    await audit(
      tx,
      actor,
      "finance.cash_remitted",
      { type: "partner", id: partner.id },
      {
        summary: `${partner.name} · ${formatINR(body.amountPaise)} · ${body.method} · ${cycleLabel(body.cycle)}`,
      },
    )
  })
  for (const p of await repo.payouts({
    accountType: "partner",
    accountId: partner.id,
    cycle: body.cycle,
    status: "paid",
  }))
    await settleIfClear(p.id)
}

export async function adjust(
  body: {
    accountType: AccountType
    accountId: string
    kind: "bonus" | "deduction"
    amountPaise: number
    reason: string
  },
  actor: Actor,
) {
  const cycle = cycleOf(today())
  const { partners, admins } = await accounts()
  const acct = (body.accountType === "partner" ? partners : admins).find(
    (a) => a.id === body.accountId,
  )
  if (!acct) throw notFound("Account")
  const locked = await repo.payouts({
    accountType: body.accountType,
    accountId: body.accountId,
    cycle,
    status: { not: "rejected" },
  })
  if (locked.length)
    throw conflict(
      `${cycleLabel(cycle)} payouts already exist for this account; reject the payout first to change its amounts.`,
    )
  await repo.prisma.$transaction(async (tx) => {
    await tx.adjustment.create({
      data: { ...body, cycle, day: dateOnly(today()), createdById: actor.id! },
    })
    await audit(
      tx,
      actor,
      body.kind === "bonus" ? "finance.bonus_added" : "finance.deduction_added",
      { type: body.accountType, id: body.accountId },
      {
        summary: `${acct.name} · ${formatINR(body.amountPaise)} · ${body.reason} · ${cycleLabel(cycle)}`,
      },
    )
  })
}

const partnerPlanText = (p: PartnerPlan) =>
  [
    p.salaryPaise && `${formatINR(p.salaryPaise)}/mo salary`,
    p.fixedPaise && `${formatINR(p.fixedPaise)}/mo fixed`,
    p.perDeliveryPaise && `${formatINR(p.perDeliveryPaise)}/delivery`,
    p.commissionPct && `${p.commissionPct}% of fees`,
  ]
    .filter(Boolean)
    .join(" + ") || "No pay configured"
const adminPlanText = (p: AdminPlan) =>
  `${formatINR(p.salaryPaise)}/mo + ${p.commissionPct}% commission + ${formatINR(p.incentivePaise)} at ≥${p.targetOnTimePct}% on-time`
const planText = (type: AccountType, plan: PartnerPlan | AdminPlan) =>
  type === "partner" ? partnerPlanText(plan as PartnerPlan) : adminPlanText(plan as AdminPlan)

function parsePlan(type: AccountType, plan: unknown) {
  const r = (type === "partner" ? PartnerPlan : AdminPlan).safeParse(plan)
  if (!r.success) throw badRequest("Those pay settings aren't valid for this account type.")
  return r.data
}

export async function setPlan(
  type: AccountType,
  id: string,
  plan: unknown,
  reason: string,
  actor: Actor,
) {
  const parsed = parsePlan(type, plan)
  const { partners, admins } = await accounts()
  const acct = (type === "partner" ? partners : admins).find((a) => a.id === id)
  if (!acct) throw notFound("Account")
  const before = planOn(
    history(
      await repo.planVersions(type, [id]),
      type === "partner" ? ZERO_PARTNER : ZERO_ADMIN,
      today(),
    ),
    today(),
  )
  await repo.prisma.$transaction(async (tx) => {
    await repo.setPlan(tx, type, id, today(), parsed, reason, actor.id!)
    await audit(
      tx,
      actor,
      type === "partner" ? "finance.partner_pay_changed" : "finance.admin_pay_changed",
      { type, id },
      {
        summary: `${acct.name} · ${planText(type, before)} → ${planText(type, parsed)} · effective ${today()} · ${reason}`,
      },
    )
  })
  invalidate()
}

// ---------- change requests ----------

export async function requests(): Promise<PayChangeRequestInfo[]> {
  const [rows, names] = await Promise.all([repo.changeRequests(), nameMaps()])
  const people = new Map(
    (
      await repo.memberNames([
        ...new Set(
          rows.flatMap((r) => [r.requestedById, r.decidedById].filter(Boolean) as string[]),
        ),
      ])
    ).map((m) => [m.id, m.name]),
  )
  const [pp, ap] = await Promise.all([repo.planVersions("partner"), repo.planVersions("admin")])
  return rows.map((r, i) => {
    const type = r.accountType as AccountType
    const versions = (type === "partner" ? pp : ap).filter((v) => v.accountId === r.accountId)
    return {
      id: r.id,
      code: `PCR-${String(rows.length - i).padStart(3, "0")}`,
      accountType: type,
      accountId: r.accountId,
      accountName:
        (type === "partner" ? names.partner : names.admin).get(r.accountId) ?? r.accountId,
      currentPlan: versions.length
        ? (planOn(history<unknown>(versions, null, today()), today()) as PartnerPlan | AdminPlan)
        : null,
      plan: r.plan as PartnerPlan | AdminPlan,
      reason: r.reason,
      requestedBy: people.get(r.requestedById) ?? "Admin",
      status: r.status,
      decidedBy: r.decidedById ? (people.get(r.decidedById) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    }
  })
}

/** Admins propose pay changes for partners they manage; Super Admins decide. */
export async function requestChange(
  body: { accountType: AccountType; accountId: string; plan: unknown; reason: string },
  actor: Actor,
  role: string,
) {
  const plan = parsePlan(body.accountType, body.plan)
  const { partners } = await accounts()
  if (role !== "super_admin") {
    const p = partners.find((x) => x.id === body.accountId)
    if (body.accountType !== "partner" || !p || p.managedByAdminId !== actor.id)
      throw forbidden("You can only request pay changes for delivery partners you manage.")
  }
  await repo.prisma.$transaction(async (tx) => {
    const r = await tx.payChangeRequest.create({
      data: {
        accountType: body.accountType,
        accountId: body.accountId,
        plan,
        reason: body.reason,
        requestedById: actor.id!,
      },
    })
    await audit(
      tx,
      actor,
      "finance.pay_change_requested",
      { type: "pay_change_request", id: r.id },
      {
        summary: `${planText(body.accountType, plan)} · ${body.reason}`,
      },
    )
  })
}

export async function decide(
  id: string,
  approveIt: boolean,
  reason: string | undefined,
  actor: Actor,
) {
  const r = await repo.prisma.payChangeRequest.findUnique({ where: { id } })
  if (!r) throw notFound("Request")
  await repo.prisma.$transaction(async (tx) => {
    const done = await tx.payChangeRequest.updateMany({
      where: { id, status: "pending" },
      data: {
        status: approveIt ? "approved" : "rejected",
        decidedById: actor.id,
        decidedAt: new Date(),
      },
    })
    if (!done.count) throw conflict("This request has already been decided.")
    const type = r.accountType as AccountType
    if (approveIt)
      await repo.setPlan(
        tx,
        type,
        r.accountId,
        today(),
        parsePlan(type, r.plan),
        `Change request: ${r.reason}`,
        actor.id!,
      )
    await audit(
      tx,
      actor,
      approveIt ? "finance.pay_change_approved" : "finance.pay_change_rejected",
      { type: "pay_change_request", id },
      {
        summary: `${planText(type, r.plan as PartnerPlan | AdminPlan)}${reason ? ` · ${reason}` : ""}`,
      },
    )
  })
  invalidate()
}

// ---------- history, reports, audit ----------

export async function movements(): Promise<MoneyMovement[]> {
  const [paid, remits, names] = await Promise.all([
    repo.payouts({ paidAt: { not: null } }),
    repo.remittances({}),
    nameMaps(),
  ])
  return [
    ...paid.map((p) => ({
      day: istDay(p.paidAt!),
      reference: p.paidRef ?? p.code,
      kind: p.accountType === "partner" ? ("partner_payout" as const) : ("admin_payout" as const),
      accountName:
        (p.accountType === "partner" ? names.partner : names.admin).get(p.accountId) ?? p.accountId,
      detail: `${p.code} · ${p.paidMethod ?? ""}`,
      amountPaise: -p.amountPaise,
    })),
    ...remits.map((r) => ({
      day: dayOf(r.day),
      reference: `RMT-${r.id.slice(-6).toUpperCase()}`,
      kind: "cash_remittance" as const,
      accountName: names.partner.get(r.partnerId) ?? r.partnerId,
      detail: `${cycleLabel(r.cycle)} collections · ${r.method}`,
      amountPaise: r.amountPaise,
    })),
  ].sort((a, b) => b.day.localeCompare(a.day) || a.reference.localeCompare(b.reference))
}

const addDays = (day: string, n: number) =>
  istDay(istStart(day).getTime() + n * 86_400_000 + 3_600_000)
const fmt = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })

/** Daily (14 days), weekly (8 weeks) or monthly (3 cycles), summed from daily accruals. */
export async function report(period: ReportPeriod): Promise<FinanceReportRow[]> {
  const cs = cycles()
  for (const c of cs) await accrue(c.cycle)
  const start = `${cs[0]!.cycle}-01`
  const end = today()
  const [partnerRows, adminRows] = await Promise.all([
    repo.accruals("partner", start, end),
    repo.accruals("admin", start, end),
  ])
  const byDay = new Map<string, { col: number; rev: number; pc: number; ac: number }>()
  const at = (d: string) => byDay.get(d) ?? byDay.set(d, { col: 0, rev: 0, pc: 0, ac: 0 }).get(d)!
  for (const r of partnerRows) {
    const x = at(dayOf(r.day))
    x.col += r.codPaise
    x.rev += r.revenuePaise
    x.pc += r.salaryPaise + r.fixedPaise + r.incentivePaise + r.commissionPaise
  }
  for (const r of adminRows) at(dayOf(r.day)).ac += r.salaryPaise + r.commissionPaise

  const groups: { label: string; from: string; to: string; days: string[] }[] = []
  if (period === "daily")
    for (let i = 13; i >= 0; i--) {
      const d = addDays(end, -i)
      if (d >= start) groups.push({ label: fmt(d), from: d, to: d, days: [d] })
    }
  else if (period === "weekly") {
    const dow = (new Date(`${end}T00:00:00Z`).getUTCDay() + 6) % 7
    const monday = addDays(end, -dow)
    for (let i = 7; i >= 0; i--) {
      const s = addDays(monday, -7 * i)
      const days = Array.from({ length: 7 }, (_, k) => addDays(s, k)).filter(
        (d) => d >= start && d <= end,
      )
      if (days.length)
        groups.push({
          label: `${fmt(days[0]!)} – ${fmt(days.at(-1)!)}`,
          from: days[0]!,
          to: days.at(-1)!,
          days,
        })
    }
  } else
    for (const c of cs) {
      const days = cycleDays(c.cycle, end)
      if (days.length)
        groups.push({
          label: `${c.label}${c.closed ? "" : " (to date)"}`,
          from: days[0]!,
          to: days.at(-1)!,
          days,
        })
    }
  return groups.map((g) => {
    const t = { col: 0, rev: 0, pc: 0, ac: 0 }
    for (const d of g.days) {
      const x = byDay.get(d)
      if (!x) continue
      t.col += x.col
      t.rev += x.rev
      t.pc += x.pc
      t.ac += x.ac
    }
    return {
      label: g.label,
      from: g.from,
      to: g.to,
      collectionsPaise: t.col,
      revenuePaise: t.rev,
      partnerCostPaise: t.pc,
      adminCostPaise: t.ac,
      netPaise: t.rev - t.pc - t.ac,
    }
  })
}

export async function auditTrail(): Promise<FinanceAuditEntry[]> {
  const rows = await repo.financeAudit()
  const label = (a: string) =>
    a
      .replace(/^finance\./, "")
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
  return rows.map((r) => ({
    at: r.at.toISOString(),
    actor: r.actorName,
    action: label(r.action),
    detail: ((r.detail as { summary?: string } | null)?.summary ?? "").toString(),
  }))
}

export { cycleLabel, daysInCycle }
