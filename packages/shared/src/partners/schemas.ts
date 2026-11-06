import { z } from "zod"
import { Business } from "../common/enums"
import { Paise } from "../common/money"
import { IndianPhone } from "../common/phone"
import { PartnerPlan } from "../finance/schemas"
import { ActivityEntry, StoredDocument } from "../vendors/schemas"

export const PARTNER_STATUSES = ["pending_approval", "active", "rejected", "suspended"] as const
export const PartnerStatus = z.enum(PARTNER_STATUSES)
export type PartnerStatus = z.infer<typeof PartnerStatus>

export const partnerStatusLabel: Record<PartnerStatus, string> = {
  pending_approval: "Pending",
  active: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
}

export const AVAILABILITY = ["available", "on_delivery", "offline"] as const
export const PartnerAvailability = z.enum(AVAILABILITY)
export type PartnerAvailability = z.infer<typeof PartnerAvailability>

export const availabilityLabel: Record<PartnerAvailability, string> = {
  available: "Online",
  on_delivery: "On delivery",
  offline: "Offline",
}

export const VEHICLE_TYPES = ["motorcycle", "scooter", "e_bike", "bicycle"] as const
export const VehicleType = z.enum(VEHICLE_TYPES)
export type VehicleType = z.infer<typeof VehicleType>

export const vehicleLabel: Record<VehicleType, string> = {
  motorcycle: "Motorcycle",
  scooter: "Scooter",
  e_bike: "E-bike",
  bicycle: "Bicycle",
}

export const Partner = z.object({
  id: z.string(),
  code: z.string(), // DP-2381
  deliveryBoyCount: z.number().int(),
  name: z.string(),
  phone: z.string(),
  businesses: z.array(Business),
  zoneId: z.string(),
  /** "T. Nagar, Chennai" */
  zoneName: z.string(),
  vehicleType: VehicleType,
  vehicleNumber: z.string(),
  status: PartnerStatus,
  availability: PartnerAvailability,
  kycVerified: z.boolean(),
  bankVerified: z.boolean(),
  rating: z.number().nullable(),
  deliveriesCompleted: z.number().int(),
  /** The open order the partner is carrying, if any. */
  currentOrderCode: z.string().nullable(),
  managedByAdminId: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type Partner = z.infer<typeof Partner>

export const PartnerDetail = Partner.extend({
  email: z.string().nullable(),
  dateOfBirth: z.iso.date().nullable(),
  gender: z.string().nullable(),
  address: z.string().nullable(),
  pinCode: z.string().nullable(),
  district: z.string(),
  vehicleModel: z.string().nullable(),
  drivingLicence: z.string(),
  licenceValidUntil: z.iso.date().nullable(),
  bank: z
    .object({
      holderName: z.string(),
      bankName: z.string().nullable(),
      last4: z.string(),
      ifsc: z.string(),
      verified: z.boolean(),
    })
    .nullable(),
  managerName: z.string().nullable(),
  submittedByName: z.string().nullable(),
  decisionReason: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  documents: z.array(StoredDocument),
  activity: z.array(ActivityEntry),
  /** Delivered orders carried by the partner and their total value. */
  deliveredOrders: z.number().int(),
  orderValuePaise: Paise,
  /** The pay plan in force today, if one is set. */
  payPlan: PartnerPlan.nullable(),
  payPlanFrom: z.iso.datetime().nullable(),
  /** Sent back on edits; a mismatch means someone else changed the partner (409). */
  updatedAt: z.iso.datetime(),
})
export type PartnerDetail = z.infer<typeof PartnerDetail>

export const DeliveryFleetStatus = z.enum(["pending_approval", "active", "suspended", "rejected"])
export type DeliveryFleetStatus = z.infer<typeof DeliveryFleetStatus>

/** A delivery partner takes between 10 and 20 delivery boys; the upper limit is enforced. */
export const DELIVERY_BOYS_PER_PARTNER = { min: 10, max: 20 } as const

export const DeliveryFleet = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  companyName: z.string().nullable(),
  contactPerson: z.string(),
  phone: IndianPhone,
  email: z.email().nullable(),
  address: z.string(),
  districtId: z.string(),
  district: z.string(),
  businesses: z.array(Business).min(1),
  status: DeliveryFleetStatus,
  requestedByName: z.string().nullable(),
  zones: z.array(z.object({ id: z.string(), name: z.string() })),
  deliveryBoyCount: z.number().int(),
  availableBoyCount: z.number().int(),
  createdAt: z.iso.datetime(),
})
export type DeliveryFleet = z.infer<typeof DeliveryFleet>

