// Operational alerts: orders running past their time limit, failed payments, open orders at
// suspended vendors, and sign-ins from a new network. Each problem is recorded once per day in
// the alerts table (not as a notification) and shown on the Alerts page for the right people.
import { FULFILMENT_STATUSES, ORDER_SLA_MINUTES, type Business } from "@zoauro/shared"
import type { AlertKind, Prisma } from "../../generated/prisma/client"
import { prisma } from "../../lib/prisma"
import { linkFor } from "../../lib/notify"
import { delayedWhere } from "../orders/orders.repository"

type Db = Pick<typeof prisma, "operationalAlert">

const IST = 330 * 60_000
const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10)

export type NewAlert = {
  kind: AlertKind
  /** Identifies the problem; the same key is recorded once per day. */
  subject: string
  business: Business | null
  zoneId: string | null
  title: string
  body: string
  link: string | null
  now?: number
}

/** Records an alert once per problem per day. Safe to call repeatedly. */
export async function raiseAlert(db: Db, alert: NewAlert) {
  const key = `${alert.kind}:${alert.subject}:${istDay(alert.now ?? Date.now())}`
  await db.operationalAlert.createMany({
    data: [
      {
        key,
        kind: alert.kind,
        business: alert.business,
        zoneId: alert.zoneId,
        title: alert.title,
        body: alert.body,
        link: alert.link,
      },
    ],
    skipDuplicates: true,
  })
}

export async function checkDelayedOrders(now = Date.now()) {
  const orders = await prisma.order.findMany({
    where: delayedWhere(now),
    select: { id: true, code: true, business: true, zoneId: true, status: true },
    orderBy: { placedAt: "asc" },
    take: 200,
  })
  for (const order of orders)
    await raiseAlert(prisma, {
      kind: "delayed_order",
      subject: order.id,
      business: order.business,
      zoneId: order.zoneId,
      title: "Order delayed",
      body: `${order.code} is still ${order.status.replaceAll("_", " ")} after the ${ORDER_SLA_MINUTES[order.business]}-minute limit.`,
      link: linkFor("admin", order.business, "orders", `search=${order.code}`),
      now,
    })
  return orders.length
}

export async function checkPaymentFailures(now = Date.now()) {
  const orders = await prisma.order.findMany({
    where: { paymentStatus: "failed", placedAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } },
    select: { id: true, code: true, business: true, zoneId: true },
    take: 200,
  })
  for (const order of orders)
    await raiseAlert(prisma, {
      kind: "payment_failed",
      subject: order.id,
      business: order.business,
      zoneId: order.zoneId,
      title: "Payment failed",
      body: `The payment for ${order.code} failed. Check with the customer before the order is prepared.`,
      link: linkFor("admin", order.business, "orders", `search=${order.code}`),
      now,
    })
  return orders.length
}

export async function checkVendorIssues(now = Date.now()) {
  const vendors = await prisma.vendor.findMany({
    where: {
      status: "suspended",
      orders: { some: { status: { in: [...FULFILMENT_STATUSES] } } },
    },
    select: {
      id: true,
      name: true,
      business: true,
      zoneId: true,
      orders: { where: { status: { in: [...FULFILMENT_STATUSES] } }, select: { id: true } },
    },
    take: 100,
  })
  for (const vendor of vendors)
    await raiseAlert(prisma, {
      kind: "vendor_issue",
      subject: vendor.id,
      business: vendor.business,
      zoneId: vendor.zoneId,
      title: "Suspended vendor has open orders",
      body: `${vendor.name} is suspended but has ${vendor.orders.length} order(s) still being fulfilled.`,
      link: linkFor(
        "admin",
        vendor.business,
        "vendors",
        `search=${encodeURIComponent(vendor.name)}`,
      ),
      now,
    })
  return vendors.length
}

/** One pass of every check. The server runs this on an interval. */
export async function runAlertChecks(now = Date.now()) {
  return {
    delayedOrders: await checkDelayedOrders(now),
    paymentFailures: await checkPaymentFailures(now),
    vendorIssues: await checkVendorIssues(now),
  }
}

/** Alerts visible to a member: Super Admins see all; admins see their businesses and zones. */
export function visibleTo(
  scope: { businesses: Business[]; zoneIds: string[] | null },
  status: "open" | "resolved",
) {
  const where: Prisma.OperationalAlertWhereInput = {
    resolvedAt: status === "open" ? null : { not: null },
  }
  if (scope.zoneIds) {
    where.business = { in: scope.businesses }
    where.zoneId = { in: scope.zoneIds }
  }
  return where
}
