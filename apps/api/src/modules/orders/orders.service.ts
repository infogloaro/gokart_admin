import {
  canTransition,
  FULFILMENT_STATUSES,
  ORDER_SLA_MINUTES,
  orderStatusLabel,
  type AssignablePartner,
  type Order,
  type OrderDetail,
  type OrderStatus,
} from "@zoauro/shared"
import type { Actor } from "../../lib/audit"
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors"
import type { MemberContext } from "../../middleware/auth"
import { assignOrderToBoy, suggestRiders } from "../delivery/delivery.service"
import { TRANSIT_STATUSES } from "../delivery/delivery.policy"
import { refreshAvailability } from "../tracking/tracking.service"
import { audit } from "../../lib/audit"
import * as repo from "./orders.repository"
import { prisma } from "../../lib/prisma"
import { offerNextRider } from "../rider-ops/offers"

type Scope = { businesses: string[]; zoneIds: string[] | null }

export function toDto(o: repo.OrderRow): Order {
  const responsibleAdmin =
    o.zone.members.find((entry) =>
      entry.member.businesses.some(({ business }) => business === o.business),
    )?.member ?? null
  return {
    id: o.id,
    code: o.code,
    business: o.business,
    status: o.status,
    version: o.version,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    vendorId: o.vendorId,
    vendorName: o.vendor.name,
    partnerId: o.partnerId,
    partnerName: o.partner?.name ?? null,
    deliveryFleetId: o.deliveryFleetId,
    deliveryFleetName: o.deliveryFleet?.name ?? null,
    deliveryBoyId: o.deliveryBoyId,
    deliveryBoyName: o.deliveryBoy?.name ?? null,
    zoneId: o.zoneId,
    zoneName: `${o.zone.location}, ${o.zone.city}`,
    districtId: o.zone.districtId,
    districtName: o.zone.districtRecord.name,
    responsibleAdminId: responsibleAdmin?.id ?? null,
    responsibleAdminName: responsibleAdmin?.name ?? null,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    itemsTotalPaise: o.itemsTotalPaise,
    deliveryFeePaise: o.deliveryFeePaise,
    totalPaise: o.totalPaise,
    items: o.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
    })),
    placedAt: o.placedAt.toISOString(),
    sos: o.sosAt ? { at: o.sosAt.toISOString(), reason: o.sosReason ?? "" } : null,
    issue: [...o.events].reverse().find((e) => e.reason)?.reason ?? null,
    delayed:
      (FULFILMENT_STATUSES as readonly string[]).includes(o.status) &&
      Date.now() - o.placedAt.getTime() > ORDER_SLA_MINUTES[o.business] * 60_000,
  }
}

export async function list(filter: repo.OrderFilter, page: number, pageSize: number) {
  const { items, total } = await repo.list(filter, page, pageSize)
  return { items: items.map(toDto), total, page }
}

export const summary = (scope: { businesses: Order["business"][]; zoneIds: string[] | null }) =>
  repo.summary(scope)

export const filterOptions = (scope: {
  businesses: Order["business"][]
  zoneIds: string[] | null
}) => repo.filterOptions(scope)

// Out-of-scope orders answer 404, not 403, so ids from other zones can't be probed.
async function loadInScope(id: string, scope: Scope) {
  const o = await repo.findById(id)
  if (
    !o ||
    !scope.businesses.includes(o.business) ||
    (scope.zoneIds && !scope.zoneIds.includes(o.zoneId))
  )
    throw notFound("Order")
  return o
}

/** One order with its status history. */
export async function get(id: string, scope: Scope): Promise<OrderDetail> {
  const o = await loadInScope(id, scope)
  const detail = (await repo.findDetail(o.id))!
  const names = await repo.actorNames(
    detail.events.map((e) => e.actorId).filter((x): x is string => Boolean(x)),
  )
  return {
    ...toDto(detail),
    assignmentHistory: detail.deliveryAssignments.map((assignment) => ({
      id: assignment.id,
      fleetId: assignment.fleetId,
      fleetName: assignment.fleet.name,
      boyId: assignment.boyId,
      boyName: assignment.boy.name,
      status: assignment.status,
      assignedAt: assignment.assignedAt.toISOString(),
      endedAt: assignment.endedAt?.toISOString() ?? null,
      reason: assignment.reason,
    })),
    events: detail.events.map((e) => ({
      from: e.from,
      to: e.to,
      at: e.at.toISOString(),
      actorType: e.actorType,
      actorName: (e.actorId && names.get(e.actorId)) || null,
      reason: e.reason,
    })),
  }
}