export const UpdateDeliveryFleetRequest = z.object({
  name: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(120).nullable(),
  contactPerson: z.string().trim().min(2).max(120),
  phone: IndianPhone,
  email: z.email().nullable(),
  address: z.string().trim().min(5).max(500),
  status: z.enum(["active", "suspended"]),
  businesses: z
    .array(Business)
    .min(1)
    .refine((items) => new Set(items).size === items.length),
  reason: z.string().trim().min(3, "Explain why this changed.").max(500),
})
export type UpdateDeliveryFleetRequest = z.infer<typeof UpdateDeliveryFleetRequest>

/** Super Admin decision on a partner an Admin asked to create. */
export const DeliveryFleetReviewRequest = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(3, "Explain the decision.").max(500),
})
export type DeliveryFleetReviewRequest = z.infer<typeof DeliveryFleetReviewRequest>

export const RotateCredentialRequest = z.object({
  reason: z.string().trim().min(3, "Explain why the credential is being rotated.").max(500),
})
export type RotateCredentialRequest = z.infer<typeof RotateCredentialRequest>

export const DeliveryHistoryEntry = z.object({
  id: z.string(),
  action: z.string(),
  actorName: z.string(),
  actorRole: z.string(),
  reason: z.string().nullable(),
  changes: z
    .record(z.string(), z.object({ from: z.unknown().nullable(), to: z.unknown().nullable() }))
    .nullable(),
  at: z.iso.datetime(),
})
export type DeliveryHistoryEntry = z.infer<typeof DeliveryHistoryEntry>

export const DeliveryFleetListQuery = z.object({
  status: DeliveryFleetStatus.optional(),
  business: Business.optional(),
  districtId: z.string().optional(),
  zoneId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const AssignFleetZoneRequest = z.object({
  replaceCurrent: z.boolean().default(false),
  reason: z.string().trim().min(3, "Explain why this zone is being assigned.").max(500),
})

export const DeliveryBoyStatus = z.enum([
  "pending_admin",
  "pending_super",
  "corrections_requested",
  "rejected",
  "active",
  "suspended",
])
export type DeliveryBoyStatus = z.infer<typeof DeliveryBoyStatus>
export const DeliveryBoyAvailability = z.enum(["available", "on_delivery", "offline", "suspended"])
export type DeliveryBoyAvailability = z.infer<typeof DeliveryBoyAvailability>
export const DeliveryBoyDocumentKind = z.enum([
  "photo_id",
  "driving_licence",
  "vehicle_registration",
  "profile_photo",
  "insurance",
])
export type DeliveryBoyDocumentKind = z.infer<typeof DeliveryBoyDocumentKind>
export const DeliveryBoyReviewDecision = z.enum([
  "submitted",
  "corrections_resubmitted",
  "forwarded",
  "corrections_requested",
  "rejected",
  "approved",
  "suspended",
  "reactivated",
])
export const DeliveryBoyReviewEntry = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  fleetId: z.string().nullable(),
  actorName: z.string(),
  actorRole: z.string(),
  decision: DeliveryBoyReviewDecision,
  from: DeliveryBoyStatus,
  to: DeliveryBoyStatus,
  reason: z.string().nullable(),
  at: z.iso.datetime(),
})

