// Read-only aggregates for the Command Center, Business overview and revenue screens.
// Money stays in integer paise; SUMs come back as bigint and are converted once here.
import {
  FULFILMENT_STATUSES,
  ORDER_SLA_MINUTES,
  type Business,
  type OrderStatus,
} from "@zoauro/shared"
import { Prisma } from "../../generated/prisma/client"
import { prisma } from "../../lib/prisma"
import { delayedWhere } from "../orders/orders.repository"

export type Scope = { businesses: Business[]; zoneIds: string[] | null }
export type Period = { from: Date; to: Date }

/** Orders that still earn money: not cancelled and not refunded. */
const COUNTED = Prisma.sql`o."status" NOT IN ('cancelled', 'refunded')`
const COMMISSION = Prisma.sql`(o."itemsTotalPaise"::bigint * v."commissionBps" / 10000)`

function orderScope(s: Scope, p: Period) {
  return Prisma.sql`o."business"::text = ANY(${s.businesses}::text[])
    ${s.zoneIds ? Prisma.sql`AND o."zoneId" = ANY(${s.zoneIds}::text[])` : Prisma.empty}
    AND o."placedAt" >= ${p.from} AND o."placedAt" < ${p.to}`
}

const n = (v: bigint | number | null) => Number(v ?? 0)

type TotalsRow = {
  business: Business
  orders: number
  gross: bigint
  commission: bigint
  fees: bigint
  items: bigint
  refunds: bigint
  refund_count: number
  delivered: number
  cancelled: number
  refunded: number
}

/** Money and status counts per business for orders placed in the period. */
export async function totals(s: Scope, p: Period) {
  const rows = await prisma.$queryRaw<TotalsRow[]>`
    SELECT o."business"::text AS business,
      COUNT(*)::int AS orders,
      COALESCE(SUM(o."totalPaise") FILTER (WHERE ${COUNTED}), 0)::bigint AS gross,
      COALESCE(SUM(${COMMISSION}) FILTER (WHERE ${COUNTED}), 0)::bigint AS commission,
      COALESCE(SUM(o."deliveryFeePaise") FILTER (WHERE ${COUNTED}), 0)::bigint AS fees,
      COALESCE(SUM(o."itemsTotalPaise") FILTER (WHERE ${COUNTED}), 0)::bigint AS items,
      COALESCE(SUM(o."totalPaise") FILTER (WHERE o."status" = 'refunded'), 0)::bigint AS refunds,
      COUNT(*) FILTER (WHERE o."status" = 'refunded')::int AS refund_count,
      COUNT(*) FILTER (WHERE o."status" = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE o."status" = 'cancelled')::int AS cancelled,
      COUNT(*) FILTER (WHERE o."status" = 'refunded')::int AS refunded
    FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
    WHERE ${orderScope(s, p)}
    GROUP BY 1`
  return rows.map((r) => ({
    business: r.business,
    orders: r.orders,
    grossPaise: n(r.gross),
    commissionPaise: n(r.commission),
    deliveryFeesPaise: n(r.fees),
    itemsPaise: n(r.items),
    refundsPaise: n(r.refunds),
    refundCount: r.refund_count,
    delivered: r.delivered,
    cancelled: r.cancelled,
    refunded: r.refunded,
  }))
}

/** Gross and platform revenue per India Standard Time day and business. */
export async function daily(s: Scope, p: Period) {
  const rows = await prisma.$queryRaw<
    { day: string; business: Business; gross: bigint; platform: bigint }[]
  >`
    SELECT to_char(o."placedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
      o."business"::text AS business,
      COALESCE(SUM(o."totalPaise") FILTER (WHERE ${COUNTED}), 0)::bigint AS gross,
      COALESCE(SUM(${COMMISSION} + o."deliveryFeePaise") FILTER (WHERE ${COUNTED}), 0)::bigint AS platform
    FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
    WHERE ${orderScope(s, p)}
    GROUP BY 1, 2`
  return rows.map((r) => ({
    day: r.day,
    business: r.business,
    grossPaise: n(r.gross),
    platformPaise: n(r.platform),
  }))
}

