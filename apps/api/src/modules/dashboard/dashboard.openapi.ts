import {
  DashboardHealth,
  DashboardOverview,
  DashboardQuery,
  RevenueQuery,
  RevenueReport,
  SearchQuery,
  SearchResults,
} from "@zoauro/shared"
import { errors, json, registry } from "../../openapi/registry"

const tags = ["Dashboard"]

registry.registerPath({
  method: "get",
  path: "/dashboard/overview",
  tags,
  summary: "Command Center: headline metrics, revenue trend, order mix and work needing attention",
  request: { query: DashboardQuery },
  responses: {
    200: json(registry.register("DashboardOverview", DashboardOverview), "Overview"),
    ...errors(400, 401, 403),
  },
})
registry.registerPath({
  method: "get",
  path: "/dashboard/health",
  tags,
  summary: "Service health per business: acceptance, on-time delivery, completion and rating",
  request: { query: DashboardQuery },
  responses: {
    200: json(registry.register("DashboardHealth", DashboardHealth), "Health"),
    ...errors(400, 401, 403),
  },
})
registry.registerPath({
  method: "get",
  path: "/dashboard/revenue",
  tags,
  summary: "Revenue for one business: commission, delivery fees, refunds and vendor ledger",
  request: { query: RevenueQuery },
  responses: {
    200: json(registry.register("RevenueReport", RevenueReport), "Revenue"),
    ...errors(400, 401, 403),
  },
})
registry.registerPath({
  method: "get",
  path: "/search",
  tags: ["Search"],
  summary: "Orders, vendors and partners matching a code, name or phone, within the member's scope",
  request: { query: SearchQuery },
  responses: {
    200: json(registry.register("SearchResults", SearchResults), "Matches"),
    ...errors(400, 401),
  },
})
