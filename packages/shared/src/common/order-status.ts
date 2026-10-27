import { z } from "zod"

// Taken from the prototype's labels (docs/build-plan.html). Not yet confirmed
// with operations, including who may cancel at each step.
export const ORDER_STATUSES = [
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "READY_TO_DISPATCH",
  "ASSIGNED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const

export const orderStatusSchema = z.enum(ORDER_STATUSES)

export type OrderStatus = z.infer<typeof orderStatusSchema>
