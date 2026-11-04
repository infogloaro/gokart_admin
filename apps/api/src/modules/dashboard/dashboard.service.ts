import {
  rangeDays,
  rangeCustom,
  rangeYear,
  type AttentionItem,
  type Business,
  type DashboardHealth,
  type DashboardOverview,
  type DashboardRange,
  type GeoInsights,
  type GeoLevel,
  type RevenueReport,
  type RevenueTotals,
  type SearchResults,
} from "@zoauro/shared"
import * as repo from "./dashboard.repository"
import { overallShare, rollUp, withEmptyAreas, type ZoneFigures } from "./dashboard.geo"
import type { Period, Scope } from "./dashboard.repository"

const DAY = 86_400_000
const IST = 330 * 60_000

/** IST yyyy-mm-dd for an instant. */
const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10)

/**
 * The period runs from the start of the first IST day to now; the comparison period
 * covers the same stretch of time immediately before it. A calendar-year range runs from
 * 1 January to now (current year) or to 31 December (past years).
 */
export function periods(range: DashboardRange, now = Date.now()) {
  const startOfToday = startOfDay(now)
  const year = rangeYear(range)
  let from: number
  let end: number
  const custom = rangeCustom(range)
  if (custom) {
    const dayStart = (d: string) => Date.parse(`${d}T00:00:00.000Z`) - IST
    const a = dayStart(custom.from)
    const b = dayStart(custom.to)
    // Inverted dates are swapped; the span is capped at three years and never runs past now.
    from = Math.max(Math.min(a, b), startOfToday - 1095 * DAY)
    end = Math.min(Math.max(a, b) + DAY - 1, now)
    if (end < from) from = startOfDay(end)
  } else if (year === undefined) {
    from = startOfToday - (rangeDays(range) - 1) * DAY
    end = now
  } else {
    const thisYear = new Date(now + IST).getUTCFullYear()
    const y = Math.min(year, thisYear)
    from = Date.parse(`${y}-01-01T00:00:00.000Z`) - IST
    end = y === thisYear ? now : Date.parse(`${y + 1}-01-01T00:00:00.000Z`) - IST - 1
  }
  const days = Math.max(1, Math.round((startOfDay(end) - from) / DAY) + 1)
  const span = days * DAY
  return {
    current: { from: new Date(from), to: new Date(end) } satisfies Period,
    previous: { from: new Date(from - span), to: new Date(end - span) } satisfies Period,
    dates: Array.from({ length: days }, (_, i) => istDay(from + i * DAY)),
  }
}

/** Start of the IST day containing an instant. */
const startOfDay = (t: number) => Date.parse(`${istDay(t)}T00:00:00.000Z`) - IST

type Totals = Awaited<ReturnType<typeof repo.totals>>[number]
const sum = (rows: Totals[], key: keyof Omit<Totals, "business">) =>
  rows.reduce((t, r) => t + r[key], 0)
const platform = (rows: Totals[]) => sum(rows, "commissionPaise") + sum(rows, "deliveryFeesPaise")
const iso = (d: Date | null) => d?.toISOString() ?? null

