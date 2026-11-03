// Rider performance over a period: deliveries, on-time rate, declined jobs and a 0-100 score.
// Built from finished assignments and the order's own delivered event, so it reflects what
// happened, not what a rider reported. Scoped like the rest of the delivery screens.
import { ORDER_SLA_MINUTES } from "@zoauro/shared"
import { prisma } from "../../lib/prisma"
import type { MemberContext } from "../../middleware/auth"

const DAY = 24 * 60 * 60 * 1000
/** Score weights: on-time matters most, then finishing what was accepted. */
const ON_TIME_WEIGHT = 0.6
const COMPLETION_WEIGHT = 0.4

export type RiderPerformance = {
  boyId: string
  code: string
  name: string
  fleetName: string
  deliveries: number
  declined: number
  onTime: number
  onTimeRate: number | null
  completionRate: number | null
  avgMinutes: number | null
  score: number | null
}

export async function riderPerformance(
  member: MemberContext,
  range: { from?: string; to?: string },
): Promise<RiderPerformance[]> {
  const to = range.to ? new Date(`${range.to}T23:59:59.999Z`) : new Date()
  const from = range.from
    ? new Date(`${range.from}T00:00:00.000Z`)
    : new Date(to.getTime() - 30 * DAY)

  const assignments = await prisma.deliveryAssignment.findMany({
    where: {
      assignedAt: { gte: from, lte: to },
      status: { in: ["completed", "rejected", "cancelled"] },
      ...(member.role !== "super_admin" && { boy: { zoneId: { in: member.zoneIds } } }),
    },
    select: {
      status: true,
      boyId: true,
      order: { select: { id: true, placedAt: true, business: true } },
      boy: { select: { code: true, name: true, fleet: { select: { name: true } } } },
    },
    take: 10_000,
  })

  const completedOrderIds = assignments
    .filter((row) => row.status === "completed")
    .map((row) => row.order.id)
  const deliveredEvents = completedOrderIds.length
    ? await prisma.orderEvent.findMany({
        where: { orderId: { in: completedOrderIds }, to: "delivered" },
        select: { orderId: true, at: true },
        orderBy: { at: "asc" },
      })
    : []
  const deliveredAt = new Map<string, Date>()
  for (const event of deliveredEvents)
    if (!deliveredAt.has(event.orderId)) deliveredAt.set(event.orderId, event.at)

  type Tally = RiderPerformance & { minutesTotal: number; timed: number }
  const tallies = new Map<string, Tally>()
  for (const row of assignments) {
    const tally =
      tallies.get(row.boyId) ??
      ({
        boyId: row.boyId,
        code: row.boy.code,
        name: row.boy.name,
        fleetName: row.boy.fleet.name,
        deliveries: 0,
        declined: 0,
        onTime: 0,
        onTimeRate: null,
        completionRate: null,
        avgMinutes: null,
        score: null,
        minutesTotal: 0,
        timed: 0,
      } satisfies Tally)
    if (row.status === "completed") {
      tally.deliveries += 1
      const at = deliveredAt.get(row.order.id)
      if (at) {
        const minutes = (at.getTime() - row.order.placedAt.getTime()) / 60_000
        tally.minutesTotal += minutes
        tally.timed += 1
        if (minutes <= ORDER_SLA_MINUTES[row.order.business]) tally.onTime += 1
      }
    } else {
      tally.declined += 1
    }
    tallies.set(row.boyId, tally)
  }

  return [...tallies.values()]
    .map((tally) => {
      const finished = tally.deliveries + tally.declined
      const onTimeRate = tally.deliveries ? tally.onTime / tally.deliveries : 0
      const completionRate = finished ? tally.deliveries / finished : 0
      return {
        boyId: tally.boyId,
        code: tally.code,
        name: tally.name,
        fleetName: tally.fleetName,
        deliveries: tally.deliveries,
        declined: tally.declined,
        onTime: tally.onTime,
        onTimeRate: tally.deliveries ? Math.round(onTimeRate * 100) : null,
        completionRate: finished ? Math.round(completionRate * 100) : null,
        avgMinutes: tally.timed ? Math.round(tally.minutesTotal / tally.timed) : null,
        score: finished
          ? Math.round(100 * (ON_TIME_WEIGHT * onTimeRate + COMPLETION_WEIGHT * completionRate))
          : null,
      } satisfies RiderPerformance
    })
    .sort(
      (a, b) =>
        (b.score ?? -1) - (a.score ?? -1) ||
        b.deliveries - a.deliveries ||
        a.name.localeCompare(b.name),
    )
}
