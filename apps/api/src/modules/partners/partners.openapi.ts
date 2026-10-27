import {
  CreatePartnerRequest,
  paged,
  Partner,
  PartnerDecisionRequest,
  PartnerDetail,
  PartnerListQuery,
  PartnerSummary,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, registry } from "../../openapi/registry"

const tags = ["Delivery partners"]
const PartnerRef = registry.register("Partner", Partner)
const PartnerDetailRef = registry.register("PartnerDetail", PartnerDetail)
const id = z.object({ id: z.string() })

registry.registerPath({
  method: "get",
  path: "/partners",
  tags,
  summary: "Delivery partners serving the member's businesses and zones",
  request: { query: PartnerListQuery },
  responses: { 200: json(paged(PartnerRef), "A page of partners"), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/partners/summary",
  tags,
  summary: "Partner counts by status and availability",
  request: { query: PartnerListQuery.pick({ business: true }) },
  responses: { 200: json(PartnerSummary, "Counts"), ...errors(401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/partners/{id}",
  tags,
  summary: "One partner with identity, vehicle, payout and activity",
  request: { params: id },
  responses: { 200: json(PartnerDetailRef, "The partner"), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/partners",
  tags,
  summary: "Submit a partner application for Super Admin approval",
  request: { body: json(CreatePartnerRequest) },
  responses: { 201: json(PartnerDetailRef, "The application"), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/partners/{id}/decision",
  tags,
  summary: "Approve, reject, suspend or reactivate a partner",
  request: { params: id, body: json(PartnerDecisionRequest) },
  responses: {
    200: json(PartnerDetailRef, "Updated partner"),
    ...errors(400, 401, 403, 404, 409),
  },
})
