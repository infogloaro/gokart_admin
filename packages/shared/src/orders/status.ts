// Order state machine. The API applies every change through `canTransition`
// together with a version check; the web app uses the same table to decide
// which actions to offer. Confirm with operations before relying on it.
import { z } from "zod"
import type { Business } from "../common/enums"

export const ORDER_STATUSES = [
  "placed",
  "accepted",
  "preparing", // food only
  "packed", // mart only
  "ready",
  "assigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refund_requested",
  "refunded",
] as const
export const OrderStatus = z.enum(ORDER_STATUSES)
export type OrderStatus = z.infer<typeof OrderStatus>

type Flow = Partial<Record<OrderStatus, readonly OrderStatus[]>>

const shared: Flow = {
  ready: ["assigned", "cancelled"],
  assigned: ["picked_up", "ready", "cancelled"], // back to ready = unassign
  picked_up: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: ["refund_requested"],
  refund_requested: ["refunded", "delivered"], // delivered = refund declined
}

export const orderFlow: Record<Business, Flow> = {
  food: {
    placed: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ...shared,
  },
  mart: {
    placed: ["accepted", "cancelled"],
    accepted: ["packed", "cancelled"],
    packed: ["ready", "cancelled"],
    ...shared,
  },
}

export const canTransition = (business: Business, from: OrderStatus, to: OrderStatus) =>
  orderFlow[business][from]?.includes(to) ?? false

export const nextStatuses = (business: Business, from: OrderStatus): readonly OrderStatus[] =>
  orderFlow[business][from] ?? []

export const isTerminal = (business: Business, s: OrderStatus) =>
  nextStatuses(business, s).length === 0

const labels: Record<OrderStatus, string> = {
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  packed: "Packed",
  ready: "Ready",
  assigned: "Assigned",
  picked_up: "Picked up",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refund_requested: "Refund requested",
  refunded: "Refunded",
}

/** Labels as the prototype shows them for each business. */
export function orderStatusLabel(business: Business, s: OrderStatus): string {
  if (s === "ready") return business === "food" ? "Ready for pickup" : "Ready to dispatch"
  if (s === "out_for_delivery") return business === "food" ? "On the way" : "In transit"
  return labels[s]
}
