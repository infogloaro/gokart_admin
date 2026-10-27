import { canTransition, orderStatusLabel, type Order, type OrderStatus } from "@zoauro/shared"
import type { Actor } from "../../lib/audit"
import { badRequest, notFound } from "../../lib/errors"
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

export async function get(id: string, scope: Scope) {
  return toDto(await loadInScope(id, scope))
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