export async function overview(s: Scope, range: DashboardRange): Promise<DashboardOverview> {
  const p = periods(range)
  const hourly = range === "today"
  const [now, before, daily, snap, recent, floor, statuses, activity] = await Promise.all([
    repo.totals(s, p.current),
    repo.totals(s, p.previous),
    repo.daily(s, p.current),
    repo.snapshot(s),
    repo.recentOrders(s),
    repo.floor(s),
    repo.byStatus(s, p.current),
    repo.activity(s, p.current, hourly),
  ])
  const buckets = hourly
    ? Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"))
    : p.dates
  const trend = p.dates.map((date) => {
    const of = (b: Business) =>
      daily.find((d) => d.day === date && d.business === b)?.grossPaise ?? 0
    return { date, food: of("food"), mart: of("mart") }
  })
  const orders = sum(now, "orders")
  const delivered = sum(now, "delivered")
  const cancelled = sum(now, "cancelled")
  const refunded = sum(now, "refunded")

  const attention: AttentionItem[] = [
    {
      kind: "vendor_approvals",
      count: snap.pendingVendors.count,
      amountPaise: null,
      oldestAt: iso(snap.pendingVendors.oldestAt),
    },
    {
      kind: "refund_requests",
      count: snap.refundRequests.count,
      amountPaise: snap.refundRequests.amountPaise,
      oldestAt: iso(snap.refundRequests.oldestAt),
    },
    {
      kind: "partner_approvals",
      count: snap.pendingPartners.count,
      amountPaise: null,
      oldestAt: iso(snap.pendingPartners.oldestAt),
    },
    {
      kind: "partner_documents",
      count: snap.documents.count,
      amountPaise: null,
      oldestAt: iso(snap.documents.oldestAt),
    },
    { kind: "delayed_orders", count: snap.delayed, amountPaise: null, oldestAt: null },
  ]

  return {
    range,
    from: p.current.from.toISOString(),
    generatedAt: new Date().toISOString(),
    metrics: {
      orders: { value: orders, previous: sum(before, "orders") },
      grossPaise: { value: sum(now, "grossPaise"), previous: sum(before, "grossPaise") },
      platformRevenuePaise: { value: platform(now), previous: platform(before) },
      activeVendors: { value: snap.activeVendors, previous: null },
      partnersOnline: { value: snap.partnersOnline, previous: null },
      openOrders: { value: snap.openOrders, previous: null },
      openComplaints: { value: snap.refundRequests.count + snap.delayed, previous: null },
      pendingApprovals: {
        value: snap.pendingVendors.count + snap.pendingPartners.count,
        previous: null,
      },
    },
    trend,
    distribution: {
      delivered,
      cancelled,
      refunded,
      inProgress: orders - delivered - cancelled - refunded,
    },
    recent: recent.map((o) => ({
      id: o.id,
      code: o.code,
      business: o.business,
      status: o.status,
      customerName: o.customerName,
      vendorName: o.vendor.name,
      totalPaise: o.totalPaise,
      placedAt: o.placedAt.toISOString(),
    })),
    attention: attention.filter((a) => a.count > 0),
    floor: { ...floor, delayed: snap.delayed },
    byStatus: statuses,
    activity: buckets.map((bucket) => {
      const a = activity.find((r) => r.bucket === bucket)
      return { bucket, orders: a?.orders ?? 0, completed: a?.completed ?? 0 }
    }),
  }
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null)

export async function health(s: Scope, range: DashboardRange): Promise<DashboardHealth> {
  const p = periods(range)
  const [totals, service, snaps] = await Promise.all([
    repo.totals(s, p.current),
    repo.service(s, p.current),
    Promise.all(s.businesses.map((b) => repo.snapshot({ ...s, businesses: [b] }))),
  ])
  return {
    range,
    generatedAt: new Date().toISOString(),
    businesses: s.businesses.map((business, i) => {
      const t = totals.find((r) => r.business === business)
      const sv = service.find((r) => r.business === business)
      const snap = snaps[i]!
      const finished = (t?.delivered ?? 0) + (t?.cancelled ?? 0) + (t?.refunded ?? 0)
      return {
        business,
        acceptanceRate: sv ? pct(sv.decided - sv.rejected, sv.decided) : null,
        onTimeRate: sv ? pct(sv.on_time, sv.delivered) : null,
        completionRate: pct(t?.delivered ?? 0, finished),
        ratingTenths: snap.ratingTenths,
        orders: t?.orders ?? 0,
        openOrders: snap.openOrders,
        delayedNow: snap.delayed,
        activeVendors: snap.activeVendors,
        partnersOnline: snap.partnersOnline,
      }
    }),
  }
}

const ALL_BUSINESSES = ["food", "mart"] as const

/** Per-zone money, outcomes, rider cost and rider supply for the businesses and period in view. */
async function zoneFigures(s: Scope, p: Period, withSupply: boolean): Promise<ZoneFigures[]> {
  const everyone = { ...s, businesses: [...ALL_BUSINESSES] }
  const [directory, stats, allStats, cost, supply] = await Promise.all([
    repo.zoneDirectory(s),
    repo.zoneStats(s, p),
    repo.zoneStats(everyone, p),
    repo.riderCostByZone(s, p),
    withSupply ? repo.zoneSupply(s) : null,
  ])
  const byZone = new Map(stats.map((r) => [r.zoneId, r]))
  const deliveredAll = new Map(allStats.map((r) => [r.zoneId, r.delivered]))
  return directory.map((z) => {
    const r = byZone.get(z.id)
    return {
      zoneId: z.id,
      label: `${z.location}, ${z.city}`,
      districtId: z.districtId,
      districtName: z.districtRecord.name,
      state: z.districtRecord.state,
      orders: r?.orders ?? 0,
      delivered: r?.delivered ?? 0,
      cancelled: r?.cancelled ?? 0,
      grossPaise: r?.grossPaise ?? 0,
      platformPaise: r?.platformPaise ?? 0,
      zoneCostPaise: cost.get(z.id) ?? 0,
      deliveredInView: r?.delivered ?? 0,
      deliveredAll: deliveredAll.get(z.id) ?? 0,
      timed: r?.timed ?? 0,
      onTime: r?.onTime ?? 0,
      openOrders: supply?.open.get(z.id) ?? 0,
      ridersAvailable: supply?.riders.get(z.id) ?? 0,
    }
  })
}

