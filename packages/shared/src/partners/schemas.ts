import { z } from "zod"
import { Business } from "../common/enums"
import { IndianPhone } from "../common/phone"
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
})
export type PartnerDetail = z.infer<typeof PartnerDetail>

export const PartnerListQuery = z.object({
  business: Business.optional(),
  status: PartnerStatus.optional(),
  availability: PartnerAvailability.optional(),
  search: z.string().trim().optional(),
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
