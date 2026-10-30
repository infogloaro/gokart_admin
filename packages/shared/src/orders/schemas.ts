import { z } from "zod"
import { Business } from "../common/enums"
import { Paise } from "../common/money"
import { OrderStatus } from "./status"

export const PAYMENT_METHODS = ["upi", "card", "cod", "wallet", "netbanking"] as const
export const PaymentMethod = z.enum(PAYMENT_METHODS)
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const
export const PaymentStatus = z.enum(PAYMENT_STATUSES)

export const OrderItem = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPricePaise: Paise,
})

export const Order = z.object({
  id: z.string(),
  code: z.string(), // ZOF-88219 / GLM-46093
  business: Business,
  status: OrderStatus,
  version: z.number().int(),
  customerName: z.string(),
  customerPhone: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  partnerId: z.string().nullable(),
  partnerName: z.string().nullable(),
  zoneId: z.string(),
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
  itemsTotalPaise: Paise,
  deliveryFeePaise: Paise,
  totalPaise: Paise,
  items: z.array(OrderItem),
  placedAt: z.iso.datetime(),
  /** The latest reason recorded on the order, e.g. why a refund was requested. */
  issue: z.string().nullable(),
  /** Still being fulfilled after its business's time limit (ORDER_SLA_MINUTES). */
  delayed: z.boolean(),
})
export type Order = z.infer<typeof Order>

/** How long an order may take from placed to delivered before it counts as delayed. */
export const ORDER_SLA_MINUTES: Record<"food" | "mart", number> = { food: 45, mart: 240 }

/** Statuses where the order is still being prepared or delivered. */
export const FULFILMENT_STATUSES = [
  "placed",
  "accepted",
  "preparing",
  "packed",
  "ready",
  "assigned",
  "picked_up",
  "out_for_delivery",
] as const

export const OrderEvent = z.object({
  from: OrderStatus.nullable(),
  to: OrderStatus,
  at: z.iso.datetime(),
  /** member, partner, app, system or seed */
  actorType: z.string(),
  actorName: z.string().nullable(),
  reason: z.string().nullable(),
})
export type OrderEvent = z.infer<typeof OrderEvent>

export const OrderDetail = Order.extend({ events: z.array(OrderEvent) })
export type OrderDetail = z.infer<typeof OrderDetail>

export const AssignPartnerRequest = z.object({
  partnerId: z.string().min(1, "Choose a partner"),
  /** The version the client last saw; a mismatch returns 409. */
  version: z.number().int(),
})

/** A partner who could take an order: same business and area, approved and on shift. */
export const AssignablePartner = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  availability: z.enum(["available", "on_delivery", "offline"]),
  /** Orders the partner is already carrying. */
  carrying: z.number().int(),
  vehicleType: z.string(),
})
export type AssignablePartner = z.infer<typeof AssignablePartner>

export const OrderListQuery = z.object({
  business: Business.optional(),
  status: OrderStatus.optional(),
  search: z.string().trim().optional(),
  /** Orders carried by one delivery partner. */
  partnerId: z.string().optional(),
  /** Orders from one restaurant or seller. */
  vendorId: z.string().optional(),
  /** Only orders past their time limit. */
  delayed: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const ChangeOrderStatusRequest = z.object({
  to: OrderStatus,
  /** The version the client last saw; a mismatch returns 409. */
  version: z.number().int(),
  reason: z.string().trim().max(500).optional(),
})
