import {
  AssignFleetZoneRequest,
  CreateDeliveryFleetRequest,
  DeliveryBoyApplicationRequest,
  DeliveryBoyAssignmentRequest,
  DeliveryBoy,
  DeliveryBoyCorrectionRequest,
  DeliveryBoyDocument,
  DeliveryBoyDocumentKind,
  DeliveryBoyDocumentVerifyRequest,
  DeliveryBoyOrderStatusRequest,
  DeliveryBoyListQuery,
  DeliveryBoyOtpChallenge,
  DeliveryBoyOtpRequest,
  DeliveryBoyReviewRequest,
  DeliveryBoySubmissionRequest,
  DeliveryFleet,
  DeliveryFleetListQuery,
  DeliveryFleetOrder,
  DeliveryFleetReviewRequest,
  DeliveryHistoryEntry,
  RequestDeliveryFleetRequest,
  RotateCredentialRequest,
  UpdateDeliveryFleetRequest,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, noContent, registry } from "../../openapi/registry"

const tags = ["Delivery management"]
const id = z.object({ id: z.string() })
const boyAndDocument = z.object({ id: z.string(), docId: z.string() })
const fleetAndZone = z.object({ id: z.string(), zoneId: z.string() })
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
const FleetPage = registry.register("DeliveryFleetPage", page(DeliveryFleet))
const BoyPage = registry.register("DeliveryBoyPage", page(DeliveryBoy))
const FleetWithCredential = registry.register(
  "DeliveryFleetWithCredential",
  z.object({
    fleet: DeliveryFleet,
    credential: z.string(),
    deliveryBoys: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  }),
)
const Credential = registry.register(
  "DeliveryFleetCredential",
  z.object({ credential: z.string() }),
)
const FleetReview = registry.register(
  "DeliveryFleetReview",
  z.object({ fleet: DeliveryFleet, credential: z.string().nullable() }),
)
const FleetBoys = registry.register("DeliveryFleetBoys", z.array(DeliveryBoy))
const FleetOrders = registry.register("DeliveryFleetOrders", z.array(DeliveryFleetOrder))
const BoyNotification = registry.register(
  "DeliveryBoyNotification",
  z.object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    readAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  }),
)
const StoredBoyDocument = registry.register("DeliveryBoyDocument", DeliveryBoyDocument)
const fleetCredential = z.object({ "x-partner-credential": z.string() })
const binary = Object.fromEntries(
  ["application/pdf", "image/jpeg", "image/png"].map((type) => [
    type,
    { schema: z.string().openapi({ format: "binary" }) },
  ]),
)

