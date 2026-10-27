import {
  CreateVendorRequest,
  paged,
  UpdateVendorRequest,
  Vendor,
  VendorDecisionRequest,
  VendorDetail,
  VendorListQuery,
  VendorSummary,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, registry } from "../../openapi/registry"

const tags = ["Vendors"]
const VendorRef = registry.register("Vendor", Vendor)
const VendorDetailRef = registry.register("VendorDetail", VendorDetail)
const id = z.object({ id: z.string() })

registry.registerPath({
  method: "get",
  path: "/vendors",
  tags,
  summary: "Restaurants and sellers in the member's businesses and zones",
  request: { query: VendorListQuery },
  responses: { 200: json(paged(VendorRef), "A page of vendors"), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/vendors/summary",
  tags,
  summary: "Vendor counts by status per business",
  responses: { 200: json(z.array(VendorSummary), "Counts"), ...errors(401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/vendors/{id}",
  tags,
  summary: "One vendor with documents and activity",
  request: { params: id },
  responses: { 200: json(VendorDetailRef, "The vendor"), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/vendors",
  tags,
  summary: "Add a vendor; it waits for review before going live",
  request: { body: json(CreateVendorRequest) },
  responses: { 201: json(VendorDetailRef, "The new vendor"), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/vendors/{id}/decision",
  tags,
  summary: "Approve, reject, suspend or reactivate a vendor",
  request: { params: id, body: json(VendorDecisionRequest) },
  responses: { 200: json(VendorDetailRef, "Updated vendor"), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "patch",
  path: "/vendors/{id}",
  tags,
  summary: "Edit a vendor (Super Admin)",
  request: { params: id, body: json(UpdateVendorRequest) },
  responses: { 200: json(VendorDetailRef, "Updated vendor"), ...errors(400, 401, 403, 404, 409) },
})