/** Partners who could take a ready order: same business and area, on shift. */
export async function candidates(id: string, scope: Scope): Promise<AssignablePartner[]> {
  const o = await loadInScope(id, scope)
  const rows = await repo.candidatePartners(o.business, o.zoneId)
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    availability: p.availability,
    carrying: p._count.orders,
    vehicleType: p.vehicleType,
  }))
}

/** Gives a ready order to a partner, or moves an assigned order to someone else. */
export async function assign(
  id: string,
  scope: Scope,
  input: { partnerId: string; version: number },
  actor: Actor,
) {
  const o = await loadInScope(id, scope)
  if (o.status !== "ready" && o.status !== "assigned")
    throw badRequest(
      `Only orders that are ready or assigned can be given to a partner. This one is “${orderStatusLabel(o.business, o.status)}”.`,
    )
  if (o.partnerId === input.partnerId)
    throw badRequest("This order is already assigned to that partner.")
  const partner = (await repo.candidatePartners(o.business, o.zoneId)).find(
    (p) => p.id === input.partnerId,
  )
  if (!partner)
    throw forbidden(
      "That partner can't take this order: they must be approved, on shift, and serve this business and area.",
    )
  if (partner.availability !== "available")
    throw badRequest(`${partner.name} is on another delivery. Choose someone who is free.`)
  const updated = await repo.assignPartner(o, input.version, partner, actor)
  await refreshAvailability(partner.id)
  if (o.partnerId) await refreshAvailability(o.partnerId)
  return toDto(updated)
}