export const DeliveryBoyDocument = z.object({
  id: z.string(),
  kind: DeliveryBoyDocumentKind,
  fileName: z.string(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  uploadedAt: z.iso.datetime(),
  verified: z.boolean(),
})

export const DeliveryBoy = z.object({
  id: z.string(),
  code: z.string(),
  fleetId: z.string(),
  fleetName: z.string(),
  zoneId: z.string(),
  zoneName: z.string(),
  districtId: z.string(),
  district: z.string(),
  name: z.string(),
  phone: IndianPhone,
  email: z.email().nullable(),
  address: z.string(),
  dateOfBirth: z.iso.date().nullable(),
  gender: z.string().nullable(),
  pinCode: z.string().nullable(),
  drivingLicence: z.string().nullable(),
  licenceValidUntil: z.iso.date().nullable(),
  registrationValidUntil: z.iso.date().nullable(),
  vehicleType: VehicleType,
  vehicleNumber: z.string(),
  vehicleModel: z.string().nullable(),
  payout: z
    .object({
      holderName: z.string(),
      bankName: z.string().nullable(),
      last4: z.string(),
      ifsc: z.string(),
    })
    .nullable(),
  status: DeliveryBoyStatus,
  availability: DeliveryBoyAvailability,
  maxActiveOrders: z.number().int().positive(),
  version: z.number().int(),
  reviewAdminId: z.string().nullable(),
  reviewAdminName: z.string().nullable(),
  documents: z.array(DeliveryBoyDocument),
  reviews: z.array(DeliveryBoyReviewEntry),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type DeliveryBoy = z.infer<typeof DeliveryBoy>

export const DeliveryBoyApplicationRequest = z.object({
  name: z.string().trim().min(2).max(120),
  phone: IndianPhone,
  email: z.email().optional(),
  dateOfBirth: z.iso.date().optional(),
  gender: z.enum(["Female", "Male", "Non-binary", "Prefer not to say"]).optional(),
  address: z.string().trim().min(5).max(500),
  pinCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
  zoneId: z.string().min(1),
  drivingLicence: z.string().trim().max(80).optional(),
  licenceValidUntil: z.iso.date().optional(),
  registrationValidUntil: z.iso.date().optional(),
  vehicleType: VehicleType,
  vehicleNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4}$/),
  vehicleModel: z.string().trim().max(120).optional(),
  payout: z
    .object({
      holderName: z.string().trim().min(2).max(120),
      bankName: z.string().trim().max(120).optional(),
      accountNumber: z.string().regex(/^\d{9,18}$/),
      ifsc: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
    })
    .optional(),
})
export type DeliveryBoyApplicationRequest = z.infer<typeof DeliveryBoyApplicationRequest>

export const DeliveryBoyOtpRequest = z.object({ phone: IndianPhone })
export const DeliveryBoyOtpChallenge = z.object({
  challengeId: z.string(),
  destination: z.string(),
  expiresInSeconds: z.number().int(),
  resendInSeconds: z.number().int(),
})
export type DeliveryBoyOtpChallenge = z.infer<typeof DeliveryBoyOtpChallenge>
export const DeliveryBoySubmissionRequest = DeliveryBoyApplicationRequest.extend({
  otpChallengeId: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/),
})
export type DeliveryBoySubmissionRequest = z.infer<typeof DeliveryBoySubmissionRequest>
export const DeliveryBoyCorrectionRequest = DeliveryBoyApplicationRequest.extend({
  reason: z.string().trim().min(3).max(500),
})
export type DeliveryBoyCorrectionRequest = z.infer<typeof DeliveryBoyCorrectionRequest>

export const DeliveryBoyOnboardingRequest = DeliveryBoyApplicationRequest.extend({
  drivingLicence: z.string().trim().min(1).max(80),
})
export type DeliveryBoyOnboardingRequest = z.infer<typeof DeliveryBoyOnboardingRequest>

export const FleetDeliveryBoyOnboardingRequest = DeliveryBoyOnboardingRequest.extend({
  payout: z.object({
    holderName: z.string().trim().min(2).max(120),
    bankName: z.string().trim().max(120).optional(),
    accountNumber: z.string().regex(/^\d{9,18}$/),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  }),
})
export type FleetDeliveryBoyOnboardingRequest = z.infer<typeof FleetDeliveryBoyOnboardingRequest>

