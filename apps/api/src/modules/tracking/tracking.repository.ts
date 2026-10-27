// Latest positions live in Redis (one key per partner plus a "last seen" sorted set for
// the stale sweep); the trail goes to Postgres.
import type { Business, OrderStatus, PartnerAvailability, TrackedLocation } from "@zoauro/shared"
import type { Prisma } from "../../generated/prisma/client"
import { audit, type Actor } from "../../lib/audit"
import { conflict } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"

const LOC_TTL_SECONDS = 24 * 60 * 60
const locKey = (partnerId: string) => `track:loc:${partnerId}`
const SEEN = "track:seen"

export const CARRYING: OrderStatus[] = ["assigned", "picked_up", "out_for_delivery"]

const partnerSelect = {
  id: true,
  code: true,
  name: true,
  phone: true,
  status: true,
  zoneId: true,
  vehicleType: true,
  vehicleNumber: true,
  availability: true,
  zone: { select: { city: true, location: true } },
  businesses: { select: { business: true } },
} satisfies Prisma.PartnerSelect

export type TrackedRow = Prisma.PartnerGetPayload<{ select: typeof partnerSelect }>

export const findByCode = (code: string) =>
  prisma.partner.findUnique({ where: { code }, select: partnerSelect })

export const findById = (id: string) =>
  prisma.partner.findUnique({ where: { id }, select: partnerSelect })

/** Approved partners in scope, for the map. */
export function listApproved(f: {
  businesses: Business[]
  zoneIds: string[] | null
  zoneId?: string | undefined
}) {
  return prisma.partner.findMany({
    where: {
      status: "active",
      businesses: { some: { business: { in: f.businesses } } },
      ...(f.zoneIds && { zoneId: { in: f.zoneIds } }),
      ...(f.zoneId && { zoneId: f.zoneId }),
    },
    select: partnerSelect,
    orderBy: { name: "asc" },
  })
}

export function zones(zoneIds: string[] | null) {
  return prisma.zone.findMany({
    where: { active: true, ...(zoneIds && { id: { in: zoneIds } }) },
    select: { id: true, district: true, city: true, location: true, lat: true, lng: true },
    orderBy: [{ district: "asc" }, { city: "asc" }, { location: "asc" }],
  })
}

export const activeZoneIds = async () =>
  (await prisma.zone.findMany({ where: { active: true }, select: { id: true } })).map((z) => z.id)

// ---- latest location (Redis) ----

export async function saveLatest(partnerId: string, loc: TrackedLocation) {
  await redis
    .multi()
    .set(locKey(partnerId), JSON.stringify(loc), "EX", LOC_TTL_SECONDS)
    .zadd(SEEN, new Date(loc.at).getTime(), partnerId)
    .exec()
}

export async function latest(partnerIds: string[]): Promise<Map<string, TrackedLocation>> {
  if (!partnerIds.length) return new Map()
  const raw = await redis.mget(...partnerIds.map(locKey))
  const out = new Map<string, TrackedLocation>()
  raw.forEach((r, i) => r && out.set(partnerIds[i]!, JSON.parse(r) as TrackedLocation))

  // Redis is a cache: after a flush or restart, fall back to the last saved fix.
  const missing = partnerIds.filter((id) => !out.has(id))
  if (missing.length) {
    const rows = await prisma.partnerLocation.findMany({
      where: { partnerId: { in: missing } },
      orderBy: [{ partnerId: "asc" }, { at: "desc" }],
      distinct: ["partnerId"],
    })
    for (const r of rows)
      out.set(r.partnerId, {
        lat: r.lat,
        lng: r.lng,
        speedKmh: r.speedKmh,
        heading: r.heading,
        at: r.at.toISOString(),
      })
  }
  return out
}

/** Partners whose last ping is older than `before` (ms). */
export const staleSince = (before: number) => redis.zrangebyscore(SEEN, 0, before)
export const forgetSeen = (partnerId: string) => redis.zrem(SEEN, partnerId)

// ---- history (Postgres) ----

export const appendHistory = (partnerId: string, loc: TrackedLocation) =>
  prisma.partnerLocation.create({
    data: {
      partnerId,
      lat: loc.lat,
      lng: loc.lng,
      speedKmh: loc.speedKmh,
      heading: loc.heading,
      at: new Date(loc.at),
    },
  })

export const trail = (partnerId: string, since: Date) =>
  prisma.partnerLocation.findMany({
    where: { partnerId, at: { gte: since } },
    orderBy: { at: "asc" },
    select: { lat: true, lng: true, at: true },
    take: 2000,
  })

// ---- orders and availability ----

/** The newest order each partner is carrying. */
export async function carrying(partnerIds: string[]) {
  const orders = await prisma.order.findMany({
    where: { partnerId: { in: partnerIds }, status: { in: CARRYING } },
    orderBy: { placedAt: "desc" },
    select: { id: true, code: true, business: true, status: true, partnerId: true },
  })
  const out = new Map<string, (typeof orders)[number]>()
  for (const o of orders) if (o.partnerId && !out.has(o.partnerId)) out.set(o.partnerId, o)
  return out
}

export const setAvailability = (partnerId: string, availability: PartnerAvailability) =>
  prisma.partner.update({ where: { id: partnerId }, data: { availability }, select: partnerSelect })

/** A Super Admin or Admin changing availability by hand; audited with the reason. */
export function overrideAvailability(
  partner: { id: string; code: string; availability: PartnerAvailability },
  to: PartnerAvailability,
  reason: string,
  actor: Actor,
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.partner.updateMany({
      where: { id: partner.id, availability: partner.availability },
      data: { availability: to },
    })
    if (count === 0) throw conflict("This partner's availability just changed. Reload and retry.")
    await audit(
      tx,
      actor,
      "partner.availability_changed",
      { type: "partner", id: partner.id },
      { code: partner.code, from: partner.availability, to, reason },
    )
    return tx.partner.findUniqueOrThrow({ where: { id: partner.id }, select: partnerSelect })
  })
}

export const findOrder = (code: string) =>
  prisma.order.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      business: true,
      status: true,
      version: true,
      zoneId: true,
      partnerId: true,
    },
  })

/** Attaches a partner to a ready order (ready → assigned) with the order's version check. */
export function assignOrder(
  order: { id: string; code: string; version: number },
  partnerId: string,
  actor: Actor,
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, version: order.version, status: "ready", partnerId: null },
      data: { status: "assigned", partnerId, version: { increment: 1 } },
    })
    if (count === 0) throw conflict("This order was taken or changed. Reload to see the latest.")
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        from: "ready",
        to: "assigned",
        actorType: "partner",
        actorId: partnerId,
      },
    })
    await audit(tx, actor, "order.assigned", { type: "order", id: order.id }, { code: order.code })
  })
}
