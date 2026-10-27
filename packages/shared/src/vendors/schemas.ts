import { z } from "zod"
import { Business } from "../common/enums"
import { Paise } from "../common/money"
import { IndianPhone } from "../common/phone"

export const VENDOR_STATUSES = ["pending_review", "active", "rejected", "suspended"] as const
export const VendorStatus = z.enum(VENDOR_STATUSES)
export type VendorStatus = z.infer<typeof VendorStatus>

export const vendorStatusLabel: Record<VendorStatus, string> = {
  pending_review: "Pending",
  active: "Active",
  rejected: "Rejected",
  suspended: "Suspended",
}

export const VERIFICATION_STATUSES = ["under_review", "verified", "rejected"] as const
export const VerificationStatus = z.enum(VERIFICATION_STATUSES)
export type VerificationStatus = z.infer<typeof VerificationStatus>

export const verificationLabel: Record<VerificationStatus, string> = {
  under_review: "Under Review",
  verified: "Verified",
  rejected: "Rejected",
}

/** One uploaded file. Contents stay in object storage; only the listing is shown. */
export const StoredDocument = z.object({
  kind: z.string(),
  fileName: z.string(),
  uploadedAt: z.iso.datetime(),
  verified: z.boolean(),
})

/** An audit log line about one record, newest first. */
export const ActivityEntry = z.object({
  action: z.string(),
  actorName: z.string(),
  at: z.iso.datetime(),
  reason: z.string().nullable(),
})
export type ActivityEntry = z.infer<typeof ActivityEntry>

export const Vendor = z.object({
  id: z.string(),
  code: z.string(), // VEN-1048
  business: Business,
  name: z.string(),
  ownerName: z.string(),
  phone: z.string(),
  email: z.string(),
  address: z.string(),
  zoneId: z.string(),
  /** "T. Nagar, Chennai" */
  zoneName: z.string(),
  status: VendorStatus,
  verification: VerificationStatus,
  commissionPct: z.number(),
  /** Value of delivered orders. */
  salesPaise: Paise,
  ordersCount: z.number().int(),
  /** Orders not yet delivered, cancelled or refunded. */
  openOrders: z.number().int(),
  createdAt: z.iso.datetime(),
})
export type Vendor = z.infer<typeof Vendor>

export const VendorDetail = Vendor.extend({
  gstin: z.string().nullable(),
  fssai: z.string().nullable(),
  decisionReason: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  documents: z.array(StoredDocument),
  activity: z.array(ActivityEntry),
  category: z.string().nullable(),
  launchPreference: z.enum(["on_approval", "paused"]).nullable(),
  ownerPhone: z.string().nullable(),
  /** PAN with the middle masked, e.g. "ABCDE••••F". */
  panMasked: z.string().nullable(),
  pinCode: z.string().nullable(),
  settlementCycle: z.enum(["weekly", "biweekly", "monthly"]).nullable(),
  bank: z
    .object({
      holderName: z.string(),
      bankName: z.string().nullable(),
      last4: z.string(),
      ifsc: z.string(),
      upiId: z.string().nullable(),
      verified: z.boolean(),
    })
    .nullable(),
  /** Sent back on edits; a mismatch means someone else changed the vendor (409). */
  updatedAt: z.iso.datetime(),
})
export type VendorDetail = z.infer<typeof VendorDetail>

export const VENDOR_SORTS = ["newest", "orders"] as const

export const VendorListQuery = z.object({
  business: Business.optional(),
  status: VendorStatus.optional(),
  search: z.string().trim().optional(),
  /** "orders": most orders first. */
  sort: z.enum(VENDOR_SORTS).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const VendorSummary = z.object({
  business: Business,
  total: z.number().int(),
  active: z.number().int(),
  pending: z.number().int(),
  suspended: z.number().int(),
  rejected: z.number().int(),
})

export const LAUNCH_PREFERENCES = ["on_approval", "paused"] as const
export const launchPreferenceLabel: Record<(typeof LAUNCH_PREFERENCES)[number], string> = {
  on_approval: "Go live as soon as approved",
  paused: "Stay paused after approval",
}
export const SETTLEMENT_CYCLES = ["weekly", "biweekly", "monthly"] as const
export const settlementCycleLabel: Record<(typeof SETTLEMENT_CYCLES)[number], string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
}

export const CreateVendorRequest = z.object({
  business: Business,
  name: z.string().trim().min(2, "Enter the business name"),
  ownerName: z.string().trim().min(2, "Enter the owner's name"),
  phone: IndianPhone,
  email: z.email("Enter a valid email address"),
  address: z.string().trim().min(5, "Enter the full address"),
  zoneId: z.string().min(1, "Choose a service area"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, "Enter a valid 15-character GSTIN")
    .optional(),
  fssai: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "FSSAI licence numbers have 14 digits")
    .optional(),
  commissionPct: z.number().min(0).max(50),
  category: z.string().trim().min(2, "Enter a category").max(60).optional(),
  launchPreference: z.enum(LAUNCH_PREFERENCES).optional(),
  ownerPhone: IndianPhone.optional(),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid 10-character PAN")
    .optional(),
  pinCode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "PIN codes have 6 digits")
    .optional(),
  settlementCycle: z.enum(SETTLEMENT_CYCLES).optional(),
  /** Settlement account. Only the last four digits are kept. */
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
      upiId: z
        .string()
        .trim()
        .regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, "Enter a UPI ID like name@bank")
        .optional(),
    })
    .optional(),
})
export type CreateVendorRequest = z.infer<typeof CreateVendorRequest>

/** Super Admin edits from the vendor drawer. Send only what changed, plus updatedAt. */
export const UpdateVendorRequest = CreateVendorRequest.omit({
  business: true,
  bank: true,
  pan: true,
})
  .partial()
  .extend({ updatedAt: z.iso.datetime() })
export type UpdateVendorRequest = z.infer<typeof UpdateVendorRequest>

export const VENDOR_DECISIONS = ["approve", "reject", "suspend", "reactivate"] as const
export const VendorDecisionRequest = z.object({
  decision: z.enum(VENDOR_DECISIONS),
  reason: z.string().trim().max(500).optional(),
})
export type VendorDecision = (typeof VENDOR_DECISIONS)[number]

/** Which decisions apply to a vendor in each status. */
export const vendorDecisions: Record<VendorStatus, VendorDecision[]> = {
  pending_review: ["approve", "reject"],
  active: ["suspend"],
  suspended: ["reactivate"],
  rejected: [],
}
