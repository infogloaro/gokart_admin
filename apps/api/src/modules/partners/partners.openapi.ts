import {
  CreatePartnerRequest,
  DOCUMENT_TYPES,
  DocumentVerifyRequest,
  StoredDocument,
  paged,
  Partner,
  PartnerDecisionRequest,
  PartnerDetail,
  PartnerListQuery,
  PartnerSummary,
  UpdatePartnerRequest,
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
registry.registerPath({
  method: "patch",
  path: "/partners/{id}",
  tags,
  summary: "Edit a partner profile (Super Admin)",
  request: { params: id, body: json(UpdatePartnerRequest) },
  responses: {
    200: json(PartnerDetailRef, "Updated partner"),
    ...errors(400, 401, 403, 404, 409),
  },
})

const StoredDocumentRef = registry.register("PartnerDocument", StoredDocument)
const binary = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t, { schema: z.string().openapi({ format: "binary" }) }]),
)
registry.registerPath({
  method: "put",
  path: "/partners/{id}/documents/{kind}",
  tags,
  summary: "Upload a partner document (PDF, JPG or PNG, up to 10 MB); replaces the same kind",
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
  path: "/partners/{id}/documents/{docId}/file",
  tags,
  summary: "Download or view a partner document",
  request: { params: z.object({ id: z.string(), docId: z.string() }) },
  responses: {
    200: { description: "The file", content: binary },
    ...errors(401, 403, 404),
  },
})
registry.registerPath({
  method: "post",
  path: "/partners/{id}/documents/{docId}/verify",
  tags,
  summary: "Mark a partner document verified or not verified",
  request: {
    params: z.object({ id: z.string(), docId: z.string() }),
    body: json(DocumentVerifyRequest),
  },
  responses: { 200: json(StoredDocumentRef, "Updated document"), ...errors(400, 401, 403, 404) },
})
