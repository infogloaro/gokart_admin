// Live tracking: what the partner app sends through intake, what the map reads, and
// the realtime events pushed to members watching a zone.
import { z } from "zod"
import { Business } from "../common/enums"
import { OrderStatus } from "../orders/status"
import { PartnerAvailability, VehicleType } from "../partners/schemas"

export const Coordinates = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/** One GPS fix from the partner app. `at` defaults to when the API receives it. */
export const LocationPing = Coordinates.extend({
  speedKmh: z.number().min(0).max(200).optional(),
  heading: z.number().min(0).max(360).optional(),
  at: z.iso.datetime().optional(),
})
export type LocationPing = z.infer<typeof LocationPing>

export const ShiftRequest = z.object({ action: z.enum(["start", "end"]) })

/** The partner app reporting progress on an order it carries. */
export const IntakeOrderStatusRequest = z.object({
  partnerCode: z.string().min(1),
  to: OrderStatus,
})

export const TrackedLocation = Coordinates.extend({
  speedKmh: z.number().nullable(),
  heading: z.number().nullable(),
  at: z.iso.datetime(),
})
export type TrackedLocation = z.infer<typeof TrackedLocation>

export const TrackedPartner = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  phone: z.string(),
  businesses: z.array(Business),
  zoneId: z.string(),
  zoneName: z.string(),
  vehicleType: VehicleType,
  vehicleNumber: z.string(),
  availability: PartnerAvailability,
  currentOrder: z
    .object({ id: z.string(), code: z.string(), business: Business, status: OrderStatus })
    .nullable(),
  /** Latest fix, or null when the partner hasn't reported one recently. */
  location: TrackedLocation.nullable(),
})
export type TrackedPartner = z.infer<typeof TrackedPartner>

export const TrackingZone = Coordinates.extend({
  id: z.string(),
  name: z.string(),
  district: z.string(),
})
export type TrackingZone = z.infer<typeof TrackingZone>

export const TrackingQuery = z.object({
  business: Business.optional(),
  zoneId: z.string().optional(),
})

export const TrailQuery = z.object({
  minutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .default(30),
})
export const TrailPoint = Coordinates.extend({ at: z.iso.datetime() })

/** Admins can take a partner offline or bring them back; "on delivery" follows orders. */
export const AvailabilityOverrideRequest = z.object({
  availability: z.enum(["available", "offline"]),
  reason: z.string().trim().min(3, "Give a short reason").max(300),
})

/** Socket.IO events, server → browser. */
export type TrackingEvents = {
  "partner:location": { partnerId: string; zoneId: string; location: TrackedLocation }
  "partner:availability": {
    partnerId: string
    zoneId: string
    availability: PartnerAvailability
    currentOrderCode: string | null
  }
}

/** How long without a ping before a partner is marked offline. */
export const STALE_AFTER_SECONDS = 180
