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
})
export type VendorDetail = z.infer<typeof VendorDetail>

export const VendorListQuery = z.object({
  business: Business.optional(),
  status: VendorStatus.optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const VendorSummary = z.object({
  business: Business,
  total: z.number().int(),
  active: z.number().int(),
  pending: z.number().int(),
  suspended: z.number().int(),
})

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
})
export type CreateVendorRequest = z.infer<typeof CreateVendorRequest>

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