registry.registerPath({
  method: "get",
  path: "/delivery/fleets",
  tags,
  summary: "List delivery fleet partners",
  request: { query: DeliveryFleetListQuery },
  responses: { 200: json(FleetPage), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/fleets",
  tags,
  summary: "Create a fleet and issue its one-time partner credential",
  request: { body: json(CreateDeliveryFleetRequest) },
  responses: { 201: json(FleetWithCredential), ...errors(400, 401, 403, 409) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/fleet-requests",
  tags,
  summary: "Admin asks Super Admin to create a delivery partner for their zones",
  request: { body: json(RequestDeliveryFleetRequest) },
  responses: { 201: json(DeliveryFleet), ...errors(400, 401, 403, 409) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/fleets/{id}/review",
  tags,
  summary: "Super Admin approves (issues the partner credential) or rejects a partner request",
  request: { params: id, body: json(DeliveryFleetReviewRequest) },
  responses: { 200: json(FleetReview), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/fleets/{id}/history",
  tags,
  summary: "Who changed the partner, why, and what changed",
  request: { params: id },
  responses: { 200: json(z.array(DeliveryHistoryEntry)), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/intake/fleet/me/boys/{id}/history",
  tags,
  summary: "A delivery boy's approval steps for this partner, oldest first in the timeline",
  request: { params: id, headers: fleetCredential },
  responses: { 200: json(z.array(DeliveryHistoryEntry)), ...errors(401, 404) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/orders/{id}/suggestions",
  tags,
  summary: "Riders who could take this order now, least busy first",
  request: { params: id },
  responses: {
    200: json(
      z.array(
        z.object({
          id: z.string(),
          code: z.string(),
          name: z.string(),
          fleetName: z.string(),
          activeOrders: z.number().int(),
          maxActiveOrders: z.number().int(),
        }),
      ),
    ),
    ...errors(401, 403, 404),
  },
})
registry.registerPath({
  method: "get",
  path: "/delivery/boys/{id}/history",
  tags,
  summary: "Who changed the delivery boy, why, and what changed",
  request: { params: id },
  responses: { 200: json(z.array(DeliveryHistoryEntry)), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "patch",
  path: "/delivery/fleets/{id}",
  tags,
  summary: "Update fleet profile or active status (reason required)",
  request: { params: id, body: json(UpdateDeliveryFleetRequest) },
  responses: { 200: json(DeliveryFleet), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/fleets/{id}/credential",
  tags,
  summary: "Rotate a fleet partner credential (reason required)",
  request: { params: id, body: json(RotateCredentialRequest) },
  responses: { 200: json(Credential), ...errors(400, 401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/fleets/{id}/zones/{zoneId}",
  tags,
  summary: "Assign or replace a zone's primary fleet",
  request: { params: fleetAndZone, body: json(AssignFleetZoneRequest) },
  responses: { 204: noContent, ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/boys",
  tags,
  summary: "List delivery boy applications in the member's authorized zones",
  request: { query: DeliveryBoyListQuery },
  responses: { 200: json(BoyPage), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/boys/{id}",
  tags,
  summary: "View a delivery boy application and review history",
  request: { params: id },
  responses: { 200: json(DeliveryBoy), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/boys/{id}/review",
  tags,
  summary: "Forward, return, reject, or finally approve an application",
  request: { params: id, body: json(DeliveryBoyReviewRequest) },
  responses: { 200: json(DeliveryBoy), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/boys/{id}/documents/{docId}/verify",
  tags,
  summary: "Verify or unverify a required application document",
  request: { params: boyAndDocument, body: json(DeliveryBoyDocumentVerifyRequest) },
  responses: { 200: json(StoredBoyDocument), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/boys/{id}/documents/{docId}/file",
  tags,
  summary: "View a delivery boy application document",
  request: { params: boyAndDocument },
  responses: {
    200: { description: "The stored document", content: binary },
    ...errors(401, 403, 404),
  },
})
registry.registerPath({
  method: "get",
  path: "/delivery/intake/fleet/me",
  tags,
  summary: "Get the authenticated delivery partner profile and assigned business areas",
  request: { headers: fleetCredential },
  responses: { 200: json(DeliveryFleet), ...errors(401) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/intake/fleet/me/boys",
  tags,
  summary: "List applications belonging to the authenticated fleet",
  request: { headers: fleetCredential },
  responses: { 200: json(FleetBoys), ...errors(401) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/fleet/me/boys/otp",
  tags,
  summary: "Send an OTP to verify a new delivery boy's phone number",
  request: { headers: fleetCredential, body: json(DeliveryBoyOtpRequest) },
  responses: { 200: json(DeliveryBoyOtpChallenge), ...errors(400, 401, 403, 429, 503) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/intake/fleet/me/orders",
  tags,
  summary: "List eligible orders in the authenticated fleet's active zones",
  request: { headers: fleetCredential },
  responses: { 200: json(FleetOrders), ...errors(401) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/fleet/me/orders/{orderId}/assign",
  tags,
  summary: "Assign an eligible order to an approved, available rider",
  request: {
    params: z.object({ orderId: z.string() }),
    headers: fleetCredential,
    body: json(DeliveryBoyAssignmentRequest),
  },
  responses: { 200: json(DeliveryFleetOrder), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/fleet/me/orders/{orderId}/status",
  tags,
  summary: "Advance an assigned order through the existing delivery status workflow",
  request: {
    params: z.object({ orderId: z.string() }),
    headers: fleetCredential,
    body: json(DeliveryBoyOrderStatusRequest),
  },
  responses: { 200: json(DeliveryFleetOrder), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/intake/fleet/me/boys/{id}/notifications",
  tags,
  summary: "List notifications for a delivery boy owned by the authenticated fleet",
  request: { params: id, headers: fleetCredential },
  responses: { 200: json(z.array(BoyNotification)), ...errors(401, 404) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/fleet/me/boys/{id}/notifications/{notificationId}/read",
  tags,
  summary: "Mark a delivery boy notification as read",
  request: {
    params: z.object({ id: z.string(), notificationId: z.string() }),
    headers: fleetCredential,
  },
  responses: { 204: noContent, ...errors(401, 404) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/fleet/me/boys",
  tags,
  summary: "Submit a delivery boy application for an assigned zone",
  request: {
    headers: fleetCredential,
    body: json(DeliveryBoySubmissionRequest),
  },
  responses: { 201: json(DeliveryBoy), ...errors(400, 401, 403, 409) },
})
registry.registerPath({
  method: "patch",
  path: "/delivery/intake/fleet/me/boys/{id}",
  tags,
  summary: "Resubmit a returned application with corrections",
  request: {
    params: id,
    headers: fleetCredential,
    body: json(DeliveryBoyCorrectionRequest),
  },
  responses: { 200: json(DeliveryBoy), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "put",
  path: "/delivery/intake/fleet/me/boys/{id}/documents/{kind}",
  tags,
  summary: "Upload or replace an application document",
  request: {
    params: z.object({ id: z.string(), kind: DeliveryBoyDocumentKind }),
    headers: fleetCredential.extend({ "x-file-name": z.string().optional() }),
    body: { content: binary, required: true },
  },
  responses: { 201: json(StoredBoyDocument), ...errors(400, 401, 403, 404, 409) },
})

registry.registerPath({
  method: "post",
  path: "/delivery/fleets/{id}/boys",
  tags,
  summary: "Super Admin adds a delivery boy to an existing active partner, in one of its zones",
  request: { params: id, body: json(DeliveryBoyApplicationRequest) },
  responses: { 201: json(DeliveryBoy), ...errors(400, 401, 403, 404, 409) },
})
