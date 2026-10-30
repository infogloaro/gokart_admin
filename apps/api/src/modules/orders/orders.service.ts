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
import { badRequest, forbidden, notFound } from "../../lib/errors"
import { refreshAvailability } from "../tracking/tracking.service"
import * as repo from "./orders.repository"

type Scope = { businesses: string[]; zoneIds: string[] | null }

export function toDto(o: repo.OrderRow): Order {
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
    zoneId: o.zoneId,
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
  // The partner's availability follows the orders they carry.
  if (updated.partnerId) await refreshAvailability(updated.partnerId)
  return toDto(updated)
}
