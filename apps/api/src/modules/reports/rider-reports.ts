// Delivery partner and rider comparison for Reports & Analytics, and each rider's deliveries with
// the steps each order went through, the delivery code and proof, and any complaints.
import {
  RIDER_STEPS,
  type Business,
  type PartnerComparisonRow,
  type RiderComparisonRow,
  type RiderDeliveryRow,
} from "@zoauro/shared"
import { notFound } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
/** Who the reports cover: the member's scope, narrowed by the chosen filters. */
export type Scope = {
  businesses: Business[]
  zoneIds: string[] | null
  fleetId?: string
  boyId?: string
}
/** The span of time the orders are counted in. */
export type Span = { from: Date; to: Date }

const STEP_LABEL: Record<(typeof RIDER_STEPS)[number], string> = {
  placed: "Placed",
  accepted: "Accepted by rider",
  picked_up: "Picked up",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
}

/** Riders in scope: their zone, company and rider filters, limited to companies serving the business. */
async function ridersInScope(s: Scope) {
  return prisma.deliveryBoy.findMany({
    where: {
      ...(s.zoneIds && { zoneId: { in: s.zoneIds } }),
      ...(s.fleetId && { fleetId: s.fleetId }),
      ...(s.boyId && { id: s.boyId }),
      fleet: { businesses: { some: { business: { in: s.businesses } } } },
    },
    select: {
      id: true,
      code: true,
      name: true,
      fleetId: true,
      fleet: { select: { name: true } },
      zone: { select: { location: true, district: true } },
    },
  })
}

/** Everything the comparisons need for the orders placed in the window. */
async function loadWindow(s: Scope, w: Span) {
  const boys = await ridersInScope(s)
  const boyIds = boys.map((b) => b.id)
  if (boyIds.length === 0)
    return { boys, orders: [], events: [], offers: [], cod: [], complaints: [], assignments: [] }

  const orders = await prisma.order.findMany({
    where: {
      deliveryBoyId: { in: boyIds },
      placedAt: { gte: w.from, lt: w.to },
      status: { notIn: ["cancelled", "refunded"] },
      business: { in: s.businesses },
      ...(s.zoneIds && { zoneId: { in: s.zoneIds } }),
    },
    select: {
      id: true,
      code: true,
      business: true,
      placedAt: true,
      status: true,
      deliveryBoyId: true,
      deliveryFeePaise: true,
      totalPaise: true,
      otpVerifiedAt: true,
      proofAt: true,
      vendor: { select: { name: true } },
    },
  })
  const orderIds = orders.map((o) => o.id)
  const [events, offers, cod, complaints, assignments] = await Promise.all([
    prisma.orderEvent.findMany({
      where: {
        orderId: { in: orderIds },
        to: { in: ["picked_up", "out_for_delivery", "delivered"] },
      },
      select: { orderId: true, to: true, at: true },
    }),
    prisma.deliveryOffer.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, boyId: true, status: true, offeredAt: true, respondedAt: true },
    }),
    prisma.codCollection.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, boyId: true, amountPaise: true },
    }),
    prisma.complaint.findMany({
      where: { orderId: { in: orderIds } },
      select: { code: true, category: true, status: true, priority: true, orderId: true },
    }),
    // Manual assignments have no offer; their assignment time stands in for accepting.
    prisma.deliveryAssignment.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, boyId: true, assignedAt: true },
    }),
  ])
  return { boys, orders, events, offers, cod, complaints, assignments }
}

type Loaded = Awaited<ReturnType<typeof loadWindow>>

/** Per-rider totals. The minutes sum and count are kept so partner averages can be weighted. */
type Totals = {
  deliveries: number
  minutesSum: number
  minutesCount: number
  offersSent: number
  offersAccepted: number
  complaints: number
  codCollectedPaise: number
}

const emptyTotals = (): Totals => ({
  deliveries: 0,
  minutesSum: 0,
  minutesCount: 0,
  offersSent: 0,
  offersAccepted: 0,
  complaints: 0,
  codCollectedPaise: 0,
})

/** When the rider took the order: the accepted offer, or else the assignment. */
function acceptedAt(data: Loaded, orderId: string, boyId: string): Date | null {
  const offer = data.offers.find(
    (o) => o.orderId === orderId && o.boyId === boyId && o.status === "accepted",
  )
  if (offer?.respondedAt) return offer.respondedAt
  return (
    data.assignments.find((a) => a.orderId === orderId && a.boyId === boyId)?.assignedAt ?? null
  )
}

/**
 * Minutes from the rider taking an order to the customer receiving it. Orders with no offer or
 * assignment record are measured from when they were placed, so older orders still count.
 */
function minutesToDeliver(data: Loaded, orderId: string, boyId: string): number | null {
  const delivered = data.events.find((e) => e.orderId === orderId && e.to === "delivered")
  if (!delivered) return null
  const start =
    acceptedAt(data, orderId, boyId) ?? data.orders.find((o) => o.id === orderId)?.placedAt ?? null
  if (!start) return null
  return (delivered.at.getTime() - start.getTime()) / 60_000
}