export const CreateDeliveryFleetRequest = z.object({
  name: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(120).optional(),
  contactPerson: z.string().trim().min(2).max(120),
  phone: IndianPhone,
  email: z.email().optional(),
  address: z.string().trim().min(5).max(500),
  districtId: z.string().min(1),
  businesses: z
    .array(Business)
    .min(1, "Choose at least one business")
    .refine((items) => new Set(items).size === items.length)
    .default(["food", "mart"]),
  zoneIds: z
    .array(z.string().min(1))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length),
  deliveryBoys: z
    .array(FleetDeliveryBoyOnboardingRequest)
    .max(
      DELIVERY_BOYS_PER_PARTNER.max,
      `A delivery partner can have at most ${DELIVERY_BOYS_PER_PARTNER.max} delivery boys.`,
    )
    .default([]),
})
export type CreateDeliveryFleetRequest = z.infer<typeof CreateDeliveryFleetRequest>

/** Admin request: creates the partner as pending until Super Admin approves it. */
export const RequestDeliveryFleetRequest = CreateDeliveryFleetRequest.omit({ deliveryBoys: true })
export type RequestDeliveryFleetRequest = z.infer<typeof RequestDeliveryFleetRequest>

export const DeliveryBoyListQuery = z.object({
  status: DeliveryBoyStatus.optional(),
  /** Riders of delivery companies that serve this business. */
  business: Business.optional(),
  districtId: z.string().optional(),
  zoneId: z.string().optional(),
  fleetId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const DeliveryBoyReviewRequest = z.object({
  decision: z.enum(["forwarded", "corrections_requested", "rejected", "approved"]),
  reason: z.string().trim().min(3, "Explain this decision.").max(500),
  version: z.number().int().nonnegative(),
})
export type DeliveryBoyReviewRequest = z.infer<typeof DeliveryBoyReviewRequest>

export const DeliveryBoyAssignmentRequest = z.object({
  boyId: z.string().min(1),
  version: z.number().int().nonnegative(),
})
export type DeliveryBoyAssignmentRequest = z.infer<typeof DeliveryBoyAssignmentRequest>

export const DeliveryBoyOrderStatusRequest = z.object({
  to: z.enum(["picked_up", "out_for_delivery", "delivered"]),
  version: z.number().int().nonnegative(),
})
export type DeliveryBoyOrderStatusRequest = z.infer<typeof DeliveryBoyOrderStatusRequest>

export const DeliveryFleetOrder = z.object({
  id: z.string(),
  code: z.string(),
  business: Business,
  // picked_up and out_for_delivery: an order taken over from a rider who could not continue.
  status: z.enum(["ready", "assigned", "picked_up", "out_for_delivery"]),
  zoneId: z.string(),
  zoneName: z.string(),
  vendorName: z.string(),
  placedAt: z.iso.datetime(),
  totalPaise: Paise,
})
export type DeliveryFleetOrder = z.infer<typeof DeliveryFleetOrder>

export const DeliveryBoyDocumentVerifyRequest = z.object({
  verified: z.boolean(),
  reason: z.string().trim().min(3, "Explain this document decision.").max(500),
})

export const PARTNER_SORTS = ["newest", "performance"] as const

export const PartnerListQuery = z.object({
  business: Business.optional(),
  status: PartnerStatus.optional(),
  availability: PartnerAvailability.optional(),
  search: z.string().trim().optional(),
  /** "performance": most deliveries, then highest rating. */
  sort: z.enum(PARTNER_SORTS).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const PartnerSummary = z.object({
  total: z.number().int(),
  active: z.number().int(),
  pending: z.number().int(),
  suspended: z.number().int(),
  /** Availability counts cover approved partners only. */
  available: z.number().int(),
  onDelivery: z.number().int(),
  offline: z.number().int(),
})
export type PartnerSummary = z.infer<typeof PartnerSummary>

export const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"] as const

export const CreatePartnerRequest = z.object({
  name: z.string().trim().min(2, "Full name is required"),
  phone: IndianPhone,
  email: z.email("Enter a valid email address").optional(),
  dateOfBirth: z.iso.date("Enter a valid date").optional(),
  gender: z.enum(GENDERS).optional(),
  address: z.string().trim().min(5, "Enter the full address").optional(),
  pinCode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "PIN codes have 6 digits")
    .optional(),
  businesses: z.array(Business).min(1, "Choose at least one business"),
  deliveryBoyCount: z.number().int().min(0).max(20).optional(),
  zoneId: z.string().min(1, "Choose a service area"),
  vehicleType: VehicleType,
  vehicleNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4}$/, "Enter a registration like TN 01 AB 4821"),
  vehicleModel: z.string().trim().min(2).optional(),
  drivingLicence: z.string().trim().min(8, "Enter the full licence number"),
  licenceValidUntil: z.iso.date("Enter a valid date").optional(),
  bank: z
    .object({
      holderName: z.string().trim().min(2, "Enter the account holder's name"),
      bankName: z.string().trim().min(2, "Enter the bank name"),
      accountNumber: z.string().regex(/^\d{9,18}$/, "Account numbers have 9 to 18 digits"),
      ifsc: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{4}0[A-Z\d]{6}$/, "Enter an IFSC like HDFC0001284"),
    })
    .optional(),
})
export type CreatePartnerRequest = z.infer<typeof CreatePartnerRequest>

