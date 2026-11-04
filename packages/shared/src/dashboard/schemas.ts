// Command Center, Business overview, revenue screens and global search.
import { z } from "zod"
import { Business } from "../common/enums"
import { Paise } from "../common/money"
import { OrderStatus } from "../orders/status"

/**
 * Reporting periods, counted in India Standard Time days ending today. Besides the rolling
 * windows, "365d" is the last year and "y2026" is that whole calendar year (to date for the
 * current one); the year options are built from today's date so they never need updating.
 */
export const DASHBOARD_RANGES = ["today", "7d", "30d", "90d", "365d"] as const
/** A rolling window, a calendar year ("y2025") or a custom span ("c2025-01-01_2025-03-31"). */
export type DashboardRange = string
const RANGE_PATTERN = /^(today|7d|30d|90d|365d|y\d{4}|c\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2})$/
export const DashboardRange = z
  .string()
  .regex(RANGE_PATTERN)
  .transform((v) => v as DashboardRange)
const FIRST_YEAR = 2024
const DAY_COUNT: Record<(typeof DASHBOARD_RANGES)[number], number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
}

/** Calendar year for a "yYYYY" range, else undefined. */
export const rangeYear = (r: string) => (/^y\d{4}$/.test(r) ? Number(r.slice(1)) : undefined)
/** Day count for a rolling range, else undefined (calendar years vary). */
export const rangeDays = (r: string) => DAY_COUNT[r as keyof typeof DAY_COUNT]
/** Custom range "cYYYY-MM-DD_YYYY-MM-DD" (IST days, inclusive). */
export const customRange = (from: string, to: string) => `c${from}_${to}` as DashboardRange
export const rangeCustom = (r: string) => {
  const m = /^c(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(r)
  return m ? { from: m[1]!, to: m[2]! } : undefined
}
const shortDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
export const rangeLabel = (r: string) => {
  const c = rangeCustom(r)
  if (c) return `${shortDay(c.from)} – ${shortDay(c.to)}`
  return rangeYearLabel(r)
}
const rangeYearLabel = (r: string) =>
  rangeYear(r) !== undefined
    ? `Year ${r.slice(1)}`
    : r === "today"
      ? "Today"
      : r === "365d"
        ? "Last 12 months"
        : `Last ${DAY_COUNT[r as keyof typeof DAY_COUNT]} days`

/** Every range a picker offers: rolling windows, then this year back to the first year. */
export function rangeOptions(now = new Date()): DashboardRange[] {
  const year = new Date(now.getTime() + 330 * 60_000).getUTCFullYear()
  const years: DashboardRange[] = []
  for (let y = year; y >= Math.min(FIRST_YEAR, year); y--) years.push(`y${y}`)
  return [...DASHBOARD_RANGES, ...years]
}

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
  /** Partner pay (salary, fixed, incentive, commission) for the zones served, split between businesses by deliveries. */
  riderCostPaise: Paise,
  /** Platform revenue less rider cost. */
  marginPaise: z.number().int(),
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

export const GEO_LEVELS = ["state", "district", "zone"] as const
export const GeoLevel = z.enum(GEO_LEVELS)
export type GeoLevel = z.infer<typeof GeoLevel>

/** State → district → zone drill-down: the level is the narrowest filter given plus one. */
export const GeoQuery = DashboardQuery.extend({
  state: z.string().trim().min(1).max(120).optional(),
  districtId: z.string().min(1).max(64).optional(),
})
export type GeoQuery = z.infer<typeof GeoQuery>

export const GeoRow = z.object({
  /** What a click drills into: a state name, a district id or a zone id. */
  key: z.string(),
  label: z.string(),
  /** The state a district or zone belongs to, for the breadcrumb. */
  state: z.string().nullable(),
  zones: z.number().int(),
  orders: z.number().int(),
  delivered: z.number().int(),
  cancelled: z.number().int(),
  grossPaise: Paise,
  platformPaise: Paise,
  riderCostPaise: Paise,
  marginPaise: z.number().int(),
  /** Percent of delivered orders inside the time limit; null when nothing was delivered. */
  onTimeRate: z.number().nullable(),
  /** Percent of the period's orders that were cancelled; null when there were none. */
  cancellationRate: z.number().nullable(),
  /** Orders waiting to be delivered right now. */
  openOrders: z.number().int(),
  ridersAvailable: z.number().int(),
  /** Open orders beyond the riders free in the same zone, summed over the zones here. */
  riderShortage: z.number().int(),
})
export type GeoRow = z.infer<typeof GeoRow>

export const GeoInsights = z.object({
  level: GeoLevel,
  range: DashboardRange,
  generatedAt: z.iso.datetime(),
  /** Names for the breadcrumb of the level being shown. */
  state: z.string().nullable(),
  districtName: z.string().nullable(),
  rows: z.array(GeoRow),
})
export type GeoInsights = z.infer<typeof GeoInsights>
