// Database access for Finance & payouts. Only this file talks to Prisma for the module.
import {
  ORDER_SLA_MINUTES,
  type AccountType,
  type AdminPlan,
  type PartnerPlan,
} from "@zoauro/shared"
import type { Prisma, PayoutStatus } from "../../generated/prisma/client"
import { prisma, type Db } from "../../lib/prisma"

const IST = 330 * 60_000
/** Start of an IST day (yyyy-mm-dd) as a UTC instant. */
export const istStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST)
export const istDay = (t: Date | number) =>
  new Date((typeof t === "number" ? t : t.getTime()) + IST).toISOString().slice(0, 10)
/** A @db.Date column holds the calendar day at UTC midnight. */
export const dateOnly = (day: string) => new Date(`${day}T00:00:00Z`)
export const dayOf = (d: Date) => d.toISOString().slice(0, 10)

// ---------- accounts ----------

export function partners() {
  return prisma.partner.findMany({
    where: { status: "active" },
    include: { businesses: { select: { business: true } } },
    orderBy: { code: "asc" },
  })
}

export function admins() {
  return prisma.member.findMany({
    where: { role: "admin", status: "active" },
    include: { zones: { include: { zone: { select: { district: true } } } }, businesses: true },
    orderBy: { createdAt: "asc" },
  })
}

export function bankAccounts(type: AccountType, ids: string[]) {
  return prisma.bankAccount.findMany({ where: { accountType: type, accountId: { in: ids } } })
}

export function memberNames(ids: string[]) {
  return prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
}

// ---------- plans ----------

export function planVersions(type: AccountType, ids?: string[]) {
  return prisma.payPlanVersion.findMany({
    where: { accountType: type, ...(ids && { accountId: { in: ids } }) },
    orderBy: [{ accountId: "asc" }, { effectiveFrom: "asc" }, { createdAt: "asc" }],
  })
}

/** New rates from `day`; a second change on the same day replaces the first. */
export async function setPlan(
  db: Db,
  type: AccountType,
  id: string,
  day: string,
  plan: PartnerPlan | AdminPlan,
  reason: string,
  by: string,
) {
  const existing = await db.payPlanVersion.findFirst({
    where: { accountType: type, accountId: id, effectiveFrom: dateOnly(day) },
  })
  if (existing)
    return db.payPlanVersion.update({
      where: { id: existing.id },
      data: { plan, reason, createdById: by },
    })
  return db.payPlanVersion.create({
    data: {
      accountType: type,
      accountId: id,
      effectiveFrom: dateOnly(day),
      plan,
      reason,
      createdById: by,
    },
  })
}

// ---------- activity and accruals ----------

export type ActivityRow = {
  partner: string
  day: string
  deliveries: number
  on_time: number
  cod: bigint
  fees: bigint
  revenue: bigint
}

/** Deliveries per partner per IST day, by when the order was delivered. */
export function deliveredActivity(from: Date, to: Date) {
  return prisma.$queryRaw<ActivityRow[]>`
    SELECT o."partnerId" AS partner,
      to_char(d."at" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS deliveries,
      COUNT(*) FILTER (WHERE d."at" - o."placedAt" <= make_interval(mins =>
        CASE o."business" WHEN 'food' THEN ${ORDER_SLA_MINUTES.food}::int
          ELSE ${ORDER_SLA_MINUTES.mart}::int END))::int AS on_time,
      COALESCE(SUM(o."totalPaise") FILTER (WHERE o."paymentMethod" = 'cod'), 0)::bigint AS cod,
      COALESCE(SUM(o."deliveryFeePaise") FILTER (WHERE o."status" <> 'refunded'), 0)::bigint AS fees,
      COALESCE(SUM(o."deliveryFeePaise" + o."itemsTotalPaise"::bigint * v."commissionBps" / 10000)
        FILTER (WHERE o."status" <> 'refunded'), 0)::bigint AS revenue
    FROM "orders" o
    JOIN "vendors" v ON v."id" = o."vendorId"
    JOIN LATERAL (
      SELECT MIN(e."at") AS "at" FROM "order_events" e
      WHERE e."orderId" = o."id" AND e."to" = 'delivered'
    ) d ON d."at" IS NOT NULL
    WHERE o."partnerId" IS NOT NULL AND d."at" >= ${from} AND d."at" < ${to}
    GROUP BY 1, 2`
}

export type AccrualInput = Prisma.DailyAccrualCreateManyInput

/** Replaces a cycle's accrual rows in one transaction, serialised per cycle. */
export async function replaceAccruals(
  cycle: string,
  from: string,
  to: string,
  rows: AccrualInput[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accrual:${cycle}`}))`
    await tx.dailyAccrual.deleteMany({ where: { day: { gte: dateOnly(from), lte: dateOnly(to) } } })
    if (rows.length) await tx.dailyAccrual.createMany({ data: rows })
  })
}

export function accruals(type: AccountType, from: string, to: string, ids?: string[]) {
  return prisma.dailyAccrual.findMany({
    where: {
      accountType: type,
      day: { gte: dateOnly(from), lte: dateOnly(to) },
      ...(ids && { accountId: { in: ids } }),
    },
    orderBy: { day: "asc" },
  })
}

// ---------- adjustments and remittances ----------

export const adjustments = (cycle: string, type?: AccountType, id?: string) =>
  prisma.adjustment.findMany({
    where: { cycle, ...(type && { accountType: type }), ...(id && { accountId: id }) },
    orderBy: { createdAt: "asc" },
  })

export const remittances = (where: Prisma.RemittanceWhereInput) =>
  prisma.remittance.findMany({ where, orderBy: [{ day: "desc" }, { createdAt: "desc" }] })

// ---------- payouts ----------

export const payouts = (where: Prisma.PayoutWhereInput) =>
  prisma.payout.findMany({
    where,
    orderBy: [{ cycle: "desc" }, { accountType: "asc" }, { code: "asc" }],
  })

export const payout = (id: string) =>
  prisma.payout.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } })

/** Moves a payout to a new status if it still has `version` and one of `from` statuses. */
export async function transition(
  db: Db,
  id: string,
  version: number,
  from: PayoutStatus[],
  data: Prisma.PayoutUpdateManyMutationInput,
) {
  const done = await db.payout.updateMany({
    where: { id, version, status: { in: from } },
    data: { ...data, version: { increment: 1 } },
  })
  return done.count === 1
}

// ---------- change requests ----------

export const changeRequests = () =>
  prisma.payChangeRequest.findMany({ orderBy: { createdAt: "desc" }, take: 40 })

// ---------- audit ----------

export const financeAudit = (take = 60) =>
  prisma.auditLog.findMany({
    where: { action: { startsWith: "finance." } },
    orderBy: { at: "desc" },
    take,
  })

export { prisma }
