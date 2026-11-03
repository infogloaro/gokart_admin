// Reports & Analytics (Super Admin): totals against the previous window of the same length,
// platform revenue per day / week / month per business, and the top vendors.
// GET /reports/analytics?period=daily|weekly|monthly (reports.view). Amounts in paise.
import { AnalyticsQuery, type Analytics, type Business, type ReportPeriod } from "@zoauro/shared"
import { Router, type Request, type Response } from "express"
import { Prisma } from "../../generated/prisma/client"
import { parse } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission, scope } from "../../middleware/auth"
import { GeoQuery, geoZoneIds } from "../geography"
import { zoneInsights } from "./insights"

type Scope = { businesses: Business[]; zoneIds: string[] | null }
const IST = 330 * 60_000
const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10)
const istStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST)
const DAY = 86_400_000

/** The reporting window and how many buckets it has. */
function window(period: ReportPeriod, now = Date.now()) {
  const today = istDay(now)
  if (period === "daily") {
    const from = istStart(istDay(istStart(today).getTime() - 13 * DAY + 3_600_000))
    return { from, to: new Date(now), unit: "day" as const, buckets: 14 }
  }
  if (period === "weekly") {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
    const monday = istStart(today).getTime() - dow * DAY
    return {
      from: new Date(monday - 7 * 7 * DAY),
      to: new Date(now),
      unit: "week" as const,
      buckets: 8,
    }
  }
  const [y, m] = today.split("-").map(Number) as [number, number]
  const first = new Date(Date.UTC(y, m - 1 - 5, 1)).toISOString().slice(0, 10)
  return { from: istStart(first), to: new Date(now), unit: "month" as const, buckets: 6 }
}

function where(s: Scope, from: Date, to: Date) {
  return Prisma.sql`o."business"::text = ANY(${s.businesses}::text[])
    ${s.zoneIds ? Prisma.sql`AND o."zoneId" = ANY(${s.zoneIds}::text[])` : Prisma.empty}
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

const label = (unit: "day" | "week" | "month", day: string) => {
  const d = new Date(`${day}T00:00:00Z`)
  const opts: Intl.DateTimeFormatOptions =
    unit === "month" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" }
  return `${unit === "week" ? "Wk of " : ""}${d.toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" })}`
}

export async function analytics(s: Scope, period: ReportPeriod): Promise<Analytics> {
  const w = window(period)
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
  const firstDay = istDay(w.from.getTime())
  for (let i = 0; i < w.buckets; i++) {
    if (w.unit === "month") {
      const [y, m] = firstDay.split("-").map(Number) as [number, number]
      starts.push(new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10))
    } else starts.push(istDay(w.from.getTime() + i * (w.unit === "week" ? 7 : 1) * DAY + 3_600_000))
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
    res.json(await analytics({ ...s, zoneIds }, q.period))
  })