function totalsFor(data: Loaded, boyId: string): Totals {
  const t = emptyTotals()
  const mine = data.orders.filter((o) => o.deliveryBoyId === boyId)
  for (const order of mine) {
    if (order.status === "delivered") {
      t.deliveries += 1
      const minutes = minutesToDeliver(data, order.id, boyId)
      if (minutes !== null) {
        t.minutesSum += minutes
        t.minutesCount += 1
      }
    }
    t.complaints += data.complaints.filter((c) => c.orderId === order.id).length
  }
  for (const offer of data.offers) {
    if (offer.boyId !== boyId) continue
    t.offersSent += 1
    if (offer.status === "accepted") t.offersAccepted += 1
  }
  for (const row of data.cod) if (row.boyId === boyId) t.codCollectedPaise += row.amountPaise
  return t
}

const average = (t: Totals) => (t.minutesCount ? Math.round(t.minutesSum / t.minutesCount) : null)

const publicCounts = (t: Totals) => ({
  deliveries: t.deliveries,
  avgMinutes: average(t),
  offersSent: t.offersSent,
  offersAccepted: t.offersAccepted,
  complaints: t.complaints,
  codCollectedPaise: t.codCollectedPaise,
})

export async function riderComparison(s: Scope, w: Span): Promise<RiderComparisonRow[]> {
  const data = await loadWindow(s, w)
  return data.boys
    .map((boy) => ({
      boyId: boy.id,
      code: boy.code,
      name: boy.name,
      fleetId: boy.fleetId,
      fleetName: boy.fleet.name,
      zoneName: `${boy.zone.location}, ${boy.zone.district}`,
      ...publicCounts(totalsFor(data, boy.id)),
    }))
    .sort((a, b) => b.deliveries - a.deliveries || a.code.localeCompare(b.code))
    .slice(0, 100)
}

export async function partnerComparison(s: Scope, w: Span): Promise<PartnerComparisonRow[]> {
  const data = await loadWindow(s, w)
  const byFleet = new Map<string, { name: string; riders: number; totals: Totals }>()
  for (const boy of data.boys) {
    const entry = byFleet.get(boy.fleetId) ?? {
      name: boy.fleet.name,
      riders: 0,
      totals: emptyTotals(),
    }
    const t = totalsFor(data, boy.id)
    entry.riders += 1
    entry.totals.deliveries += t.deliveries
    entry.totals.minutesSum += t.minutesSum
    entry.totals.minutesCount += t.minutesCount
    entry.totals.offersSent += t.offersSent
    entry.totals.offersAccepted += t.offersAccepted
    entry.totals.complaints += t.complaints
    entry.totals.codCollectedPaise += t.codCollectedPaise
    byFleet.set(boy.fleetId, entry)
  }
  return [...byFleet.entries()]
    .map(([fleetId, e]) => ({
      fleetId,
      fleetName: e.name,
      riders: e.riders,
      ...publicCounts(e.totals),
    }))
    .sort((a, b) => b.deliveries - a.deliveries || a.fleetName.localeCompare(b.fleetName))
}

/** One rider's orders in the window, newest first, with the steps each one went through. */
export async function riderDeliveries(s: Scope, w: Span): Promise<RiderDeliveryRow[]> {
  if (!s.boyId) throw notFound("Rider")
  const data = await loadWindow(s, w)
  if (data.boys.length === 0) throw notFound("Rider")
  const boyId = s.boyId
  return data.orders
    .filter((o) => o.deliveryBoyId === boyId)
    .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())
    .slice(0, 50)
    .map((order) => {
      const at = (step: string) =>
        data.events
          .filter((e) => e.orderId === order.id && e.to === step)
          .sort((a, b) => a.at.getTime() - b.at.getTime())[0]?.at ?? null
      const stepAt: Record<string, Date | null> = {
        placed: order.placedAt,
        accepted: acceptedAt(data, order.id, boyId),
        picked_up: at("picked_up"),
        out_for_delivery: at("out_for_delivery"),
        delivered: at("delivered"),
      }
      return {
        orderId: order.id,
        orderCode: order.code,
        business: order.business,
        vendorName: order.vendor.name,
        placedAt: order.placedAt.toISOString(),
        delivered: order.status === "delivered",
        steps: RIDER_STEPS.map((key) => ({
          key,
          label: STEP_LABEL[key],
          at: stepAt[key]?.toISOString() ?? null,
        })),
        codeVerified: order.otpVerifiedAt !== null,
        proofAt: order.proofAt?.toISOString() ?? null,
        amountPaise: order.totalPaise,
        complaints: data.complaints
          .filter((c) => c.orderId === order.id)
          .map((c) => ({
            code: c.code,
            category: c.category,
            status: c.status,
            priority: c.priority,
          })),
      }
    })
}
