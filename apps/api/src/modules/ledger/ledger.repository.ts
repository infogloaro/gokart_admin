// The Transaction ledger is a view over the records that move money: order payments, cash
// on delivery, refunds, payouts and partner cash remittances. Nothing is copied into a
// separate table, so the ledger always agrees with orders and payouts. Amounts in paise.
import type { Business, LedgerMethod, LedgerType } from "@zoauro/shared"
import { Prisma } from "../../generated/prisma/client"
import { prisma } from "../../lib/prisma"

export type Scope = { businesses: Business[]; zoneIds: string[] | null }
export type Window = { from: Date; to: Date }

const COMMISSION = Prisma.sql`(o."itemsTotalPaise"::bigint * v."commissionBps" / 10000)`

function orderScope(s: Scope, w: Window, business?: Business) {
  const businesses = business ? [business] : s.businesses
  return Prisma.sql`o."business"::text = ANY(${businesses}::text[])
    ${s.zoneIds ? Prisma.sql`AND o."zoneId" = ANY(${s.zoneIds}::text[])` : Prisma.empty}
    AND o."placedAt" >= ${w.from} AND o."placedAt" < ${w.to}`
}

/** All ledger entries in the window as one relation, for filtering and paging in SQL. */
function entries(s: Scope, w: Window, business?: Business) {
  const orders = orderScope(s, w, business)
  // Payouts and remittances belong to no single business; a business filter leaves them out.
  const money = business
    ? Prisma.empty
    : Prisma.sql`
      UNION ALL
      SELECT p."id", p."code", NULL AS business, p."cycle" AS reference,
        CASE p."accountType" WHEN 'partner' THEN 'partner_payout' ELSE 'admin_payout' END AS type,
        COALESCE(pt."name", m."name", p."accountId") AS beneficiary,
        'bank_transfer' AS method,
        p."amountPaise"::bigint AS gross, 0::bigint AS fees, -p."amountPaise"::bigint AS net,
        CASE p."status" WHEN 'approved' THEN 'Processing' WHEN 'paid' THEN 'Paid' ELSE 'Settled' END AS status,
        COALESCE(p."paidAt", p."approvedAt", p."createdAt") AS at
      FROM "payouts" p
      LEFT JOIN "partners" pt ON p."accountType" = 'partner' AND pt."id" = p."accountId"
      LEFT JOIN "members" m ON p."accountType" = 'admin' AND m."id" = p."accountId"
      WHERE p."status" IN ('approved', 'paid', 'settled')
        AND COALESCE(p."paidAt", p."approvedAt", p."createdAt") >= ${w.from}
        AND COALESCE(p."paidAt", p."approvedAt", p."createdAt") < ${w.to}
      UNION ALL
      SELECT r."id", 'RMT-' || upper(right(r."id", 6)), NULL, r."cycle", 'cash_remittance',
        pt."name", CASE WHEN r."method" ILIKE 'UPI%' THEN 'upi' ELSE 'bank_transfer' END,
        r."amountPaise"::bigint, 0::bigint, r."amountPaise"::bigint, 'Received', r."createdAt"
      FROM "remittances" r JOIN "partners" pt ON pt."id" = r."partnerId"
      WHERE r."createdAt" >= ${w.from} AND r."createdAt" < ${w.to}`
  return Prisma.sql`
    SELECT o."id" || ':pay' AS id, 'PAY-' || o."code" AS code, o."business"::text AS business,
      o."code" AS reference, 'order_payment' AS type, v."name" AS beneficiary,
      o."paymentMethod"::text AS method,
      o."totalPaise"::bigint AS gross, (${COMMISSION} + o."deliveryFeePaise")::bigint AS fees,
      (o."totalPaise" - ${COMMISSION} - o."deliveryFeePaise")::bigint AS net,
      CASE o."paymentStatus" WHEN 'paid' THEN 'Captured' WHEN 'refunded' THEN 'Captured' ELSE 'Pending' END AS status,
      o."placedAt" AS at
    FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
    WHERE ${orders} AND o."paymentMethod" <> 'cod' AND o."status" <> 'cancelled'
    UNION ALL
    SELECT o."id" || ':cod', 'COD-' || o."code", o."business"::text, o."code", 'cod_collection',
      COALESCE(pt."name", 'Unassigned partner'), 'cod',
      o."totalPaise"::bigint, (${COMMISSION} + o."deliveryFeePaise")::bigint,
      (o."totalPaise" - ${COMMISSION} - o."deliveryFeePaise")::bigint,
      CASE WHEN o."status" IN ('delivered', 'refund_requested', 'refunded') THEN 'Collected' ELSE 'Pending collection' END,
      o."placedAt"
    FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
    LEFT JOIN "partners" pt ON pt."id" = o."partnerId"
    WHERE ${orders} AND o."paymentMethod" = 'cod' AND o."status" <> 'cancelled'
    UNION ALL
    SELECT o."id" || ':rfd', 'RFD-' || o."code", o."business"::text, o."code", 'refund',
      o."customerName", o."paymentMethod"::text,
      -o."totalPaise"::bigint, 0::bigint, -o."totalPaise"::bigint, 'Refunded', o."updatedAt"
    FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
    WHERE ${orders} AND o."status" = 'refunded'
    ${money}`
}

export type LedgerRow = {
  id: string
  code: string
  business: Business | null
  reference: string
  type: LedgerType
  beneficiary: string
  method: LedgerMethod
  gross: bigint
  fees: bigint
  net: bigint
  status: string
  at: Date
}

export async function list(
  s: Scope,
  w: Window,
  f: {
    business?: Business | undefined
    type?: LedgerType | undefined
    method?: LedgerMethod | undefined
    search?: string | undefined
  },
  page: number,
  pageSize: number,
) {
  const where = Prisma.sql`WHERE TRUE
    ${f.type ? Prisma.sql`AND e."type" = ${f.type}` : Prisma.empty}
    ${f.method ? Prisma.sql`AND e."method" = ${f.method}` : Prisma.empty}
    ${f.search ? Prisma.sql`AND (e."code" ILIKE ${`%${f.search}%`} OR e."reference" ILIKE ${`%${f.search}%`} OR e."beneficiary" ILIKE ${`%${f.search}%`})` : Prisma.empty}`
  const base = entries(s, w, f.business)
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<LedgerRow[]>`
      SELECT * FROM (${base}) e ${where}
      ORDER BY e."at" DESC, e."code" ASC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM (${base}) e ${where}`,
  ])
  return { rows, total: count[0]?.n ?? 0 }
}

export async function summary(s: Scope, w: Window, business?: Business) {
  const orders = orderScope(s, w, business)
  const [totals, methods] = await Promise.all([
    prisma.$queryRaw<{ gross: bigint; commission: bigint; fees: bigint; refunds: bigint }[]>`
      SELECT COALESCE(SUM(o."totalPaise"), 0)::bigint AS gross,
        COALESCE(SUM(${COMMISSION}), 0)::bigint AS commission,
        COALESCE(SUM(o."deliveryFeePaise"), 0)::bigint AS fees,
        COALESCE(SUM(o."totalPaise") FILTER (WHERE o."status" = 'refunded'), 0)::bigint AS refunds
      FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
      WHERE ${orders} AND o."status" <> 'cancelled'`,
    prisma.$queryRaw<{ method: LedgerMethod; amount: bigint }[]>`
      SELECT o."paymentMethod"::text AS method, SUM(o."totalPaise")::bigint AS amount
      FROM "orders" o
      WHERE ${orders} AND o."status" <> 'cancelled'
      GROUP BY 1`,
  ])
  return { totals: totals[0]!, methods }
}
