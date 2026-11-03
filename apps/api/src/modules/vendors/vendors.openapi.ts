import {
  CreateVendorRequest,
  DOCUMENT_TYPES,
  DocumentVerifyRequest,
  StoredDocument,
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

const StoredDocumentRef = registry.register("VendorDocument", StoredDocument)
const binary = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t, { schema: z.string().openapi({ format: "binary" }) }]),
)
registry.registerPath({
  method: "put",
  path: "/vendors/{id}/documents/{kind}",
  tags,
  summary: "Upload a vendor document (PDF, JPG or PNG, up to 10 MB); replaces the same kind",
  request: {
    params: z.object({ id: z.string(), kind: z.string() }),
    headers: z.object({ "x-file-name": z.string().optional() }),
    body: { content: binary, required: true },
  },
  responses: {
    201: json(StoredDocumentRef, "The stored document"),
    ...errors(400, 401, 403, 404),
  },
})
registry.registerPath({
  method: "get",
  path: "/vendors/{id}/documents/{docId}/file",
  tags,
  summary: "Download or view a vendor document",
  request: { params: z.object({ id: z.string(), docId: z.string() }) },
  responses: {
    200: { description: "The file", content: binary },
    ...errors(401, 403, 404),
  },
})
registry.registerPath({
  method: "post",
  path: "/vendors/{id}/documents/{docId}/verify",
  tags,
  summary: "Mark a vendor document verified or not verified",
  request: {
    params: z.object({ id: z.string(), docId: z.string() }),
    body: json(DocumentVerifyRequest),
  },
  responses: { 200: json(StoredDocumentRef, "Updated document"), ...errors(400, 401, 403, 404) },
})

registry.registerPath({
  method: "get",
  path: "/vendors/scorecards",
  tags,
  summary:
    "Last 30 days per vendor: orders, on-time delivery, cancellations, complaints, and attention flags",
  responses: {
    200: {
      description: "Vendor scorecards",
      content: {
        "application/json": {
          schema: z.object({
            windowDays: z.number().int(),
            items: z.array(
              z.object({
                vendorId: z.string(),
                vendorName: z.string(),
                business: z.enum(["food", "mart"]),
                orders: z.number().int(),
                delivered: z.number().int(),
                cancelled: z.number().int(),
                onTimePct: z.number().int().nullable(),
                cancelPct: z.number().int().nullable(),
                complaints: z.number().int(),
                needsAttention: z.boolean(),
                reasons: z.array(z.string()),
              }),
            ),
          }),
        },
      },
    },
    ...errors(401, 403),
  },
})
