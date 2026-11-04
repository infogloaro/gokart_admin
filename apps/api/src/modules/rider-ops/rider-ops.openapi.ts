import {
  CodCollectionRow,
  CodQuery,
  RiderSupportReply,
  RiderSupportTicket,
  RiderTicketQuery,
  SendRiderNoticeRequest,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, noContent, registry } from "../../openapi/registry"

const tags = ["Rider operations"]
const id = z.object({ id: z.string() })

registry.registerPath({
  method: "post",
  path: "/delivery/notices",
  tags,
  summary: "Send a notice to riders in scope (specific riders, a zone, or everyone in scope)",
  request: { body: json(SendRiderNoticeRequest) },
  responses: { 201: json(z.object({ sent: z.number().int() })), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/support",
  tags,
  summary: "Support tickets from riders in scope, open first",
  request: { query: RiderTicketQuery },
  responses: {
    200: json(
      z.object({
        items: z.array(RiderSupportTicket),
        total: z.number().int(),
        page: z.number().int(),
        pageSize: z.number().int(),
      }),
    ),
    ...errors(400, 401, 403),
  },
})
registry.registerPath({
  method: "post",
  path: "/delivery/support/{id}/reply",
  tags,
  summary: "Reply to a rider's support ticket (the rider is notified)",
  request: { params: id, body: json(RiderSupportReply) },
  responses: { 201: noContent, ...errors(400, 401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/support/{id}/resolve",
  tags,
  summary: "Close a rider's support ticket",
  request: { params: id },
  responses: { 200: noContent, ...errors(401, 403, 404, 409) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/cod",
  tags,
  summary: "Cash collected from cash-on-delivery orders, and what is still with the riders",
  request: { query: CodQuery },
  responses: {
    200: json(
      z.object({
        items: z.array(CodCollectionRow),
        total: z.number().int(),
        page: z.number().int(),
        pageSize: z.number().int(),
        outstandingPaise: z.number().int(),
      }),
    ),
    ...errors(400, 401, 403),
  },
})
registry.registerPath({
  method: "post",
  path: "/delivery/cod/{id}/handover",
  tags,
  summary: "Confirm that a rider handed the collected cash to the company",
  request: { params: id },
  responses: { 200: noContent, ...errors(401, 403, 404, 409) },
})

const offerRow = z.object({
  id: z.string(),
  orderCode: z.string(),
  business: z.string(),
  riderName: z.string(),
  riderCode: z.string(),
  zoneName: z.string(),
  offeredAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
})
const proofRow = z.object({
  id: z.string(),
  orderCode: z.string(),
  business: z.string(),
  riderName: z.string(),
  riderCode: z.string(),
  zoneName: z.string(),
  proofAt: z.iso.datetime().nullable(),
  codVerified: z.boolean(),
})
const areaRow = z.object({
  id: z.string(),
  riderName: z.string(),
  riderCode: z.string(),
  homeZone: z.string(),
  requestedZone: z.string(),
  status: z.enum(["requested", "approved", "rejected"]),
  requestedAt: z.iso.datetime(),
})

registry.registerPath({
  method: "get",
  path: "/delivery/offers",
  tags,
  summary: "Orders offered to riders and not yet answered, in the member's zones",
  responses: { 200: json(z.array(offerRow)), ...errors(401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/proofs",
  tags,
  summary: "Recent delivered orders with a proof photo, in the member's zones",
  responses: { 200: json(z.array(proofRow)), ...errors(401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/orders/{id}/resend-code",
  tags,
  summary: "Text the customer a new delivery code",
  request: { params: id },
  responses: { 200: json(z.object({ ok: z.boolean() })), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/area-requests",
  tags,
  summary: "Service-area requests from riders, in the member's zones",
  request: {
    query: z.object({ status: z.enum(["requested", "approved", "rejected"]).optional() }),
  },
  responses: { 200: json(z.array(areaRow)), ...errors(401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/area-requests/{id}/approve",
  tags,
  summary: "Approve a rider's request to take orders from another zone",
  request: { params: id },
  responses: { 200: json(z.object({ ok: z.boolean() })), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/area-requests/{id}/reject",
  tags,
  summary: "Reject a rider's request to take orders from another zone",
  request: { params: id },
  responses: { 200: json(z.object({ ok: z.boolean() })), ...errors(401, 403, 404) },
})
