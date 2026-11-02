import {
  Analytics,
  AnalyticsQuery,
  LedgerEntry,
  LedgerQuery,
  LedgerSummary,
  paged,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, registry } from "../../openapi/registry"

registry.registerPath({
  method: "get",
  path: "/ledger/summary",
  tags: ["Transaction ledger"],
  summary:
    "Gross value, commission, delivery fees, refunds and net revenue, with payment method shares",
  request: { query: LedgerQuery },
  responses: {
    200: json(registry.register("LedgerSummary", LedgerSummary), "Summary"),
    ...errors(400, 401, 403),
  },
})
registry.registerPath({
  method: "get",
  path: "/ledger/transactions",
  tags: ["Transaction ledger"],
  summary: "Order payments, COD collections, refunds, payouts and cash remittances, newest first",
  request: { query: LedgerQuery },
  responses: {
    200: json(paged(registry.register("LedgerEntry", LedgerEntry)), "A page of entries"),
    ...errors(400, 401, 403),
  },
})
registry.registerPath({
  method: "get",
  path: "/reports/analytics",
  tags: ["Reports"],
  summary: "Totals vs the previous window, platform revenue per period per business, top vendors",
  request: { query: AnalyticsQuery },
  responses: {
    200: json(registry.register("Analytics", Analytics), "Analytics"),
    ...errors(400, 401, 403),
  },
})

registry.registerPath({
  method: "get",
  path: "/reports/insights",
  tags: ["Reports"],
  summary: "Zones with unusually many orders today compared with their usual day",
  responses: {
    200: json(
      z.array(
        z.object({
          zoneId: z.string(),
          zoneName: z.string(),
          today: z.number().int(),
          usualPerDay: z.number(),
          flagged: z.boolean(),
          reason: z.string().nullable(),
        }),
      ),
      "Zone insights",
    ),
    ...errors(401, 403),
  },
})
