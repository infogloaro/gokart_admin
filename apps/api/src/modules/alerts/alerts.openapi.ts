import { z } from "zod"
import { Business } from "@zoauro/shared"
import { errors, json, registry } from "../../openapi/registry"

const tags = ["Alerts"]
const id = z.object({ id: z.string() })

const Alert = registry.register(
  "OperationalAlert",
  z.object({
    id: z.string(),
    kind: z.enum([
      "delayed_order",
      "payment_failed",
      "vendor_issue",
      "security",
      "document_expiry",
      "rider_off_zone",
    ]),
    business: Business.nullable(),
    zoneId: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    link: z.string().nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  }),
)

const AlertPage = registry.register(
  "OperationalAlertPage",
  z.object({
    items: z.array(Alert),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    openCount: z.number().int(),
    counts: z.record(z.string(), z.number().int()),
    volume: z.array(
      z.object({
        zoneId: z.string(),
        zoneName: z.string(),
        today: z.number().int(),
        usualPerDay: z.number(),
        flagged: z.boolean(),
        reason: z.string().nullable(),
      }),
    ),
  }),
)

registry.registerPath({
  method: "get",
  path: "/alerts",
  tags,
  summary: "Open or resolved operational alerts for the member, with today's unusual order volume",
  request: {
    query: z.object({
      status: z.enum(["open", "resolved"]).optional(),
      kind: z
        .enum([
          "delayed_order",
          "payment_failed",
          "vendor_issue",
          "security",
          "document_expiry",
          "rider_off_zone",
        ])
        .optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
  },
  responses: { 200: json(AlertPage), ...errors(401, 403) },
})

registry.registerPath({
  method: "post",
  path: "/alerts/resolve-many",
  tags,
  summary: "Mark several alerts resolved at once",
  request: { body: json(z.object({ ids: z.array(z.string()).min(1).max(200) })) },
  responses: {
    200: json(z.object({ resolved: z.number().int() }), "Number resolved"),
    ...errors(400, 401, 403),
  },
})

registry.registerPath({
  method: "post",
  path: "/alerts/{id}/resolve",
  tags,
  summary: "Mark an alert resolved",
  request: { params: id },
  responses: { 204: { description: "Resolved" }, ...errors(401, 403, 404) },
})
