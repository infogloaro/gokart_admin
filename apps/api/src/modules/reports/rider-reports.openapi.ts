import {
  PartnerComparisonQuery,
  DistrictComparisonRow,
  PartnerComparisonRow,
  RiderComparisonQuery,
  RiderComparisonRow,
  RiderDeliveriesQuery,
  RiderDeliveryRow,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, registry } from "../../openapi/registry"

const tags = ["Reports"]

registry.registerPath({
  method: "get",
  path: "/reports/districts",
  tags,
  summary:
    "District comparison for the period: riders, deliveries, speed, offers, complaints and cash",
  request: { query: PartnerComparisonQuery },
  responses: { 200: json(z.array(DistrictComparisonRow)), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/reports/partners",
  tags,
  summary:
    "Delivery partner comparison for the period: deliveries, speed, offers, complaints and cash",
  request: { query: PartnerComparisonQuery },
  responses: { 200: json(z.array(PartnerComparisonRow)), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/reports/riders",
  tags,
  summary: "Rider comparison for the period, optionally for one delivery partner",
  request: { query: RiderComparisonQuery },
  responses: { 200: json(z.array(RiderComparisonRow)), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/reports/riders/{id}/deliveries",
  tags,
  summary: "One rider's orders for the period, with each step, delivery code, proof and complaints",
  request: {
    params: z.object({ id: z.string() }),
    query: RiderDeliveriesQuery,
  },
  responses: { 200: json(z.array(RiderDeliveryRow)), ...errors(400, 401, 403, 404) },
})
