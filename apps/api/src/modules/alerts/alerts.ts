// Operational alerts: orders running past their time limit, failed payments, open orders at
// suspended vendors, and sign-ins from a new network. Each problem is recorded once per day in
// the alerts table (not as a notification) and shown on the Alerts page for the right people.
import { FULFILMENT_STATUSES, ORDER_SLA_MINUTES, type Business } from "@zoauro/shared"
import type { AlertKind, Prisma } from "../../generated/prisma/client"
import { prisma } from "../../lib/prisma"
import { linkFor, notify } from "../../lib/notify"
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

/** Online payments still unconfirmed a day after the order was delivered: money to chase. */
export async function checkUnconfirmedPayments(now = Date.now()) {
  const orders = await prisma.order.findMany({
    where: {
      status: "delivered",
      paymentStatus: "pending",
      paymentMethod: { not: "cod" },
      placedAt: { lt: new Date(now - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, code: true, business: true, zoneId: true },
    take: 200,
  })
  for (const order of orders)
    await raiseAlert(prisma, {
      kind: "payment_failed",
      subject: `unconfirmed:${order.id}`,
      business: order.business,
      zoneId: order.zoneId,
      title: "Payment not confirmed",
      body: `${order.code} was delivered but its online payment is still unconfirmed. Reconcile it with the payment provider.`,
      link: linkFor("admin", order.business, "orders", `search=${order.code}`),
      now,
    })
  return orders.length
}

/** Riders whose driving licence or vehicle registration has expired or expires within 30 days. */
export async function checkDocumentExpiry(now = Date.now()) {
  const soon = new Date(now + 30 * 24 * 60 * 60 * 1000)
  const statuses = ["pending_admin", "pending_super", "active", "corrections_requested"] as const
  const riders = await prisma.deliveryBoy.findMany({
    where: {
      status: { in: [...statuses] },
      OR: [{ licenceValidUntil: { lte: soon } }, { registrationValidUntil: { lte: soon } }],
    },
    select: {
      id: true,
      name: true,
      code: true,
      zoneId: true,
      licenceValidUntil: true,
      registrationValidUntil: true,
    },
    take: 200,
  })
  for (const rider of riders) {
    const licence =
      rider.licenceValidUntil !== null && rider.licenceValidUntil.getTime() <= soon.getTime()
    const registration =
      rider.registrationValidUntil !== null &&
      rider.registrationValidUntil.getTime() <= soon.getTime()
    if (licence) {
      const expired = rider.licenceValidUntil!.getTime() < now
      await raiseAlert(prisma, {
        kind: "document_expiry",
        subject: `${rider.id}:licence`,
        business: null,
        zoneId: rider.zoneId,
        title: expired ? "Driving licence expired" : "Driving licence expires soon",
        body: `${rider.name} (${rider.code}): licence ${expired ? "has expired" : "expires on " + rider.licenceValidUntil!.toISOString().slice(0, 10)}. Ask the partner for a renewed copy.`,
        link: null,
        now,
      })
    }
    if (registration) {
      const expired = rider.registrationValidUntil!.getTime() < now
      await raiseAlert(prisma, {
        kind: "document_expiry",
        subject: `${rider.id}:registration`,
        business: null,
        zoneId: rider.zoneId,
        title: expired ? "Vehicle registration expired" : "Vehicle registration expires soon",
        body: `${rider.name} (${rider.code}): vehicle registration ${expired ? "has expired" : "expires on " + rider.registrationValidUntil!.toISOString().slice(0, 10)}.`,
        link: null,
        now,
      })
    }
  }
  return riders.length
}

/** One pass of every check. The server runs this on an interval. */
export async function runAlertChecks(now = Date.now()) {
  return {
    delayedOrders: await checkDelayedOrders(now),
    escalated: await escalateOverdueAlerts(now),
    riderGeofence: await checkRiderGeofence(now),
    paymentFailures: await checkPaymentFailures(now),
    vendorIssues: await checkVendorIssues(now),
    documentExpiry: await checkDocumentExpiry(now),
    unconfirmedPayments: await checkUnconfirmedPayments(now),
  }
}

/** A delayed order still open this long after it is raised goes to every Super Admin. */
export const ESCALATE_AFTER_MINUTES = 30
/** Riders further than this from their zone centre are flagged as possibly off-zone. */
export const RIDER_ZONE_RADIUS_KM = 8
/** Only positions reported this recently are checked against the zone. */
const POSITION_FRESH_MINUTES = 30

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Riders who reported a recent position well outside their zone. Admins of the zone see them. */
export async function checkRiderGeofence(now = Date.now()) {
  const riders = await prisma.deliveryBoy.findMany({
    where: {
      status: "active",
      lastLat: { not: null },
      lastLng: { not: null },
      lastLocationAt: { gte: new Date(now - POSITION_FRESH_MINUTES * 60_000) },
    },
    select: {
      id: true,
      name: true,
      code: true,
      zoneId: true,
      lastLat: true,
      lastLng: true,
      zone: { select: { lat: true, lng: true, location: true, city: true } },
    },
    take: 500,
  })
  let flagged = 0
  for (const rider of riders) {
    const zone = rider.zone
    if (rider.lastLat === null || rider.lastLng === null || zone.lat === null || zone.lng === null)
      continue
    const km = distanceKm(
      { lat: rider.lastLat, lng: rider.lastLng },
      { lat: zone.lat, lng: zone.lng },
    )
    if (km <= RIDER_ZONE_RADIUS_KM) continue
    flagged++
    await raiseAlert(prisma, {
      kind: "rider_off_zone",
      subject: rider.id,
      business: null,
      zoneId: rider.zoneId,
      title: "Rider away from zone",
      body: `${rider.name} (${rider.code}) reported a position about ${Math.round(km)} km from ${zone.location}, ${zone.city}. Check whether they are on a delivery.`,
      link: null,
      now,
    })
  }
  return flagged
}

/**
 * Sends delayed-order alerts that are still open after ESCALATE_AFTER_MINUTES to every Super
 * Admin, once each. The claim is a conditional update, so two runs cannot notify twice.
 */
export async function escalateOverdueAlerts(now = Date.now()) {
  const overdue = await prisma.operationalAlert.findMany({
    where: {
      kind: "delayed_order",
      resolvedAt: null,
      escalatedAt: null,
      createdAt: { lt: new Date(now - ESCALATE_AFTER_MINUTES * 60_000) },
    },
    select: { id: true, title: true, body: true, link: true },
    take: 100,
  })
  if (overdue.length === 0) return 0
  const supers = await prisma.member.findMany({
    where: { role: "super_admin", status: "active" },
    select: { id: true },
  })
  let escalated = 0
  for (const alert of overdue) {
    const claimed = await prisma.operationalAlert.updateMany({
      where: { id: alert.id, escalatedAt: null },
      data: { escalatedAt: new Date(now) },
    })
    if (claimed.count === 0) continue
    escalated++
    await notify(
      prisma,
      supers.map((member) => member.id),
      {
        title: `Escalated: ${alert.title}`,
        body: `${alert.body} Still open after ${ESCALATE_AFTER_MINUTES} minutes.`,
        link: alert.link,
      },
    )
  }
  return escalated
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
    // Admins see their zones, for their businesses. Rider documents have no business of their own.
    where.zoneId = { in: scope.zoneIds }
    where.OR = [
      { business: { in: scope.businesses } },
      { business: null, kind: { in: ["document_expiry", "rider_off_zone"] } },
    ]
  }
  return where
}
