// Reports & Analytics (Super Admin): totals against the previous window of the same length,
// platform revenue per day / week / month per business, and the top vendors.
// GET /reports/analytics?period=daily|weekly|monthly (reports.view). Amounts in paise.
import {
  AnalyticsQuery,
  PartnerComparisonQuery,
  RiderComparisonQuery,
  RiderDeliveriesQuery,
  type Analytics,
  type AnalyticsPeriod,
  type Business,
} from "@zoauro/shared"
import { Router, type Request, type Response } from "express"
import { Prisma } from "../../generated/prisma/client"
import { parse } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission, scope } from "../../middleware/auth"
import { GeoQuery, geoZoneIds } from "../geography"
import { zoneInsights } from "./insights"
import {
  districtComparison,
  partnerComparison,
  riderComparison,
  riderDeliveries,
} from "./rider-reports"

/** Who the report covers. Delivery partner and rider narrow the orders to those they delivered. */
type Scope = {
  businesses: Business[]
  zoneIds: string[] | null
  fleetId?: string
  boyId?: string
}
const IST = 330 * 60_000
const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10)
const istStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST)
const DAY = 86_400_000

type Unit = "day" | "week" | "month" | "year"
type Window = { from: Date; to: Date; unit: Unit; buckets: number; first: string }

const MAX_CUSTOM_DAYS = 1095

/**
 * A picked span of IST days, inclusive. Dates are swapped if inverted, never run past today, and
 * reach back at most three years. Short spans report per day, medium ones per week, long ones per month.
 */
export function customWindow(fromDay: string, toDay: string, now = Date.now()): Window {
  const today = istDay(now)
  let last = fromDay > toDay ? fromDay : toDay
  let first = fromDay > toDay ? toDay : fromDay
  if (last > today) last = today
  if (first > last) first = last
  const dayMs = (d: string) => istStart(d).getTime()
  if ((dayMs(last) - dayMs(first)) / DAY + 1 > MAX_CUSTOM_DAYS)
    first = istDay(dayMs(last) - (MAX_CUSTOM_DAYS - 1) * DAY + 3_600_000)
  const days = Math.round((dayMs(last) - dayMs(first)) / DAY) + 1
  const from = istStart(first)
  const to = new Date(Math.min(dayMs(last) + DAY, now))
  if (days <= 31) return { from, to, unit: "day", buckets: days, first }
  if (days <= 140) {
    const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
    const monday = istDay(dayMs(first) - dow * DAY + 3_600_000)
    const weeks = Math.floor((dayMs(last) - dayMs(monday)) / DAY / 7) + 1
    return { from, to, unit: "week", buckets: weeks, first: monday }
  }
  const [fy, fm] = first.split("-").map(Number) as [number, number]
  const [ly, lm] = last.split("-").map(Number) as [number, number]
  return {
    from,
    to,
    unit: "month",
    buckets: (ly - fy) * 12 + (lm - fm) + 1,
    first: new Date(Date.UTC(fy, fm - 1, 1)).toISOString().slice(0, 10),
  }
}

/** The reporting window and how many buckets it has. */
export function window(
  period: AnalyticsPeriod,
  now = Date.now(),
  range?: { from: string; to: string },
): Window {
  const today = istDay(now)
  if (period === "custom") return customWindow(range?.from ?? today, range?.to ?? today, now)
  if (period === "yearly") {
    // The last five calendar years, this one included.
    const first = `${Number(today.slice(0, 4)) - 4}-01-01`
    return { from: istStart(first), to: new Date(now), unit: "year", buckets: 5, first }
  }
  if (period === "daily") {
    const from = istStart(istDay(istStart(today).getTime() - 13 * DAY + 3_600_000))
    return {
      from,
      to: new Date(now),
      unit: "day",
      buckets: 14,
      first: istDay(from.getTime() + 3_600_000),
    }
  }
  if (period === "weekly") {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
    const monday = istStart(today).getTime() - dow * DAY
    const from = new Date(monday - 7 * 7 * DAY)
    return {
      from,
      to: new Date(now),
      unit: "week",
      buckets: 8,
      first: istDay(from.getTime() + 3_600_000),
    }
  }
  const [y, m] = today.split("-").map(Number) as [number, number]
  const first = new Date(Date.UTC(y, m - 1 - 5, 1)).toISOString().slice(0, 10)
  return { from: istStart(first), to: new Date(now), unit: "month", buckets: 6, first }
}

function where(s: Scope, from: Date, to: Date) {
  return Prisma.sql`o."business"::text = ANY(${s.businesses}::text[])
    ${s.zoneIds ? Prisma.sql`AND o."zoneId" = ANY(${s.zoneIds}::text[])` : Prisma.empty}
    ${s.fleetId ? Prisma.sql`AND o."deliveryFleetId" = ${s.fleetId}` : Prisma.empty}
    ${s.boyId ? Prisma.sql`AND o."deliveryBoyId" = ${s.boyId}` : Prisma.empty}
    AND o."placedAt" >= ${from} AND o."placedAt" < ${to}
    AND o."status" NOT IN ('cancelled', 'refunded')`
}
const PLATFORM = Prisma.sql`(o."deliveryFeePaise" + o."itemsTotalPaise"::bigint * v."commissionBps" / 10000)`

async function totals(s: Scope, from: Date, to: Date) {
  const [r] = await prisma.$queryRaw<{ orders: number; gross: bigint; platform: bigint }[]>`
    SELECT COUNT(*)::int AS orders, COALESCE(SUM(o."totalPaise"), 0)::bigint AS gross,
      COALESCE(SUM(${PLATFORM}), 0)::bigint AS platform
    FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
    WHERE ${where(s, from, to)}`
  return { orders: r!.orders, gross: Number(r!.gross), platform: Number(r!.platform) }
}

