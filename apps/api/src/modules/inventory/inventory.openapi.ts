// OpenAPI for inventory, stored notifications and the member's own account (sessions,
// preferences). Kept together because each is small.
import {
  InventorySummary,
  MemberPreferences,
  NotificationList,
  NotificationQuery,
  paged,
  Product,
  ProductListQuery,
  ProductStatusRequest,
  SessionInfo,
  StockAdjustRequest,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, noContent, registry } from "../../openapi/registry"

const id = z.object({ id: z.string() })
const body = (schema: z.ZodType) => ({ content: { "application/json": { schema } } })
const ProductRef = registry.register("Product", Product)

registry.registerPath({
  method: "get",
  path: "/inventory",
  tags: ["Inventory"],
  summary: "GLOARO MART products in the member's zones, lowest stock first",
  request: { query: ProductListQuery },
  responses: { 200: json(paged(ProductRef), "A page of products"), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/inventory/summary",
  tags: ["Inventory"],
  summary: "Product, low-stock and out-of-stock counts and stock value",
  responses: { 200: json(InventorySummary, "Counts"), ...errors(401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/inventory/{id}/stock",
  tags: ["Inventory"],
  summary: "Add or remove stock (version-checked, audited)",
  request: { params: id, body: body(StockAdjustRequest) },
  responses: { 200: json(ProductRef, "The product"), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "post",
  path: "/inventory/{id}/status",
  tags: ["Inventory"],
  summary: "Pause or reactivate a product",
  request: { params: id, body: body(ProductStatusRequest) },
  responses: { 200: json(ProductRef, "The product"), ...errors(400, 401, 403, 404, 409) },
})

registry.registerPath({
  method: "get",
  path: "/notifications",
  tags: ["Notifications"],
  summary: "The signed-in member's notifications, newest first, with the unread count",
  request: { query: NotificationQuery },
  responses: { 200: json(NotificationList, "Notifications"), ...errors(400, 401) },
})
registry.registerPath({
  method: "post",
  path: "/notifications/read-all",
  tags: ["Notifications"],
  summary: "Mark every notification read",
  responses: { 204: noContent, ...errors(401) },
})
registry.registerPath({
  method: "post",
  path: "/notifications/{id}/read",
  tags: ["Notifications"],
  summary: "Mark one notification read",
  request: { params: id },
  responses: { 204: noContent, ...errors(401, 404) },
})

registry.registerPath({
  method: "get",
  path: "/auth/sessions",
  tags: ["Auth"],
  summary: "The member's signed-in sessions",
  responses: { 200: json(z.array(SessionInfo), "Sessions"), ...errors(401) },
})
registry.registerPath({
  method: "post",
  path: "/auth/sessions/end-others",
  tags: ["Auth"],
  summary: "Sign out every other session",
  responses: { 200: json(z.object({ ended: z.number().int() }), "How many ended"), ...errors(401) },
})
registry.registerPath({
  method: "delete",
  path: "/auth/sessions/{id}",
  tags: ["Auth"],
  summary: "Sign out one session",
  request: { params: id },
  responses: { 204: noContent, ...errors(401, 404) },
})
registry.registerPath({
  method: "get",
  path: "/auth/preferences",
  tags: ["Auth"],
  summary: "Notification preferences",
  responses: { 200: json(MemberPreferences, "Preferences"), ...errors(401) },
})
registry.registerPath({
  method: "put",
  path: "/auth/preferences",
  tags: ["Auth"],
  summary: "Save notification preferences",
  request: { body: body(MemberPreferences) },
  responses: { 200: json(MemberPreferences, "Saved"), ...errors(400, 401) },
})