/** Each vendor's sales and the commission the platform keeps, biggest first. */
export async function byVendor(s: Scope, p: Period, limit = 50) {
  const rows = await prisma.$queryRaw<
    {
      id: string
      code: string
      name: string
      bps: number
      orders: number
      gross: bigint
      items: bigint
      commission: bigint
    }[]
  >`
    SELECT v."id", v."code", v."name", v."commissionBps" AS bps,
      COUNT(*)::int AS orders,
      SUM(o."totalPaise")::bigint AS gross,
      SUM(o."itemsTotalPaise")::bigint AS items,
      SUM(${COMMISSION})::bigint AS commission
    FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
    WHERE ${orderScope(s, p)} AND ${COUNTED}
    GROUP BY v."id"
    ORDER BY gross DESC
    LIMIT ${limit}`
  return rows.map((r) => ({
    vendorId: r.id,
    code: r.code,
    name: r.name,
    commissionBps: r.bps,
    orders: r.orders,
    grossPaise: n(r.gross),
    commissionPaise: n(r.commission),
    vendorSharePaise: n(r.items) - n(r.commission),
  }))
}

/** Acceptance and on-time delivery per business for orders placed in the period. */
export async function service(s: Scope, p: Period) {
  return prisma.$queryRaw<
    { business: Business; decided: number; rejected: number; delivered: number; on_time: number }[]
  >`
    SELECT o."business"::text AS business,
      COUNT(*) FILTER (WHERE o."status" <> 'placed')::int AS decided,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "order_events" e
        WHERE e."orderId" = o."id" AND e."from" = 'placed' AND e."to" = 'cancelled'))::int AS rejected,
      COUNT(d."at")::int AS delivered,
      COUNT(d."at") FILTER (WHERE d."at" - o."placedAt" <= make_interval(mins =>
        CASE o."business" WHEN 'food' THEN ${ORDER_SLA_MINUTES.food}::int
          ELSE ${ORDER_SLA_MINUTES.mart}::int END))::int AS on_time
    FROM "orders" o
    LEFT JOIN LATERAL (
      SELECT MIN(e."at") AS "at" FROM "order_events" e
      WHERE e."orderId" = o."id" AND e."to" = 'delivered'
    ) d ON TRUE
    WHERE ${orderScope(s, p)}
    GROUP BY 1`
}

const OPEN_STATUSES = [
  "placed",
  "accepted",
  "preparing",
  "packed",
  "ready",
  "assigned",
  "picked_up",
  "out_for_delivery",
  "refund_requested",
] as const

const zoneWhere = (s: Scope) => (s.zoneIds ? { zoneId: { in: s.zoneIds } } : {})
const partnerWhere = (s: Scope) => ({
  ...zoneWhere(s),
  businesses: { some: { business: { in: s.businesses } } },
})

/** Right-now counts for one business (or several), not tied to a period. */
export async function snapshot(s: Scope) {
  const orders = { business: { in: s.businesses }, ...zoneWhere(s) }
  const [
    activeVendors,
    partnersOnline,
    openOrders,
    delayed,
    refundRequests,
    pendingVendors,
    pendingPartners,
    documents,
    rating,
  ] = await Promise.all([
    prisma.vendor.count({ where: { ...orders, status: "active" } }),
    prisma.partner.count({
      where: {
        ...partnerWhere(s),
        status: "active",
        availability: { in: ["available", "on_delivery"] },
      },
    }),
    prisma.order.count({ where: { ...orders, status: { in: [...OPEN_STATUSES] } } }),
    prisma.order.count({ where: { ...orders, AND: [delayedWhere()] } }),
    prisma.order.aggregate({
      where: { ...orders, status: "refund_requested" },
      _count: true,
      _sum: { totalPaise: true },
      _min: { updatedAt: true },
    }),
    prisma.vendor.aggregate({
      where: { ...orders, status: "pending_review" },
      _count: true,
      _min: { createdAt: true },
    }),
    prisma.partner.aggregate({
      where: { ...partnerWhere(s), status: "pending_approval" },
      _count: true,
      _min: { createdAt: true },
    }),
    prisma.partnerDocument.aggregate({
      where: { verifiedAt: null, partner: { ...partnerWhere(s), status: { not: "rejected" } } },
      _count: true,
      _min: { uploadedAt: true },
    }),
    prisma.partner.aggregate({
      where: { ...partnerWhere(s), status: "active", ratingTenths: { not: null } },
      _avg: { ratingTenths: true },
    }),
  ])
  return {
    activeVendors,
    partnersOnline,
    openOrders,
    delayed,
    refundRequests: {
      count: refundRequests._count,
      amountPaise: refundRequests._sum.totalPaise ?? 0,
      oldestAt: refundRequests._min.updatedAt,
    },
    pendingVendors: { count: pendingVendors._count, oldestAt: pendingVendors._min.createdAt },
    pendingPartners: { count: pendingPartners._count, oldestAt: pendingPartners._min.createdAt },
    documents: { count: documents._count, oldestAt: documents._min.uploadedAt },
    ratingTenths: rating._avg.ratingTenths === null ? null : Math.round(rating._avg.ratingTenths),
  }
}