/** Assigns a delivery boy to a ready or assigned order. */
export async function assignBoy(
  id: string,
  scope: Scope,
  input: { boyId: string; version: number },
  actor: Actor,
) {
  const o = await loadInScope(id, scope)
  // An order on the road whose rider raised an SOS goes to the chosen rider as a takeover.
  if (o.sosAt && !o.deliveryBoyId && TRANSIT_STATUSES.includes(o.status)) {
    const boy = await prisma.deliveryBoy.findUnique({
      where: { id: input.boyId },
      select: { fleetId: true },
    })
    if (!boy) throw notFound("Delivery boy")
    await assignOrderToBoy(boy.fleetId, id, input, actor)
    const taken = await repo.findById(id)
    return toDto(taken!)
  }
  if (o.status !== "ready" && o.status !== "assigned")
    throw badRequest(
      `Only orders that are ready or assigned can have a delivery boy assigned. This one is “${orderStatusLabel(o.business, o.status)}”.`,
    )
  if (o.deliveryBoyId) throw badRequest("This order already has a delivery boy assigned.")

  const deliveryBoy = await prisma.deliveryBoy.findUnique({
    where: { id: input.boyId },
    include: {
      fleet: { select: { id: true, name: true } },
      zone: true,
      documents: true,
    },
  })
  if (!deliveryBoy) throw notFound("Delivery boy")
  if (deliveryBoy.status !== "active") throw forbidden("Delivery boy is not active.")
  if (deliveryBoy.availability !== "available")
    throw badRequest(`${deliveryBoy.name} is not available. Choose another rider.`)
  if (deliveryBoy.zoneId !== o.zoneId)
    throw forbidden("This delivery boy is not assigned to the order's zone.")
  const fleet = await prisma.deliveryFleet.findUnique({
    where: { id: deliveryBoy.fleetId },
    select: { status: true, businesses: { select: { business: true } } },
  })
  if (fleet?.status !== "active") throw forbidden("This delivery boy's partner is inactive.")
  if (!fleet.businesses.some(({ business }) => business === o.business))
    throw forbidden("This delivery boy's partner does not serve this business.")
  const primaryZone = await prisma.deliveryFleetZone.findFirst({
    where: { fleetId: deliveryBoy.fleetId, zoneId: o.zoneId, endedAt: null },
    select: { id: true },
  })
  if (!primaryZone)
    throw forbidden("This delivery boy's partner is not the active primary partner for the zone.")
  const orderWithBoy = await repo.findById(o.id)
  if (!orderWithBoy || orderWithBoy.deliveryBoyId)
    throw conflict("This order already has a delivery boy assignment.")
  const workload = await prisma.deliveryAssignment.count({
    where: { boyId: deliveryBoy.id, endedAt: null },
  })
  if (workload >= deliveryBoy.maxActiveOrders)
    throw conflict("This rider has reached the maximum active order limit.")
  const requiredDocs = ["photo_id", "driving_licence", "vehicle_registration"]
  const verifiedDocs = deliveryBoy.documents?.filter(
    (d) =>
      typeof d === "object" &&
      "kind" in d &&
      "verifiedAt" in d &&
      d.verifiedAt != null &&
      requiredDocs.includes((d.kind as string) ?? ""),
  )
  if (verifiedDocs?.length < requiredDocs.length)
    throw conflict("This rider's required documents are not all verified.")

  return prisma.$transaction(async (tx) => {
    // Update the order with the delivery boy assignment
    const updatedOrder = await tx.order.updateMany({
      where: { id: o.id, version: o.version },
      data: {
        status: "assigned",
        deliveryFleetId: deliveryBoy.fleetId,
        deliveryBoyId: deliveryBoy.id,
        version: { increment: 1 },
      },
    })
    if (!updatedOrder.count)
      throw conflict("This order was updated by someone else. Reload to see the latest.")

    // Create the delivery assignment record
    await tx.deliveryAssignment.create({
      data: {
        orderId: o.id,
        fleetId: deliveryBoy.fleetId,
        boyId: deliveryBoy.id,
        status: "assigned",
      },
    })

    // Create the order event for the assignment
    await tx.orderEvent.create({
      data: {
        orderId: o.id,
        from: o.status,
        to: "assigned",
        actorType: "delivery_partner",
        actorId: deliveryBoy.fleetId,
        reason: `Assigned to ${deliveryBoy.name} (${deliveryBoy.code})`,
      },
    })

    // Update the delivery boy's availability
    await tx.deliveryBoy.updateMany({
      where: {
        id: deliveryBoy.id,
        version: deliveryBoy.version,
        status: "active",
        availability: "available",
      },
      data: {
        version: { increment: 1 },
        availability: workload + 1 >= deliveryBoy.maxActiveOrders ? "on_delivery" : "available",
      },
    })

    // Write audit trail
    await audit(
      tx,
      actor,
      "order.delivery_boy_assigned",
      { type: "order", id: o.id },
      { code: o.code, fleetId: deliveryBoy.fleetId, boyId: deliveryBoy.id },
    )

    // Publish outbox event
    await tx.outboxEvent.create({
      data: {
        topic: "order.delivery_boy_assigned",
        payload: {
          orderId: o.id,
          code: o.code,
          fleetId: deliveryBoy.fleetId,
          boyId: deliveryBoy.id,
        },
      },
    })

    // Return the updated order DTO
    const result = await tx.order.findUnique({ where: { id: o.id }, include: repo.withNames })
    return toDto(result as repo.OrderRow)
  })
}

export async function changeStatus(
  id: string,
  scope: Scope,
  input: { to: OrderStatus; version: number; reason?: string | undefined },
  actor: Actor,
) {
  const o = await loadInScope(id, scope)
  if (!canTransition(o.business, o.status, input.to))
    throw badRequest(
      `An order that is “${orderStatusLabel(o.business, o.status)}” can't move to “${orderStatusLabel(o.business, input.to)}”.`,
    )
  if (input.to === "cancelled" && !input.reason)
    throw badRequest("Give a reason for cancelling.", { reason: ["Required"] })
  const updated = await repo.changeStatus(o, input.version, input.to, actor, input.reason)
  // A ready order goes to the best free rider in its zone straight away.
  if (input.to === "ready" && !updated.deliveryBoyId)
    await autoAssignReadyOrder(id).catch(() => null)
  // The partner's availability follows the orders they carry.
  if (updated.partnerId) await refreshAvailability(updated.partnerId)
  return toDto(updated)
}

/**
 * The rider can't continue (accident, breakdown, unwell). Takes the order off them and finds a
 * replacement straight away. The rider themselves (SOS) or the team can do this.
 *
 * - Not picked up yet: the order goes back to "ready" and is offered to the next rider.
 * - Already on the road: it keeps its status and is flagged with an SOS and the place the rider is
 *   stuck, so the nearest rider is offered it and can collect the goods and finish the delivery.
 */
