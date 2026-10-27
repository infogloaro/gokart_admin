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
})
export type Order = z.infer<typeof Order>

export const OrderListQuery = z.object({
  business: Business.optional(),
  status: OrderStatus.optional(),
  search: z.string().trim().optional(),
  /** Orders carried by one delivery partner. */
  partnerId: z.string().optional(),
  /** Orders from one restaurant or seller. */
  vendorId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const ChangeOrderStatusRequest = z.object({
  to: OrderStatus,
  /** The version the client last saw; a mismatch returns 409. */
  version: z.number().int(),
  reason: z.string().trim().max(500).optional(),
})
