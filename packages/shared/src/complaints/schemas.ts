// Complaints, stored notifications, Mart inventory and member preferences.
import { z } from "zod"
import { Business } from "../common/enums"
import { Paise } from "../common/money"

// ---------- complaints ----------

export const COMPLAINT_STATUSES = ["open", "in_review", "escalated", "resolved"] as const
export const ComplaintStatus = z.enum(COMPLAINT_STATUSES)
export type ComplaintStatus = z.infer<typeof ComplaintStatus>
export const complaintStatusLabel: Record<ComplaintStatus, string> = {
  open: "Open",
  in_review: "In review",
  escalated: "Escalated",
  resolved: "Resolved",
}

export const COMPLAINT_PRIORITIES = ["low", "medium", "high", "urgent"] as const
export const ComplaintPriority = z.enum(COMPLAINT_PRIORITIES)
export type ComplaintPriority = z.infer<typeof ComplaintPriority>

export const COMPLAINT_CATEGORIES = [
  "late_delivery",
  "missing_item",
  "wrong_item",
  "damaged",
  "quality",
  "not_delivered",
  "payment",
  "partner_behaviour",
] as const
export const ComplaintCategory = z.enum(COMPLAINT_CATEGORIES)
export type ComplaintCategory = z.infer<typeof ComplaintCategory>
export const complaintCategoryLabel: Record<ComplaintCategory, string> = {
  late_delivery: "Late delivery",
  missing_item: "Missing item",
  wrong_item: "Wrong item",
  damaged: "Damaged parcel",
  quality: "Food quality",
  not_delivered: "Not delivered",
  payment: "Payment issue",
  partner_behaviour: "Partner behaviour",
}

export const Complaint = z.object({
  id: z.string(),
  code: z.string(),
  business: Business,
  zoneId: z.string(),
  orderId: z.string().nullable(),
  orderCode: z.string().nullable(),
  vendorName: z.string().nullable(),
  category: ComplaintCategory,
  priority: ComplaintPriority,
  status: ComplaintStatus,
  customerName: z.string(),
  summary: z.string(),
  details: z.string(),
  evidence: z.array(z.string()),
  claimPaise: Paise.nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  escalatedAt: z.iso.datetime().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  resolution: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Complaint = z.infer<typeof Complaint>

export const ComplaintNote = z.object({
  id: z.string(),
  kind: z.enum(["created", "note", "assigned", "escalated", "resolved", "reopened"]),
  authorName: z.string(),
  body: z.string(),
  at: z.iso.datetime(),
})
export type ComplaintNote = z.infer<typeof ComplaintNote>

export const ComplaintDetail = Complaint.extend({ notes: z.array(ComplaintNote) })
export type ComplaintDetail = z.infer<typeof ComplaintDetail>

export const ComplaintListQuery = z.object({
  business: Business.optional(),
  status: ComplaintStatus.optional(),
  priority: ComplaintPriority.optional(),
  /** "me" for complaints assigned to the signed-in member, "none" for unassigned. */
  assignee: z.enum(["me", "none"]).optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
})
export type ComplaintListQuery = z.infer<typeof ComplaintListQuery>

export const ComplaintSummary = z.object({
  open: z.number().int(),
  inReview: z.number().int(),
  escalated: z.number().int(),
  resolvedToday: z.number().int(),
  urgent: z.number().int(),
  unassigned: z.number().int(),
})
export type ComplaintSummary = z.infer<typeof ComplaintSummary>

const version = z.number().int()
export const AssignComplaintRequest = z.object({
  version,
  /** null unassigns. */
  assigneeId: z.string().nullable(),
})
export const EscalateComplaintRequest = z.object({
  version,
  reason: z.string().trim().min(5).max(500),
})
export const ResolveComplaintRequest = z.object({
  version,
  resolution: z.string().trim().min(5).max(500),
})
export const ReopenComplaintRequest = z.object({
  version,
  reason: z.string().trim().min(3).max(500),
})
export const ComplaintNoteRequest = z.object({ body: z.string().trim().min(1).max(1000) })

export const Assignee = z.object({ id: z.string(), name: z.string(), initials: z.string() })
export type Assignee = z.infer<typeof Assignee>

// ---------- stored notifications ----------

export const StoredNotification = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type StoredNotification = z.infer<typeof StoredNotification>
export const NotificationList = z.object({
  items: z.array(StoredNotification),
  unread: z.number().int(),
})
export type NotificationList = z.infer<typeof NotificationList>
export const NotificationQuery = z.object({
  unread: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export const NotificationActivityKey = z
  .string()
  .regex(/^(vendor|partner|order):[A-Za-z0-9_-]{1,128}$/)
export const NotificationActivityReadQuery = z.object({
  keys: z.string().max(8000).optional(),
})
export const NotificationActivityReadRequest = z.object({
  key: NotificationActivityKey,
})
export const NotificationActivityReadList = z.object({
  keys: z.array(NotificationActivityKey),
})

// ---------- inventory (GLOARO MART) ----------

export const PRODUCT_STATUSES = ["active", "paused"] as const
export const ProductStatus = z.enum(PRODUCT_STATUSES)
export type ProductStatus = z.infer<typeof ProductStatus>

export const Product = z.object({
  id: z.string(),
  sku: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  zoneId: z.string(),
  name: z.string(),
  category: z.string(),
  pricePaise: Paise,
  stock: z.number().int(),
  lowStockThreshold: z.number().int(),
  status: ProductStatus,
  version: z.number().int(),
  updatedAt: z.iso.datetime(),
})
export type Product = z.infer<typeof Product>

export const ProductListQuery = z.object({
  stock: z.enum(["low", "out", "in"]).optional(),
  status: ProductStatus.optional(),
  vendorId: z.string().optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
})
export type ProductListQuery = z.infer<typeof ProductListQuery>

export const InventorySummary = z.object({
  products: z.number().int(),
  active: z.number().int(),
  lowStock: z.number().int(),
  outOfStock: z.number().int(),
  /** Stock on hand × price. */
  stockValuePaise: Paise,
})
export type InventorySummary = z.infer<typeof InventorySummary>

export const STOCK_REASONS = ["restock", "sold_offline", "damaged", "count_correction"] as const
export const StockAdjustRequest = z.object({
  version: z.number().int(),
  /** Positive adds units, negative removes them. */
  change: z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((n) => n !== 0, "Enter a change"),
  reason: z.enum(STOCK_REASONS),
})
export const ProductStatusRequest = z.object({ version: z.number().int(), status: ProductStatus })

// ---------- member preferences and sessions ----------

export const MemberPreferences = z.object({
  /** Email me when a complaint in my zones is escalated or assigned to me. */
  emailComplaints: z.boolean().default(true),
  /** Notify me when orders pass their time limit. */
  slaAlerts: z.boolean().default(true),
  /** A daily summary email at 8 am. */
  dailyDigest: z.boolean().default(false),
  /** Play a sound for new notifications in the portal. */
  sound: z.boolean().default(false),
})
export type MemberPreferences = z.infer<typeof MemberPreferences>

export const SessionInfo = z.object({
  id: z.string(),
  current: z.boolean(),
  createdAt: z.iso.datetime(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
})
export type SessionInfo = z.infer<typeof SessionInfo>
