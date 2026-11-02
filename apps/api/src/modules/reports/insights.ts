// Unusual order counts per zone: today's orders compared with the zone's usual day over the
// previous four weeks. A zone is flagged when today is well above its usual count. Suggestions
// only; nothing changes automatically.
import type { Business } from "@zoauro/shared"
import { Prisma } from "../../generated/prisma/client"
import { prisma } from "../../lib/prisma"

const IST = 330 * 60_000
const DAY = 86_400_000
const LOOKBACK_DAYS = 28
const MIN_ORDERS_TO_FLAG = 5

export type ZoneInsight = {
  zoneId: string
  zoneName: string
  today: number
  usualPerDay: number
  flagged: boolean
  reason: string | null
}

const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10)

/** Mean and standard deviation of a list of daily counts. */
export function usualCount(counts: number[]) {
  if (counts.length === 0) return { mean: 0, sd: 0 }
  const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length
  const variance = counts.reduce((sum, count) => sum + (count - mean) ** 2, 0) / counts.length
  return { mean, sd: Math.sqrt(variance) }
}

/** Flags today when it is at least the minimum and clearly above the zone's usual day. */
export function judge(today: number, history: number[]) {
  const { mean, sd } = usualCount(history)
  if (today < MIN_ORDERS_TO_FLAG) return { flagged: false, reason: null }
  if (today > mean + 2 * sd && today > mean * 1.5)
    return {
      flagged: true,
      reason: `${today} orders today, usually about ${Math.round(mean)} a day.`,
    }
  return { flagged: false, reason: null }
}

export async function zoneInsights(
  s: { businesses: Business[]; zoneIds: string[] | null },
  now = Date.now(),
): Promise<ZoneInsight[]> {
  const today = istDay(now)
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - IST - LOOKBACK_DAYS * DAY)
  const rows = await prisma.$queryRaw<
    { zoneId: string; zoneName: string; day: string; orders: number }[]
  >`
    SELECT o."zoneId" AS "zoneId", z."location" || ', ' || z."city" AS "zoneName",
      to_char((o."placedAt" + interval '330 minutes')::date, 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS orders
    FROM orders o JOIN zones z ON z.id = o."zoneId"
    WHERE o."business"::text = ANY(${s.businesses}::text[])
      ${s.zoneIds ? Prisma.sql`AND o."zoneId" = ANY(${s.zoneIds}::text[])` : Prisma.empty}
      AND o."placedAt" >= ${from} AND o."placedAt" < ${new Date(now)}
      AND o."status" NOT IN ('cancelled', 'refunded')
    GROUP BY 1, 2, 3`

  const byZone = new Map<string, { zoneName: string; days: Map<string, number> }>()
  for (const row of rows) {
    const zone = byZone.get(row.zoneId) ?? { zoneName: row.zoneName, days: new Map() }
    zone.days.set(row.day, row.orders)
    byZone.set(row.zoneId, zone)
  }

  return [...byZone.entries()]
    .map(([zoneId, zone]) => {
      const todayCount = zone.days.get(today) ?? 0
      const history = Array.from(
        { length: LOOKBACK_DAYS },
        (_, i) =>
          zone.days.get(istDay(Date.parse(`${today}T00:00:00Z`) - IST - (i + 1) * DAY)) ?? 0,
      )
      const { mean } = usualCount(history)
      const verdict = judge(todayCount, history)
      return {
        zoneId,
        zoneName: zone.zoneName,
        today: todayCount,
        usualPerDay: Math.round(mean * 10) / 10,
        ...verdict,
      }
    })
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.today - a.today)
}
