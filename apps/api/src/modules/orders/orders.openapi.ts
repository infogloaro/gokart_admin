import {
  AssignablePartner,
  AssignPartnerRequest,
  Business,
  ChangeOrderStatusRequest,
  Order,
  OrderDetail,
  OrderListQuery,
  paged,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, registry } from "../../openapi/registry"

const tags = ["Orders"]
const OrderRef = registry.register("Order", Order)
const id = z.object({ id: z.string() })

registry.registerPath({
  method: "get",
  path: "/orders",
  tags,
  summary: "Orders in the member's businesses and zones",
  request: { query: OrderListQuery },
  responses: { 200: json(paged(OrderRef), "A page of orders"), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/orders/summary",
  tags,
  summary: "Total and open orders per business",
  responses: {
    200: json(
      z.array(
        z.object({
          business: Business,
          total: z.number().int(),
          open: z.number().int(),
          delayed: z.number().int(),
        }),
      ),
      "Counts",
    ),
    ...errors(401, 403),
  },
})
registry.registerPath({
  method: "get",
  path: "/orders/{id}",
  tags,
  summary: "One order with its status history",
  request: { params: id },
  responses: {
    200: json(registry.register("OrderDetail", OrderDetail), "The order"),
    ...errors(401, 403, 404),
  },
})
registry.registerPath({
  method: "post",
  path: "/orders/{id}/status",
  tags,
  summary: "Move an order to its next status",
  request: { params: id, body: json(ChangeOrderStatusRequest) },
  responses: { 200: json(OrderRef, "Updated order"), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "get",
  path: "/orders/{id}/partners",
  tags,
  summary: "Partners who could take this order (same business and area, on shift)",
  request: { params: id },
  responses: { 200: json(z.array(AssignablePartner), "Candidates"), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/orders/{id}/assign",
  tags,
  summary: "Assign or reassign a delivery partner",
  request: { params: id, body: json(AssignPartnerRequest) },
  responses: { 200: json(OrderRef, "Updated order"), ...errors(400, 401, 403, 404, 409) },
})