const label = (unit: Unit, day: string) => {
  const d = new Date(`${day}T00:00:00Z`)
  const opts: Intl.DateTimeFormatOptions =
    unit === "year"
      ? { year: "numeric" }
      : unit === "month"
        ? { month: "short", year: "numeric" }
        : { day: "numeric", month: "short" }
  return `${unit === "week" ? "Wk of " : ""}${d.toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" })}`
}

export async function analytics(
  s: Scope,
  period: AnalyticsPeriod,
  range?: { from: string; to: string },
): Promise<Analytics> {
  const w = window(period, Date.now(), range)
  const span = w.to.getTime() - w.from.getTime()
  const prevFrom = new Date(w.from.getTime() - span)
  const unit = Prisma.raw(`'${w.unit}'`)
  const [now, before, series, vendors] = await Promise.all([
    totals(s, w.from, w.to),
    totals(s, prevFrom, w.from),
    prisma.$queryRaw<{ bucket: string; business: Business; platform: bigint }[]>`
      SELECT to_char(date_trunc(${unit}, o."placedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS bucket,
        o."business"::text AS business, SUM(${PLATFORM})::bigint AS platform
      FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
      WHERE ${where(s, w.from, w.to)}
      GROUP BY 1, 2`,
    prisma.$queryRaw<
      {
        id: string
        code: string
        name: string
        business: Business
        orders: number
        gross: bigint
      }[]
    >`
      SELECT v."id", v."code", v."name", v."business"::text AS business,
        COUNT(*)::int AS orders, SUM(o."totalPaise")::bigint AS gross
      FROM "orders" o JOIN "vendors" v ON v."id" = o."vendorId"
      WHERE ${where(s, w.from, w.to)}
      GROUP BY v."id" ORDER BY gross DESC LIMIT 5`,
  ])
  // Every bucket in the window, including empty ones.
  const starts: string[] = []
  for (let i = 0; i < w.buckets; i++) {
    if (w.unit === "year") {
      const [y] = w.first.split("-").map(Number) as [number]
      starts.push(new Date(Date.UTC(y + i, 0, 1)).toISOString().slice(0, 10))
    } else if (w.unit === "month") {
      const [y, m] = w.first.split("-").map(Number) as [number, number]
      starts.push(new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10))
    } else
      starts.push(
        new Date(Date.parse(`${w.first}T00:00:00Z`) + i * (w.unit === "week" ? 7 : 1) * DAY)
          .toISOString()
          .slice(0, 10),
      )
  }
  const avg = (t: { orders: number; gross: number }) =>
    t.orders ? Math.round(t.gross / t.orders) : 0
  return {
    period,
    metrics: {
      orders: { value: now.orders, previous: before.orders },
      grossPaise: { value: now.gross, previous: before.gross },
      platformPaise: { value: now.platform, previous: before.platform },
      averageOrderPaise: { value: avg(now), previous: avg(before) },
    },
    series: starts.map((from) => {
      const of = (b: Business) =>
        Number(series.find((r) => r.bucket === from && r.business === b)?.platform ?? 0)
      return { label: label(w.unit, from), from, food: of("food"), mart: of("mart") }
    }),
    topVendors: vendors.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      business: v.business,
      orders: v.orders,
      grossPaise: Number(v.gross),
    })),
  }
}

/** The span a comparison covers: its period, or the custom first and last date. */
const spanOf = (q: { period: AnalyticsPeriod; from?: string; to?: string }) =>
  window(q.period, Date.now(), q.from && q.to ? { from: q.from, to: q.to } : undefined)

export const reportRoutes = Router()
  .use(requireAuth, requirePermission("reports.view"))
  .get("/insights", async (req: Request, res: Response) => {
    const s = scope(req)
    res.json(
      await zoneInsights({
        ...s,
        zoneIds: await geoZoneIds(parse(GeoQuery, req.query), s.zoneIds),
      }),
    )
  })
  .get("/analytics", async (req: Request, res: Response) => {
    const q = parse(AnalyticsQuery, req.query)
    const s = scope(req)
    const zoneIds = await geoZoneIds(parse(GeoQuery, req.query), s.zoneIds)
    res.json(
      await analytics(
        { ...s, zoneIds, fleetId: q.fleetId, boyId: q.boyId },
        q.period,
        q.from && q.to ? { from: q.from, to: q.to } : undefined,
      ),
    )
  })
  .get("/districts", async (req: Request, res: Response) => {
    const q = parse(PartnerComparisonQuery, req.query)
    const s = scope(req)
    const zoneIds = await geoZoneIds(parse(GeoQuery, req.query), s.zoneIds)
    res.json(await districtComparison({ ...s, zoneIds }, spanOf(q)))
  })
  .get("/partners", async (req: Request, res: Response) => {
    const q = parse(PartnerComparisonQuery, req.query)
    const s = scope(req)
    const zoneIds = await geoZoneIds(parse(GeoQuery, req.query), s.zoneIds)
    res.json(await partnerComparison({ ...s, zoneIds }, spanOf(q)))
  })
  .get("/riders", async (req: Request, res: Response) => {
    const q = parse(RiderComparisonQuery, req.query)
    const s = scope(req)
    const zoneIds = await geoZoneIds(parse(GeoQuery, req.query), s.zoneIds)
    res.json(await riderComparison({ ...s, zoneIds, fleetId: q.fleetId }, spanOf(q)))
  })
  .get("/riders/:id/deliveries", async (req: Request, res: Response) => {
    const s = scope(req)
    const q = parse(RiderDeliveriesQuery, req.query)
    res.json(await riderDeliveries({ ...s, boyId: String(req.params.id) }, spanOf(q)))
  })