export async function releaseRider(
  id: string,
  input: { reason: string; lat?: number | undefined; lng?: number | undefined },
  who: { scope: Scope } | { riderId: string },
  actor: Actor,
) {
  const order =
    "scope" in who
      ? await loadInScope(id, who.scope)
      : await repo.findById(id).then((row) => {
          if (!row || row.deliveryBoyId !== who.riderId) throw notFound("Order")
          return row
        })
  const boyId = order.deliveryBoyId
  if (!boyId || (order.status !== "assigned" && !TRANSIT_STATUSES.includes(order.status)))
    throw badRequest("This order doesn't have a rider who can be replaced right now.")
  const transit = TRANSIT_STATUSES.includes(order.status)
  const boy = await prisma.deliveryBoy.findUniqueOrThrow({
    where: { id: boyId },
    select: { name: true, code: true, lastLat: true, lastLng: true },
  })
  const lat = input.lat ?? boy.lastLat
  const lng = input.lng ?? boy.lastLng
  const rider = `${boy.name} (${boy.code})`

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, deliveryBoyId: boyId, status: order.status },
      data: {
        status: transit ? order.status : "ready",
        deliveryFleetId: null,
        deliveryBoyId: null,
        version: { increment: 1 },
        sosAt: new Date(),
        sosReason: input.reason,
        sosLat: lat,
        sosLng: lng,
      },
    })
    if (!count) throw conflict("This order was updated by someone else. Reload to see the latest.")
    await tx.deliveryAssignment.updateMany({
      where: { orderId: order.id, boyId, endedAt: null },
      data: {
        status: "cancelled",
        endedAt: new Date(),
        reason: `Could not continue: ${input.reason}`,
      },
    })
    // The rider is out of action until they come back online themselves.
    await tx.deliveryBoy.updateMany({
      where: { id: boyId, status: "active" },
      data: { availability: "offline", version: { increment: 1 } },
    })
    await tx.deliveryOffer.updateMany({
      where: { orderId: order.id, status: "offered" },
      data: { status: "withdrawn" },
    })
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        from: order.status,
        to: transit ? order.status : "ready",
        actorType: "riderId" in who ? "rider" : "member",
        actorId: "riderId" in who ? who.riderId : actor.id,
        reason: `${rider} could not continue: ${input.reason}`,
      },
    })
    await audit(
      tx,
      actor,
      "order.rider_sos",
      { type: "order", id: order.id },
      { code: order.code, boyId, reason: input.reason, onTheRoad: transit },
    )
    await tx.outboxEvent.create({
      data: {
        topic: "order.rider_sos",
        payload: { orderId: order.id, code: order.code, boyId, onTheRoad: transit },
      },
    })
  })
  await refreshOffers(order.id)
  return toDto((await repo.findById(order.id))!)
}

const refreshOffers = (orderId: string) => offerNextRider(orderId).catch(() => null)

/** Assigns the least busy eligible rider for this order (see suggestRiders). */
export async function autoAssignBoy(id: string, scope: Scope, member: MemberContext, actor: Actor) {
  const o = await loadInScope(id, scope)
  const [top] = await suggestRiders(id, member)
  if (!top) throw conflict("No available rider in this zone right now.")
  return assignBoy(id, scope, { boyId: top.id, version: o.version }, actor)
}

/** Stands in for a person when the server assigns riders by itself. Sees every zone and business. */
export const SYSTEM_MEMBER: MemberContext = {
  id: "system",
  name: "System",
  email: "",
  role: "super_admin",
  businesses: ["food", "mart"],
  zoneIds: [],
  permissions: [],
}

/**
 * Gives a ready order to the best rider in its zone, if one is free. Returns the order when it was
 * assigned, or null when nobody is free yet (the sweep tries again).
 */
/** Offers a ready order to the nearest suitable rider. The rider accepts or declines (rider-ops/offers). */
export async function autoAssignReadyOrder(id: string) {
  return offerNextRider(id)
}

/** Ready orders with no rider, oldest first. Run on an interval so nothing waits unassigned. */
export async function assignReadyOrders() {
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { status: "ready" },
        // The rider could not continue: the order on the road needs a replacement too.
        { status: { in: ["picked_up", "out_for_delivery"] }, sosAt: { not: null } },
      ],
      deliveryBoyId: null,
      placedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    },
    select: { id: true },
    orderBy: { placedAt: "asc" },
    take: 50,
  })
  let assigned = 0
  for (const order of orders) if (await autoAssignReadyOrder(order.id).catch(() => null)) assigned++
  return assigned
}
