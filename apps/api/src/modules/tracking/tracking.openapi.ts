import {
  AvailabilityOverrideRequest,
  IntakeOrderStatusRequest,
  LocationPing,
  OrderStatus,
  PartnerAvailability,
  ShiftRequest,
  TrackedPartner,
  TrackingQuery,
  TrackingZone,
  TrailPoint,
  TrailQuery,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, registry } from "../../openapi/registry"

const intake = ["Intake (partner app)"]
const tags = ["Live tracking"]
const TrackedPartnerRef = registry.register("TrackedPartner", TrackedPartner)
const code = z.object({ code: z.string() })
const id = z.object({ id: z.string() })
const key = z.object({ "x-intake-key": z.string() })

registry.registerPath({
  method: "post",
  path: "/intake/partners/{code}/shift",
  tags: intake,
  summary: "Start or end a shift (online / offline)",
  request: { params: code, headers: key, body: json(ShiftRequest) },
  responses: {
    200: json(z.object({ code: z.string(), availability: PartnerAvailability }), "Availability"),
    ...errors(400, 401, 403, 404),
  },
})
registry.registerPath({
  method: "post",
  path: "/intake/partners/{code}/location",
  tags: intake,
  summary: "Report a GPS fix (every few seconds while on shift)",
  request: { params: code, headers: key, body: json(LocationPing) },
  responses: {
    202: json(z.object({ received: z.boolean() }), "Stored and pushed to the map"),
    ...errors(400, 401, 403, 404),
  },
})
registry.registerPath({
  method: "post",
  path: "/intake/orders/{code}/status",
  tags: intake,
  summary: "Accept a ready order (to: assigned) or report pickup, departure, delivery",
  request: { params: code, headers: key, body: json(IntakeOrderStatusRequest) },
  responses: {
    200: json(z.object({ code: z.string(), status: OrderStatus }), "New order status"),
    ...errors(400, 401, 403, 404, 409),
  },
})
registry.registerPath({
  method: "get",
  path: "/tracking/zones",
  tags,
  summary: "Service areas with map centres, within the member's scope",
  responses: { 200: json(z.array(TrackingZone), "Zones"), ...errors(401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/tracking/partners",
  tags,
  summary: "Approved partners with availability, current order and latest location",
  request: { query: TrackingQuery },
  responses: { 200: json(z.array(TrackedPartnerRef), "Partners"), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/tracking/partners/{id}/trail",
  tags,
  summary: "Recent positions for one partner",
  request: { params: id, query: TrailQuery },
  responses: { 200: json(z.array(TrailPoint), "Oldest first"), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/tracking/partners/{id}/availability",
  tags,
  summary: "Set a partner online or offline by hand (audited)",
  request: { params: id, body: json(AvailabilityOverrideRequest) },
  responses: {
    200: json(TrackedPartnerRef, "Updated partner"),
    ...errors(400, 401, 403, 404, 409),
  },
})
