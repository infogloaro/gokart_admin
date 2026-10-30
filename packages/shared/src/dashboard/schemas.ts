// Command Center, Business overview, revenue screens and global search.
import { z } from "zod"
import { Business } from "../common/enums"
import { Paise } from "../common/money"
import { OrderStatus } from "../orders/status"

/** Reporting periods, counted in India Standard Time days ending today. */
export const DASHBOARD_RANGES = ["today", "7d", "30d", "90d"] as const
export const DashboardRange = z.enum(DASHBOARD_RANGES)
export type DashboardRange = z.infer<typeof DashboardRange>
export const rangeName: Record<DashboardRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
}
export const rangeDays: Record<DashboardRange, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 }

export const DashboardQuery = z.object({
  business: Business.optional(),
  range: DashboardRange.default("7d"),
})
export type DashboardQuery = z.infer<typeof DashboardQuery>

/** A figure for the period, and the same figure for the period before it when that means anything. */
export const Metric = z.object({ value: z.number().int(), previous: z.number().int().nullable() })
export type Metric = z.infer<typeof Metric>

export const ATTENTION_KINDS = [
  "vendor_approvals",
  "partner_approvals",
  "refund_requests",
  "partner_documents",
  "delayed_orders",
] as const
export const AttentionKind = z.enum(ATTENTION_KINDS)
export type AttentionKind = z.infer<typeof AttentionKind>

export const AttentionItem = z.object({
  kind: AttentionKind,
  count: z.number().int(),
  /** Money at stake, e.g. the value of refund requests. */
  amountPaise: Paise.nullable(),
  /** When the oldest item in the queue arrived. */
  oldestAt: z.iso.datetime().nullable(),
})
export type AttentionItem = z.infer<typeof AttentionItem>

export const RecentOrder = z.object({
  id: z.string(),
  code: z.string(),
  business: Business,
  status: OrderStatus,
  customerName: z.string(),
  vendorName: z.string(),
  totalPaise: Paise,
  placedAt: z.iso.datetime(),
})
export type RecentOrder = z.infer<typeof RecentOrder>

export const DashboardOverview = z.object({
  range: DashboardRange,
  from: z.iso.datetime(),
  generatedAt: z.iso.datetime(),
  metrics: z.object({
    orders: Metric,
    grossPaise: Metric,
    platformRevenuePaise: Metric,
    activeVendors: Metric,
    partnersOnline: Metric,
    openOrders: Metric,
    openComplaints: Metric,
    pendingApprovals: Metric,
  }),
  /** Gross order value per IST day, per business. */
  trend: z.array(z.object({ date: z.iso.date(), food: Paise, mart: Paise })),
  distribution: z.object({
    delivered: z.number().int(),
    inProgress: z.number().int(),
    cancelled: z.number().int(),
    refunded: z.number().int(),
  }),
  recent: z.array(RecentOrder),
  attention: z.array(AttentionItem),
  /** Right now, regardless of the period. */
  floor: z.object({
    /** Accepted or being prepared. */
    preparing: z.number().int(),
    /** Packed or ready, waiting for pickup. */
    ready: z.number().int(),
    /** Packed or ready with no delivery partner yet. */
    unassigned: z.number().int(),
    /** Past 75% of the time limit but not over it yet. */
    nearingLimit: z.number().int(),
    delayed: z.number().int(),
    partnersAvailable: z.number().int(),
  }),
  byStatus: z.array(z.object({ status: OrderStatus, count: z.number().int() })),
  /** Per IST hour (`"09"`) for Today, per IST day (`"2026-10-29"`) otherwise. */
  activity: z.array(
    z.object({ bucket: z.string(), orders: z.number().int(), completed: z.number().int() }),
  ),
})
export type DashboardOverview = z.infer<typeof DashboardOverview>

export const BusinessHealth = z.object({
  business: Business,
  /** Percentages to one decimal place; null when there is nothing to measure yet. */
  acceptanceRate: z.number().nullable(),
  onTimeRate: z.number().nullable(),
  completionRate: z.number().nullable(),
  /** Average delivery partner rating × 10. */
  ratingTenths: z.number().int().nullable(),
  orders: z.number().int(),
  openOrders: z.number().int(),
  delayedNow: z.number().int(),
  activeVendors: z.number().int(),
  partnersOnline: z.number().int(),
})
export type BusinessHealth = z.infer<typeof BusinessHealth>

export const DashboardHealth = z.object({
  range: DashboardRange,
  generatedAt: z.iso.datetime(),
  businesses: z.array(BusinessHealth),
})
export type DashboardHealth = z.infer<typeof DashboardHealth>

export const RevenueQuery = z.object({ business: Business, range: DashboardRange.default("7d") })
export type RevenueQuery = z.infer<typeof RevenueQuery>

export const RevenueTotals = z.object({
  orders: z.number().int(),
  /** What customers paid on orders that weren't cancelled or refunded. */
  grossPaise: Paise,
  commissionPaise: Paise,
  deliveryFeesPaise: Paise,
  /** Commission plus delivery fees. */
  platformPaise: Paise,
  /** Item value less commission: what the platform owes vendors. */
  vendorSharePaise: Paise,
  refundsPaise: Paise,
  refundCount: z.number().int(),
})
export type RevenueTotals = z.infer<typeof RevenueTotals>

export const VendorRevenue = z.object({
  vendorId: z.string(),
  code: z.string(),
  name: z.string(),
  commissionBps: z.number().int(),
  orders: z.number().int(),
  grossPaise: Paise,
  commissionPaise: Paise,
  vendorSharePaise: Paise,
})
export type VendorRevenue = z.infer<typeof VendorRevenue>

export const RevenueReport = z.object({
  business: Business,
  range: DashboardRange,
  from: z.iso.datetime(),
  generatedAt: z.iso.datetime(),
  totals: RevenueTotals,
  previous: RevenueTotals,
  daily: z.array(z.object({ date: z.iso.date(), grossPaise: Paise, platformPaise: Paise })),
  vendors: z.array(VendorRevenue),
  refundRequests: z.object({ count: z.number().int(), amountPaise: Paise }),
})
export type RevenueReport = z.infer<typeof RevenueReport>

export const SearchQuery = z.object({ q: z.string().trim().min(2).max(80) })
export const SearchResults = z.object({
  orders: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      business: Business,
      status: OrderStatus,
      customerName: z.string(),
      vendorName: z.string(),
    }),
  ),
  vendors: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      business: Business,
      status: z.string(),
    }),
  ),
  partners: z.array(
    z.object({ id: z.string(), code: z.string(), name: z.string(), status: z.string() }),
  ),
})
export type SearchResults = z.infer<typeof SearchResults>