export function recentOrders(s: Scope, take = 6) {
  return prisma.order.findMany({
    where: { business: { in: s.businesses }, ...zoneWhere(s) },
    include: { vendor: { select: { name: true } } },
    orderBy: { placedAt: "desc" },
    take,
  })
}

/** Up to five orders, vendors and partners matching a code, name or phone. */
export function search(
  s: Scope,
  q: string,
  want: { orders: boolean; vendors: boolean; partners: boolean },
) {
  const has = { contains: q, mode: "insensitive" as const }
  const none = Promise.resolve([])
  return Promise.all([
    want.orders
      ? prisma.order.findMany({
          where: {
            business: { in: s.businesses },
            ...zoneWhere(s),
            OR: [{ code: has }, { customerName: has }, { vendor: { name: has } }],
          },
          include: { vendor: { select: { name: true } } },
          orderBy: { placedAt: "desc" },
          take: 5,
        })
      : none,
    want.vendors
      ? prisma.vendor.findMany({
          where: {
            business: { in: s.businesses },
            ...zoneWhere(s),
            OR: [{ code: has }, { name: has }, { ownerName: has }],
          },
          orderBy: { name: "asc" },
          take: 5,
        })
      : none,
    want.partners
      ? prisma.partner.findMany({
          where: { ...partnerWhere(s), OR: [{ code: has }, { name: has }, { phone: has }] },
          orderBy: { name: "asc" },
          take: 5,
        })
      : none,
  ])
}

/** Orders placed between 75% and 100% of their business's time limit ago, still in progress. */
function nearingLimitWhere(now = Date.now()): Prisma.OrderWhereInput {
  return {
    status: { in: [...FULFILMENT_STATUSES] },
    OR: (["food", "mart"] as const).map((business) => ({
      business,
      placedAt: {
        gte: new Date(now - ORDER_SLA_MINUTES[business] * 60_000),
        lt: new Date(now - ORDER_SLA_MINUTES[business] * 0.75 * 60_000),
      },
    })),
  }
}

/** What's happening on the floor right now: kitchens, dispatch and partners. */
export async function floor(s: Scope) {
  const orders = { business: { in: s.businesses }, ...zoneWhere(s) }
  const [preparing, ready, unassigned, nearingLimit, partnersAvailable] = await Promise.all([
    prisma.order.count({ where: { ...orders, status: { in: ["accepted", "preparing"] } } }),
    prisma.order.count({ where: { ...orders, status: { in: ["packed", "ready"] } } }),
    prisma.order.count({
      where: { ...orders, status: { in: ["packed", "ready"] }, partnerId: null },
    }),
    prisma.order.count({ where: { ...orders, AND: [nearingLimitWhere()] } }),
    prisma.partner.count({
      where: { ...partnerWhere(s), status: "active", availability: "available" },
    }),
  ])
  return { preparing, ready, unassigned, nearingLimit, partnersAvailable }
}

/** Order count per status for orders placed in the period. */
export async function byStatus(s: Scope, p: Period) {
  const rows = await prisma.$queryRaw<{ status: OrderStatus; count: number }[]>`
    SELECT o."status"::text AS status, COUNT(*)::int AS count
    FROM "orders" o
    WHERE ${orderScope(s, p)}
    GROUP BY 1`
  return rows
}

/**
 * Orders placed and later delivered, per IST hour (for a single day) or per IST day.
 * Buckets with no orders are left out; the service fills them in.
 */
export async function activity(s: Scope, p: Period, hourly: boolean) {
  const bucket = hourly ? Prisma.sql`'HH24'` : Prisma.sql`'YYYY-MM-DD'`
  return prisma.$queryRaw<{ bucket: string; orders: number; completed: number }[]>`
    SELECT to_char(o."placedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', ${bucket}) AS bucket,
      COUNT(*)::int AS orders,
      COUNT(*) FILTER (WHERE o."status" = 'delivered')::int AS completed
    FROM "orders" o
    WHERE ${orderScope(s, p)}
    GROUP BY 1`
}

