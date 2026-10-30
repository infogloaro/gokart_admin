const DAY_MS = 24 * 60 * 60 * 1000

export const ON_TIME_SLA_MINUTES = 45
export const PAYOUT_DUE_DAY = 5

export interface DateRange {
  start: Date
  end: Date
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  return Number(value)
}

export function round(value: number): number {
  return Math.round(value)
}

export function formatPlainInr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`
}

export function cycleKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

export function parseCycleKey(key: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) - 1 }
}

export function cycleLabel(key: string): string {
  const parsed = parseCycleKey(key)
  if (!parsed) return key
  return new Date(Date.UTC(parsed.year, parsed.month, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function cycleRange(key: string, now = new Date()): DateRange & { open: boolean } {
  const parsed = parseCycleKey(key)
  if (!parsed) throw Object.assign(new Error("cycle must be YYYY-MM"), { status: 400 })
  const start = new Date(Date.UTC(parsed.year, parsed.month, 1))
  const monthEnd = new Date(Date.UTC(parsed.year, parsed.month + 1, 1) - 1)
  const open = now.getTime() <= monthEnd.getTime()
  return { start, end: open ? now : monthEnd, open }
}

export function cycleDueDate(key: string): Date {
  const parsed = parseCycleKey(key)!
  return new Date(Date.UTC(parsed.year, parsed.month + 1, PAYOUT_DUE_DAY))
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/**
 * Salary and fixed pay accrue daily: each day counts as 1 / (days in that month),
 * so a full calendar month is exactly 1.0 and a partial month is prorated.
 */
export function accrualFactor(range: DateRange): number {
  const cursor = new Date(
    Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), range.start.getUTCDate()),
  )
  const last = Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth(), range.end.getUTCDate())
  let factor = 0
  while (cursor.getTime() <= last) {
    factor += 1 / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth())
    cursor.setTime(cursor.getTime() + DAY_MS)
  }
  return factor
}

export function inRange(date: Date | null | undefined, range: DateRange): boolean {
  return !!date && date.getTime() >= range.start.getTime() && date.getTime() <= range.end.getTime()
}

export interface PartnerPlan {
  monthlySalary: number
  fixedPay: number
  perDeliveryRate: number
  feeSharePercent: number
}

export interface PartnerEarnings {
  deliveries: number
  salary: number
  fixed: number
  perDelivery: number
  commission: number
  bonus: number
  deductions: number
  earnings: number
}

export function computePartnerEarnings(input: {
  plan: PartnerPlan
  deliveries: number
  deliveryFees: number
  factor: number
  bonus: number
  deductions: number
}): PartnerEarnings {
  const { plan, deliveries, deliveryFees, factor, bonus, deductions } = input
  const salary = round(plan.monthlySalary * factor)
  const fixed = round(plan.fixedPay * factor)
  const perDelivery = round(plan.perDeliveryRate * deliveries)
  const commission = round((plan.feeSharePercent / 100) * deliveryFees)
  return {
    deliveries,
    salary,
    fixed,
    perDelivery,
    commission,
    bonus,
    deductions,
    earnings: salary + fixed + perDelivery + commission + bonus - deductions,
  }
}

export interface AdminPlan {
  monthlySalary: number
  commissionPercent: number
  incentiveAmount: number
  onTimeThreshold: number
}

export interface AdminEarnings {
  partners: number
  onTimePercent: number
  salary: number
  commission: number
  incentive: number
  incentiveEligible: boolean
  bonus: number
  deductions: number
  earnings: number
}

export function computeAdminEarnings(input: {
  plan: AdminPlan
  partners: number
  delivered: number
  onTime: number
  managedPlatformRevenue: number
  factor: number
  cycleClosed: boolean
  bonus: number
  deductions: number
}): AdminEarnings {
  const { plan, factor } = input
  const onTimePercent = input.delivered > 0 ? (input.onTime / input.delivered) * 100 : 0
  const incentiveEligible = onTimePercent >= plan.onTimeThreshold && plan.incentiveAmount > 0
  const salary = round(plan.monthlySalary * factor)
  const commission = round((plan.commissionPercent / 100) * input.managedPlatformRevenue)
  const incentive = input.cycleClosed && incentiveEligible ? round(plan.incentiveAmount) : 0
  return {
    partners: input.partners,
    onTimePercent: Math.round(onTimePercent * 10) / 10,
    salary,
    commission,
    incentive,
    incentiveEligible,
    bonus: input.bonus,
    deductions: input.deductions,
    earnings: salary + commission + incentive + input.bonus - input.deductions,
  }
}

export function isOnTime(acceptedAt: Date | null, deliveredAt: Date | null): boolean {
  if (!acceptedAt || !deliveredAt) return false
  return (deliveredAt.getTime() - acceptedAt.getTime()) / 60000 <= ON_TIME_SLA_MINUTES
}

export function partnerPlanLabel(plan: PartnerPlan): string {
  const parts: string[] = []
  if (plan.monthlySalary > 0) parts.push(`${formatPlainInr(plan.monthlySalary)}/mo salary`)
  if (plan.fixedPay > 0) parts.push(`${formatPlainInr(plan.fixedPay)}/mo fixed`)
  if (plan.perDeliveryRate > 0) parts.push(`${formatPlainInr(plan.perDeliveryRate)}/delivery`)
  if (plan.feeSharePercent > 0) parts.push(`${plan.feeSharePercent}% of fees`)
  return parts.length > 0 ? parts.join(" + ") : "No pay plan"
}

export function adminPlanLabel(plan: AdminPlan): string {
  const parts = [`${formatPlainInr(plan.monthlySalary)}/mo`]
  if (plan.commissionPercent > 0) parts.push(`${plan.commissionPercent}% commission`)
  if (plan.incentiveAmount > 0) {
    parts.push(`${formatPlainInr(plan.incentiveAmount)} at ≥${plan.onTimeThreshold}% on-time`)
  }
  return parts.join(" + ")
}

export type DisplayPayoutStatus =
  "Pending approval" | "Approved" | "Paid" | "Overdue" | "Settled" | "Rejected"

export function displayPayoutStatus(
  status: string,
  dueDate: Date,
  now = new Date(),
): DisplayPayoutStatus {
  if (status === "PAID") return "Paid"
  if (status === "SETTLED") return "Settled"
  if (status === "REJECTED") return "Rejected"
  const unpaid = status === "PENDING_APPROVAL" || status === "APPROVED"
  if (unpaid && dueDate.getTime() < now.getTime()) return "Overdue"
  return status === "APPROVED" ? "Approved" : "Pending approval"
}

export function buildPeriodBuckets(
  range: DateRange,
  period: "daily" | "weekly" | "monthly",
  maxBuckets = 62,
): Array<DateRange & { label: string }> {
  const buckets: Array<DateRange & { label: string }> = []
  const totalDays = Math.ceil((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1
  const stepDays = Math.max(period === "weekly" ? 7 : 1, Math.ceil(totalDays / maxBuckets))
  let cursor = new Date(range.start)
  while (cursor.getTime() <= range.end.getTime()) {
    const next =
      period === "monthly"
        ? new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
        : new Date(cursor.getTime() + stepDays * DAY_MS)
    const end = new Date(Math.min(next.getTime() - 1, range.end.getTime()))
    buckets.push({
      start: new Date(cursor),
      end,
      label:
        period === "monthly"
          ? cycleLabel(cycleKeyOf(cursor))
          : cursor.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    })
    cursor = next
  }
  return buckets
}
