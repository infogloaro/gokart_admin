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