const PartnerDraftForm = z
  .object({
    name: z.string().max(200),
    phone: z.string().max(32),
    email: z.string().max(254),
    dateOfBirth: z.string().max(20),
    gender: z.string().max(64),
    address: z.string().max(1000),
    pinCode: z.string().max(32),
    deliveryBoyCount: z.string().max(3).default(""),
    service: z.enum(["food", "mart", "both"]),
    zoneId: z.string().max(128),
    drivingLicence: z.string().max(128),
    licenceValidUntil: z.string().max(20),
    vehicleType: VehicleType,
    vehicleNumber: z.string().max(32),
    vehicleModel: z.string().max(128),
    holderName: z.string().max(200),
    bankName: z.string().max(200),
    accountNumber: z.string().max(18),
    confirmAccount: z.string().max(18),
    ifsc: z.string().max(11),
  })
  .strict()

export const PartnerDraftRequest = z.object({
  step: z.number().int().min(0).max(4),
  form: PartnerDraftForm,
})
export type PartnerDraftRequest = z.infer<typeof PartnerDraftRequest>

export const PartnerDraft = PartnerDraftRequest.extend({
  updatedAt: z.iso.datetime(),
})
export type PartnerDraft = z.infer<typeof PartnerDraft>

/** Super Admin edits from the profile drawer. Everything is optional; send what changed. */
export const UpdatePartnerRequest = CreatePartnerRequest.omit({ bank: true })
  .partial()
  .extend({
    updatedAt: z.iso.datetime(),
    reason: z.string().trim().min(3, "Explain why this profile is being edited").max(500),
  })
export type UpdatePartnerRequest = z.infer<typeof UpdatePartnerRequest>

export const PARTNER_DECISIONS = ["approve", "reject", "suspend", "reactivate"] as const
export const PartnerDecisionRequest = z.object({
  decision: z.enum(PARTNER_DECISIONS),
  reason: z.string().trim().max(500).optional(),
})
export type PartnerDecision = (typeof PARTNER_DECISIONS)[number]

export const partnerDecisions: Record<PartnerStatus, PartnerDecision[]> = {
  pending_approval: ["approve", "reject"],
  active: ["suspend"],
  suspended: ["reactivate"],
  rejected: [],
}

export const PARTNER_REJECTION_REASONS = [
  "Identity document issue",
  "Driving license issue",
  "Vehicle documents incomplete",
  "Bank information mismatch",
  "Eligibility requirements not met",
] as const