const OPEN_FOR_RIDERS = [
  "placed",
  "accepted",
  "preparing",
  "packed",
  "ready",
  "assigned",
  "picked_up",
  "out_for_delivery",
] as const

/** Order money, outcomes and on-time delivery per zone for orders placed in the period. */
export async function zoneStats(s: Scope, p: Period) {
  const rows = await prisma.$queryRaw<
    {
      zone: string
      orders: number
      gross: bigint
      platform: bigint
      delivered: number
      cancelled: number
      timed: number
      on_time: number
    }[]
  >`
    SELECT o."zoneId" AS zone,
      COUNT(*)::int AS orders,
      COALESCE(SUM(o."totalPaise") FILTER (WHERE ${COUNTED}), 0)::bigint AS gross,
      COALESCE(SUM(${COMMISSION} + o."deliveryFeePaise") FILTER (WHERE ${COUNTED}), 0)::bigint AS platform,
      COUNT(*) FILTER (WHERE o."status" = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE o."status" = 'cancelled')::int AS cancelled,
      COUNT(d."at")::int AS timed,
      COUNT(d."at") FILTER (WHERE d."at" - o."placedAt" <= make_interval(mins =>
        CASE o."business" WHEN 'food' THEN ${ORDER_SLA_MINUTES.food}::int
          ELSE ${ORDER_SLA_MINUTES.mart}::int END))::int AS on_time
    FROM "orders" o
    JOIN "vendors" v ON v."id" = o."vendorId"
    LEFT JOIN LATERAL (
      SELECT MIN(e."at") AS "at" FROM "order_events" e
      WHERE e."orderId" = o."id" AND e."to" = 'delivered'
    ) d ON TRUE
    WHERE ${orderScope(s, p)}
    GROUP BY 1`
  return rows.map((r) => ({
    zoneId: r.zone,
    orders: r.orders,
    grossPaise: n(r.gross),
    platformPaise: n(r.platform),
    delivered: r.delivered,
    cancelled: r.cancelled,
    timed: r.timed,
    onTime: r.on_time,
  }))
}

const istDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10)

/** Partner pay accrued per zone over the period's IST days. */
export async function riderCostByZone(s: Scope, p: Period) {
  const rows = await prisma.$queryRaw<{ zone: string; pay: bigint }[]>`
    SELECT pt."zoneId" AS zone,
      SUM(a."salaryPaise" + a."fixedPaise" + a."incentivePaise" + a."commissionPaise")::bigint AS pay
    FROM "daily_accruals" a JOIN "partners" pt ON pt."id" = a."accountId"
    WHERE a."accountType" = 'partner'
      AND a."day" >= ${istDate(p.from)}::date AND a."day" <= ${istDate(p.to)}::date
      ${s.zoneIds ? Prisma.sql`AND pt."zoneId" = ANY(${s.zoneIds}::text[])` : Prisma.empty}
    GROUP BY 1`
  return new Map(rows.map((r) => [r.zone, n(r.pay)]))
}

/** Right now: orders still to deliver, and riders free to take them, per zone. */
export async function zoneSupply(s: Scope) {
  const [open, boys, partners] = await Promise.all([
    prisma.order.groupBy({
      by: ["zoneId"],
      where: {
        business: { in: s.businesses },
        status: { in: [...OPEN_FOR_RIDERS] },
        ...zoneWhere(s),
      },
      _count: { _all: true },
    }),
    prisma.deliveryBoy.groupBy({
      by: ["zoneId"],
      where: { status: "active", availability: "available", ...zoneWhere(s) },
      _count: { _all: true },
    }),
    prisma.partner.groupBy({
      by: ["zoneId"],
      where: { status: "active", availability: "available", ...zoneWhere(s) },
      _count: { _all: true },
    }),
  ])
  const supply = new Map<string, number>()
  for (const g of [...boys, ...partners])
    supply.set(g.zoneId, (supply.get(g.zoneId) ?? 0) + g._count._all)
  return {
    open: new Map(open.map((g) => [g.zoneId, g._count._all])),
    riders: supply,
  }
}

/** Every zone with its district and state, limited to the member's zones. */
export function zoneDirectory(s: Scope) {
  return prisma.zone.findMany({
    where: s.zoneIds ? { id: { in: s.zoneIds } } : {},
    select: {
      id: true,
      city: true,
      location: true,
      districtId: true,
      districtRecord: { select: { name: true, state: true } },
    },
  })
}
