import {
  EarningsQuery,
  EarningsStatement,
  RiderAnalytics,
  RiderAnalyticsQuery,
  RiderAppPasswordIssued,
  RiderLoginRequest,
  RiderProfileChangeDecision,
  RiderProfileChangePage,
  RiderProfileChangeQuery,
  RiderProfileChangeRequest,
  RiderShiftPage,
  RiderShiftQuery,
  RiderVerificationStatus,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, noContent, registry } from "../../openapi/registry"

const tags = ["Rider operations"]
const id = z.object({ id: z.string() })
const riderHeader = z.object({ "x-rider-token": z.string() })
const riderSession = { headers: riderHeader }

registry.registerPath({
  method: "post",
  path: "/delivery/intake/rider/login",
  tags,
  summary: "Rider app sign-in with phone and app password. Returns a 12-hour session token.",
  request: { body: json(RiderLoginRequest) },
  responses: {
    200: json(
      z.object({
        token: z.string(),
        rider: z.object({
          id: z.string(),
          code: z.string(),
          name: z.string(),
          status: z.string(),
          availability: z.string(),
        }),
      }),
    ),
    ...errors(400, 401),
  },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/rider/logout",
  tags,
  summary: "End the rider app session",
  request: riderSession,
  responses: { 204: noContent, ...errors(401) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/rider/shifts/start",
  tags,
  summary: "Start a shift (returns the open shift if one is already running)",
  request: riderSession,
  responses: {
    201: json(z.object({ id: z.string(), startedAt: z.string() })),
    ...errors(401, 403),
  },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/rider/shifts/end",
  tags,
  summary: "End the open shift",
  request: riderSession,
  responses: { 200: json(z.object({ ended: z.number().int() })), ...errors(401) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/intake/rider/shifts",
  tags,
  summary: "Current shift and the last 20 shifts",
  request: riderSession,
  responses: { 200: json(z.object({}).passthrough()), ...errors(401) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/intake/rider/offers",
  tags,
  summary: "Open order offers for the signed-in rider",
  request: riderSession,
  responses: { 200: json(z.array(z.object({}).passthrough())), ...errors(401) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/rider/offers/{offerId}/accept",
  tags,
  summary: "Accept an order offer; the order is assigned to the rider",
  request: { ...riderSession, params: z.object({ offerId: z.string() }) },
  responses: { 200: json(z.object({ ok: z.boolean() })), ...errors(400, 401, 404) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/rider/offers/{offerId}/decline",
  tags,
  summary: "Decline an order offer, with an optional reason",
  request: {
    ...riderSession,
    params: z.object({ offerId: z.string() }),
    body: json(z.object({ reason: z.string().max(200).optional() })),
  },
  responses: { 200: json(z.object({ ok: z.boolean() })), ...errors(400, 401, 404) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/intake/rider/verification",
  tags,
  summary: "Verification status: documents uploaded, missing documents and the latest review",
  request: riderSession,
  responses: { 200: json(RiderVerificationStatus), ...errors(401) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/intake/rider/profile-changes",
  tags,
  summary: "Ask the team to change a detail on the rider profile (needs approval)",
  request: { ...riderSession, body: json(RiderProfileChangeRequest) },
  responses: {
    201: json(z.object({ id: z.string(), status: z.string(), requestedAt: z.string() })),
    ...errors(400, 401),
  },
})
registry.registerPath({
  method: "get",
  path: "/delivery/intake/rider/profile-changes",
  tags,
  summary: "The rider's last 20 profile change requests",
  request: riderSession,
  responses: { 200: json(z.array(z.object({}).passthrough())), ...errors(401) },
})

registry.registerPath({
  method: "get",
  path: "/delivery/shifts",
  tags,
  summary: "Rider shifts in scope, open or closed",
  request: { query: RiderShiftQuery },
  responses: { 200: json(RiderShiftPage), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/shifts/{id}/end",
  tags,
  summary: "End a rider's open shift (Admin override)",
  request: { params: id },
  responses: { 204: noContent, ...errors(400, 401, 403, 404) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/earnings",
  tags,
  summary:
    "Earnings statement per rider for a date range. Add format=csv or format=xlsx to download.",
  request: { query: EarningsQuery },
  responses: { 200: json(EarningsStatement), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/profile-changes",
  tags,
  summary: "Rider profile change requests in scope",
  request: { query: RiderProfileChangeQuery },
  responses: { 200: json(RiderProfileChangePage), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/profile-changes/{id}/approve",
  tags,
  summary: "Approve a rider's profile change (applies it and notifies the rider)",
  request: { params: id, body: json(RiderProfileChangeDecision) },
  responses: { 204: noContent, ...errors(400, 401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/profile-changes/{id}/reject",
  tags,
  summary: "Reject a rider's profile change with a reason (the rider is notified)",
  request: { params: id, body: json(RiderProfileChangeDecision) },
  responses: { 204: noContent, ...errors(400, 401, 403, 404) },
})
registry.registerPath({
  method: "get",
  path: "/delivery/analytics",
  tags,
  summary:
    "Zone analytics for the last N days: riders, deliveries, offer acceptance, COD outstanding",
  request: { query: RiderAnalyticsQuery },
  responses: { 200: json(RiderAnalytics), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/delivery/boys/{id}/app-password",
  tags,
  summary: "Issue or reset a rider's app password. The password is returned once.",
  request: { params: id },
  responses: { 200: json(RiderAppPasswordIssued), ...errors(401, 403, 404) },
})
