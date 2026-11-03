// Vendor scorecards: the last 30 days of orders per vendor, with on-time delivery, cancellations
// and complaints, and a flag for vendors that need attention. Scoped to the member's businesses
// and zones.
import type { Request, Response } from "express"
import { prisma } from "../../lib/prisma"
import { scope } from "../../middleware/auth"
import { ORDER_SLA_MINUTES, type Business } from "@zoauro/shared"

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const ON_TIME_TARGET = 0.8
const CANCEL_LIMIT = 0.1
const COMPLAINT_LIMIT = 5

export type ScorecardRow = {
  vendorId: string
  vendorName: string
  business: Business
  orders: number
  delivered: number
  cancelled: number
  onTimePct: number | null
  cancelPct: number | null
  complaints: number
  needsAttention: boolean
  reasons: string[]
}

/** Pure scoring: on-time share of delivered orders, cancellation share, complaint count. */
export function scoreVendor(input: {
  business: Business
  orders: { status: string; placedAt: Date; deliveredAt: Date | null }[]
  complaints: number
}) {
  const delivered = input.orders.filter((order) => order.status === "delivered")
  const cancelled = input.orders.filter((order) => order.status === "cancelled").length
  const limit = ORDER_SLA_MINUTES[input.business] * 60_000
  // Only delivered orders with a recorded delivery time count towards on-time.
  const timed = delivered.filter((order) => order.deliveredAt !== null)
  const onTime = timed.filter(
    (order) => order.deliveredAt!.getTime() - order.placedAt.getTime() <= limit,
  ).length
  const onTimePct = timed.length ? onTime / timed.length : null
  const cancelPct = input.orders.length ? cancelled / input.orders.length : null
  const reasons: string[] = []
  if (onTimePct !== null && onTimePct < ON_TIME_TARGET)
    reasons.push(`Only ${Math.round(onTimePct * 100)}% on time (target ${ON_TIME_TARGET * 100}%).`)
  if (cancelPct !== null && cancelPct > CANCEL_LIMIT)
    reasons.push(`${Math.round(cancelPct * 100)}% of orders cancelled.`)
  if (input.complaints >= COMPLAINT_LIMIT)
    reasons.push(`${input.complaints} complaints in 30 days.`)
  return { onTimePct, cancelPct, needsAttention: reasons.length > 0, reasons }
}

export async function scorecards(req: Request, res: Response) {
  const s = scope(req)
  const since = new Date(Date.now() - WINDOW_MS)
  const vendors = await prisma.vendor.findMany({
    where: { business: { in: s.businesses }, ...(s.zoneIds && { zoneId: { in: s.zoneIds } }) },
    select: { id: true, name: true, business: true },
    take: 500,
  })
  const rows: ScorecardRow[] = []
  for (const vendor of vendors) {
    const [orders, complaints] = await Promise.all([
      prisma.order.findMany({
        where: { vendorId: vendor.id, placedAt: { gte: since } },
        select: { id: true, status: true, placedAt: true },
        take: 5000,
      }),
      prisma.complaint.count({ where: { vendorName: vendor.name, createdAt: { gte: since } } }),
    ])
    // The moment each delivered order was delivered, from its own event history.
    const events = await prisma.orderEvent.findMany({
      where: {
        to: "delivered",
        orderId: {
          in: orders.filter((order) => order.status === "delivered").map((order) => order.id),
        },
      },
      select: { orderId: true, at: true },
      orderBy: { at: "asc" },
    })
    const deliveredAt = new Map<string, Date>()
    for (const event of events)
      if (!deliveredAt.has(event.orderId)) deliveredAt.set(event.orderId, event.at)
    const score = scoreVendor({
      business: vendor.business,
      orders: orders.map((order) => ({ ...order, deliveredAt: deliveredAt.get(order.id) ?? null })),
      complaints,
    })
    rows.push({
      vendorId: vendor.id,
      vendorName: vendor.name,
      business: vendor.business,
      orders: orders.length,
      delivered: orders.filter((order) => order.status === "delivered").length,
      cancelled: orders.filter((order) => order.status === "cancelled").length,
      onTimePct: score.onTimePct === null ? null : Math.round(score.onTimePct * 100),
      cancelPct: score.cancelPct === null ? null : Math.round(score.cancelPct * 100),
      complaints,
      needsAttention: score.needsAttention,
      reasons: score.reasons,
    })
  }
  rows.sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention) || b.orders - a.orders)
  res.json({ windowDays: 30, items: rows })
}
