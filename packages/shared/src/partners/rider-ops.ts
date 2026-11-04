// Rider notices, support tickets and cash-on-delivery handover, used by the Admin and Super Admin
// portals and by the rider app's intake API.
import { z } from "zod"
import { Business } from "../common/enums"

export const SendRiderNoticeRequest = z.object({
  /** Specific riders. Leave out to send to everyone in scope (or the zone below). */
  boyIds: z.array(z.string()).min(1).max(500).optional(),
  zoneId: z.string().optional(),
  title: z.string().trim().min(3, "Give the notice a title.").max(120),
  body: z.string().trim().min(3, "Write the notice.").max(1000),
})
export type SendRiderNoticeRequest = z.infer<typeof SendRiderNoticeRequest>

export const RiderTicketStatus = z.enum(["open", "resolved"])
export type RiderTicketStatus = z.infer<typeof RiderTicketStatus>

export const RiderTicketQuery = z.object({
  status: RiderTicketStatus.optional(),
  business: Business.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const RiderSupportMessage = z.object({
  id: z.string(),
  fromRole: z.enum(["rider", "team"]),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
})

export const RiderSupportTicket = z.object({
  id: z.string(),
  subject: z.string(),
  status: RiderTicketStatus,
  boyId: z.string(),
  riderName: z.string(),
  riderCode: z.string(),
  zoneName: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  messages: z.array(RiderSupportMessage),
})
export type RiderSupportTicket = z.infer<typeof RiderSupportTicket>

export const RiderSupportReply = z.object({
  body: z.string().trim().min(2, "Write a reply.").max(2000),
})

/** A rider's ticket as the rider app sees it, from the intake API. */
export const RiderTicketCreate = z.object({
  subject: z.string().trim().min(3, "Say what the problem is.").max(120),
  body: z.string().trim().min(3, "Describe the problem.").max(2000),
})

export const CodStatus = z.enum(["collected", "handed_over"])
export type CodStatus = z.infer<typeof CodStatus>

export const CodQuery = z.object({
  status: CodStatus.optional(),
  zoneId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const CodCollectionRow = z.object({
  id: z.string(),
  orderCode: z.string(),
  riderName: z.string(),
  riderCode: z.string(),
  zoneName: z.string(),
  amountPaise: z.number().int(),
  status: CodStatus,
  collectedAt: z.iso.datetime(),
  handedOverAt: z.iso.datetime().nullable(),
})
export type CodCollectionRow = z.infer<typeof CodCollectionRow>