const viewCoversAll = (s: Scope) => ALL_BUSINESSES.every((b) => s.businesses.includes(b))

async function riderCost(s: Scope, p: Period) {
  const figures = await zoneFigures(s, p, false)
  const rows = rollUp(figures, "state", overallShare(figures, viewCoversAll(s)))
  return rows.reduce((t, r) => t + r.riderCostPaise, 0)
}

export async function geo(
  s: Scope,
  range: DashboardRange,
  state?: string,
  districtId?: string,
): Promise<GeoInsights> {
  const p = periods(range)
  const [figures, districts] = await Promise.all([
    zoneFigures(s, p.current, true),
    // A member limited to some zones sees only those; the rest of India is for Super Admins.
    s.zoneIds ? Promise.resolve([]) : repo.districtDirectory(),
  ])
  const inState = state ? figures.filter((z) => z.state === state) : figures
  const inDistrict = districtId ? inState.filter((z) => z.districtId === districtId) : inState
  const level: GeoLevel = districtId ? "zone" : state ? "district" : "state"
  return {
    level,
    range,
    generatedAt: new Date().toISOString(),
    state: state ?? null,
    districtName: districtId ? (inDistrict[0]?.districtName ?? null) : null,
    // The fallback share is measured over every zone in scope, not only the ones being shown.
    rows: withEmptyAreas(
      rollUp(inDistrict, level, overallShare(figures, viewCoversAll(s))),
      level,
      districts
        .filter((d) => !state || d.state === state)
        .map((d) => ({ districtId: d.id, districtName: d.name, state: d.state })),
    ),
  }
}

function revenueTotals(t: Totals | undefined, riderCostPaise: number): RevenueTotals {
  const commission = t?.commissionPaise ?? 0
  const fees = t?.deliveryFeesPaise ?? 0
  return {
    orders: t?.orders ?? 0,
    grossPaise: t?.grossPaise ?? 0,
    commissionPaise: commission,
    deliveryFeesPaise: fees,
    platformPaise: commission + fees,
    vendorSharePaise: (t?.itemsPaise ?? 0) - commission,
    refundsPaise: t?.refundsPaise ?? 0,
    refundCount: t?.refundCount ?? 0,
    riderCostPaise,
    marginPaise: commission + fees - riderCostPaise,
  }
}

export async function revenue(
  s: Scope,
  business: Business,
  range: DashboardRange,
): Promise<RevenueReport> {
  const one = { ...s, businesses: [business] }
  const p = periods(range)
  const [now, before, daily, vendors, snap, costNow, costBefore] = await Promise.all([
    repo.totals(one, p.current),
    repo.totals(one, p.previous),
    repo.daily(one, p.current),
    repo.byVendor(one, p.current),
    repo.snapshot(one),
    riderCost(one, p.current),
    riderCost(one, p.previous),
  ])
  return {
    business,
    range,
    from: p.current.from.toISOString(),
    generatedAt: new Date().toISOString(),
    totals: revenueTotals(now[0], costNow),
    previous: revenueTotals(before[0], costBefore),
    daily: p.dates.map((date) => {
      const d = daily.find((r) => r.day === date)
      return { date, grossPaise: d?.grossPaise ?? 0, platformPaise: d?.platformPaise ?? 0 }
    }),
    vendors,
    refundRequests: {
      count: snap.refundRequests.count,
      amountPaise: snap.refundRequests.amountPaise,
    },
  }
}

export async function search(
  s: Scope,
  q: string,
  want: { orders: boolean; vendors: boolean; partners: boolean },
): Promise<SearchResults> {
  const [orders, vendors, partners] = await repo.search(s, q, want)
  return {
    orders: orders.map((o) => ({
      id: o.id,
      code: o.code,
      business: o.business,
      status: o.status,
      customerName: o.customerName,
      vendorName: o.vendor.name,
    })),
    vendors: vendors.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      business: v.business,
      status: v.status,
    })),
    partners: partners.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status })),
  }
}
