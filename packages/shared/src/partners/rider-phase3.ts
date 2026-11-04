// Phase 3 rider operations: shifts, earnings statements, profile changes, verification status,
// rider app sign-in and analytics. Shared by the API and the Admin and Super Admin portals.
import { z } from "zod"
import { IndianPhone } from "../common/phone"

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD")

// Shifts ---------------------------------------------------------------------------------------
export const RiderShiftStatus = z.enum(["open", "closed"])
export type RiderShiftStatus = z.infer<typeof RiderShiftStatus>

export const RiderShiftQuery = z.object({
  status: RiderShiftStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
export type RiderShiftQuery = z.infer<typeof RiderShiftQuery>

export const RiderShiftRow = z.object({
  id: z.string(),
  riderId: z.string(),
  riderCode: z.string(),
  riderName: z.string(),
  zoneName: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  minutes: z.number().int(),
  endedByAdmin: z.boolean(),
})
export type RiderShiftRow = z.infer<typeof RiderShiftRow>

export const RiderShiftPage = z.object({
  items: z.array(RiderShiftRow),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})
export type RiderShiftPage = z.infer<typeof RiderShiftPage>

// Earnings statements ----------------------------------------------------------------------------
export const EarningsQuery = z
  .object({ from: isoDay, to: isoDay, zoneId: z.string().optional() })
  .refine((q) => q.from <= q.to, { message: "The end date must be on or after the start date" })
export type EarningsQuery = z.infer<typeof EarningsQuery>

export const EarningsRow = z.object({
  riderId: z.string(),
  riderCode: z.string(),
  riderName: z.string(),
  zoneName: z.string(),
  deliveries: z.number().int(),
  feePaise: z.number().int(),
  shiftMinutes: z.number().int(),
})
export type EarningsRow = z.infer<typeof EarningsRow>

export const EarningsStatement = z.object({
  from: z.string(),
  to: z.string(),
  totals: z.object({
    deliveries: z.number().int(),
    feePaise: z.number().int(),
    shiftMinutes: z.number().int(),
  }),
  items: z.array(EarningsRow),
})
export type EarningsStatement = z.infer<typeof EarningsStatement>

// Profile changes ----------------------------------------------------------------------------------
// Only these details can be changed from the rider app. Bank and identity details stay with the team.
export const RiderProfileChangeRequest = z
  .object({
    email: z.string().trim().email().max(120).optional(),
    address: z.string().trim().min(5).max(300).optional(),
    vehicleModel: z.string().trim().min(2).max(60).optional(),
    vehicleNumber: z.string().trim().min(4).max(20).optional(),
    drivingLicence: z.string().trim().min(5).max(30).optional(),
    licenceValidUntil: isoDay.optional(),
    registrationValidUntil: isoDay.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Choose at least one detail to change",
  })
export type RiderProfileChangeRequest = z.infer<typeof RiderProfileChangeRequest>

export const RiderProfileChangeStatus = z.enum(["pending", "approved", "rejected"])
export type RiderProfileChangeStatus = z.infer<typeof RiderProfileChangeStatus>

export const RiderProfileChangeQuery = z.object({
  status: RiderProfileChangeStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
export type RiderProfileChangeQuery = z.infer<typeof RiderProfileChangeQuery>

export const RiderProfileChangeLine = z.object({
  field: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
})

export const RiderProfileChangeRow = z.object({
  id: z.string(),
  riderId: z.string(),
  riderCode: z.string(),
  riderName: z.string(),
  zoneName: z.string(),
  status: RiderProfileChangeStatus,
  requestedAt: z.string(),
  decidedAt: z.string().nullable(),
  reason: z.string().nullable(),
  lines: z.array(RiderProfileChangeLine),
})
export type RiderProfileChangeRow = z.infer<typeof RiderProfileChangeRow>

export const RiderProfileChangePage = z.object({
  items: z.array(RiderProfileChangeRow),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})
export type RiderProfileChangePage = z.infer<typeof RiderProfileChangePage>

export const RiderProfileChangeDecision = z.object({
  reason: z.string().trim().max(300).optional(),
})
export type RiderProfileChangeDecision = z.infer<typeof RiderProfileChangeDecision>

// Verification status (rider app) -------------------------------------------------------------------
export const RiderVerificationStatus = z.object({
  status: z.string(),
  documents: z.array(
    z.object({
      kind: z.string(),
      uploadedAt: z.string(),
      verifiedAt: z.string().nullable(),
    }),
  ),
  missingDocuments: z.array(z.string()),
  latestReview: z
    .object({
      decision: z.string(),
      reason: z.string().nullable(),
      at: z.string(),
    })
    .nullable(),
})
export type RiderVerificationStatus = z.infer<typeof RiderVerificationStatus>

// Analytics --------------------------------------------------------------------------------------
export const RiderAnalyticsQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
})
export type RiderAnalyticsQuery = z.infer<typeof RiderAnalyticsQuery>

export const RiderAnalyticsZone = z.object({
  zoneId: z.string(),
  zoneName: z.string(),
  activeRiders: z.number().int(),
  deliveries: z.number().int(),
  offersSent: z.number().int(),
  offersAccepted: z.number().int(),
  offersExpired: z.number().int(),
  acceptanceRate: z.number().int().nullable(),
  codOutstandingPaise: z.number().int(),
})
export type RiderAnalyticsZone = z.infer<typeof RiderAnalyticsZone>

export const RiderAnalytics = z.object({
  days: z.number().int(),
  totals: z.object({
    deliveries: z.number().int(),
    offersSent: z.number().int(),
    offersAccepted: z.number().int(),
    codOutstandingPaise: z.number().int(),
  }),
  zones: z.array(RiderAnalyticsZone),
  daily: z.array(z.object({ date: z.string(), deliveries: z.number().int() })),
})
export type RiderAnalytics = z.infer<typeof RiderAnalytics>

// App sign-in ------------------------------------------------------------------------------------
export const RiderLoginRequest = z.object({
  phone: IndianPhone,
  password: z.string().min(1).max(100),
})
export type RiderLoginRequest = z.infer<typeof RiderLoginRequest>

export const RiderAppPasswordIssued = z.object({ password: z.string() })
export type RiderAppPasswordIssued = z.infer<typeof RiderAppPasswordIssued>
