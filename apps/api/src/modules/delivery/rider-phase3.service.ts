// Phase 3 rider operations: shifts, earnings statements, profile changes, verification status
// and analytics. Admins see riders in their zones; Super Admins see everyone.
import {
  DeliveryBoyDocumentKind,
  type EarningsQuery,
  type EarningsStatement,
  type RiderAnalytics,
  type RiderAnalyticsQuery,
  type RiderProfileChangeDecision,
  type RiderProfileChangePage,
  type RiderProfileChangeQuery,
  type RiderProfileChangeRequest,
  type RiderShiftPage,
  type RiderShiftQuery,
  type RiderShiftRow,
  type RiderVerificationStatus,
} from "@zoauro/shared"
import { audit, type Actor } from "../../lib/audit"
import { badRequest, forbidden, notFound } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import type { MemberContext } from "../../middleware/auth"

const IST = "+05:30"
const MINUTE = 60_000

/** Riders in scope for this member: their zone, or every zone for a Super Admin. */
const riderScope = (member: MemberContext) =>
  member.role === "super_admin" ? {} : { zoneId: { in: member.zoneIds } }

const zoneLabel = (zone: { location: string; district: string }) =>
  `${zone.location}, ${zone.district}`

const dayStart = (day: string) => new Date(`${day}T00:00:00.000${IST}`)
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999${IST}`)
const istDay = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at)

// Shifts -----------------------------------------------------------------------------------------

export async function startShift(boyId: string) {
  const boy = await prisma.deliveryBoy.findUniqueOrThrow({
    where: { id: boyId },
    select: { status: true },
  })
  if (boy.status !== "active") throw forbidden("Only an active rider can start a shift.")
  const open = await prisma.riderShift.findFirst({ where: { boyId, endedAt: null } })
  if (open) return open
  return prisma.riderShift.create({ data: { boyId } })
}

export async function endShift(boyId: string) {
  const result = await prisma.riderShift.updateMany({
    where: { boyId, endedAt: null },
    data: { endedAt: new Date() },
  })
  return { ended: result.count }
}

export async function myShifts(boyId: string) {
  const [current, recent] = await Promise.all([
    prisma.riderShift.findFirst({ where: { boyId, endedAt: null } }),
    prisma.riderShift.findMany({
      where: { boyId },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
  ])
  return {
    current: current ? { id: current.id, startedAt: current.startedAt.toISOString() } : null,
    recent: recent.map((s) => ({
      id: s.id,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      minutes: Math.round(((s.endedAt ?? new Date()).getTime() - s.startedAt.getTime()) / MINUTE),
    })),
  }
}

const shiftRow = (shift: {
  id: string
  startedAt: Date
  endedAt: Date | null
  endedById: string | null
  boy: { id: string; code: string; name: string; zone: { location: string; district: string } }
}): RiderShiftRow => ({
  id: shift.id,
  riderId: shift.boy.id,
  riderCode: shift.boy.code,
  riderName: shift.boy.name,
  zoneName: zoneLabel(shift.boy.zone),
  startedAt: shift.startedAt.toISOString(),
  endedAt: shift.endedAt?.toISOString() ?? null,
  minutes: Math.round(
    ((shift.endedAt ?? new Date()).getTime() - shift.startedAt.getTime()) / MINUTE,
  ),
  endedByAdmin: !!shift.endedById,
})

export async function listShifts(
  member: MemberContext,
  query: RiderShiftQuery,
): Promise<RiderShiftPage> {
  const where = {
    boy: riderScope(member),
    ...(query.status === "open" && { endedAt: null }),
    ...(query.status === "closed" && { endedAt: { not: null } }),
  }
  const [total, rows] = await Promise.all([
    prisma.riderShift.count({ where }),
    prisma.riderShift.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        boy: {
          select: {
            id: true,
            code: true,
            name: true,
            zone: { select: { location: true, district: true } },
          },
        },
      },
    }),
  ])
  return {
    items: rows.map(shiftRow),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
}

export async function forceEndShift(member: MemberContext, shiftId: string, actor: Actor) {
  const shift = await prisma.riderShift.findUnique({
    where: { id: shiftId },
    include: { boy: { select: { id: true, zoneId: true } } },
  })
  if (!shift) throw notFound("Shift")
  if (member.role !== "super_admin" && !member.zoneIds.includes(shift.boy.zoneId)) throw forbidden()
  if (shift.endedAt) throw badRequest("This shift has already ended.")
  await prisma.$transaction(async (tx) => {
    await tx.riderShift.update({
      where: { id: shiftId },
      data: { endedAt: new Date(), endedById: member.id },
    })
    await audit(
      tx,
      actor,
      "rider.shift_ended",
      { type: "delivery_boy", id: shift.boy.id },
      {
        shiftId,
      },
    )
  })
}

// Earnings statements -----------------------------------------------------------------------------

export async function earningsStatement(
  member: MemberContext,
  query: EarningsQuery,
): Promise<EarningsStatement & { rows: Record<string, unknown>[] }> {
  const from = dayStart(query.from)
  const to = dayEnd(query.to)
  const scope = riderScope(member)
  if (query.zoneId && member.role !== "super_admin" && !member.zoneIds.includes(query.zoneId)) {
    throw forbidden()
  }
  // The zone filter narrows the scope; it never widens it.
  const zoneFilter = query.zoneId
    ? { zoneId: query.zoneId }
    : member.role === "super_admin"
      ? {}
      : { zoneId: { in: member.zoneIds } }
  const boyZoneFilter = query.zoneId ? { zoneId: query.zoneId } : scope

  const [delivered, shifts] = await Promise.all([
    prisma.orderEvent.findMany({
      where: {
        to: "delivered",
        at: { gte: from, lte: to },
        order: { ...zoneFilter, deliveryBoyId: { not: null } },
      },
      select: {
        order: {
          select: {
            deliveryBoyId: true,
            deliveryFeePaise: true,
            deliveryBoy: {
              select: {
                id: true,
                code: true,
                name: true,
                zone: { select: { location: true, district: true } },
              },
            },
          },
        },
      },
    }),
    prisma.riderShift.findMany({
      where: {
        startedAt: { lte: to },
        OR: [{ endedAt: null }, { endedAt: { gte: from } }],
        boy: boyZoneFilter,
      },
      select: {
        startedAt: true,
        endedAt: true,
        boy: {
          select: {
            id: true,
            code: true,
            name: true,
            zone: { select: { location: true, district: true } },
          },
        },
      },
    }),
  ])

  const byRider = new Map<string, EarningsStatement["items"][number]>()
  const rowFor = (boy: {
    id: string
    code: string
    name: string
    zone: { location: string; district: string }
  }) => {
    const existing = byRider.get(boy.id)
    if (existing) return existing
    const row = {
      riderId: boy.id,
      riderCode: boy.code,
      riderName: boy.name,
      zoneName: zoneLabel(boy.zone),
      deliveries: 0,
      feePaise: 0,
      shiftMinutes: 0,
    }
    byRider.set(boy.id, row)
    return row
  }

  for (const event of delivered) {
    const order = event.order
    if (!order.deliveryBoy) continue
    const row = rowFor(order.deliveryBoy)
    row.deliveries += 1
    row.feePaise += order.deliveryFeePaise
  }
  const now = new Date()
  for (const shift of shifts) {
    const row = rowFor(shift.boy)
    const start = Math.max(shift.startedAt.getTime(), from.getTime())
    const end = Math.min((shift.endedAt ?? now).getTime(), to.getTime())
    if (end > start) row.shiftMinutes += Math.round((end - start) / MINUTE)
  }

  const items = [...byRider.values()].sort(
    (a, b) => b.feePaise - a.feePaise || a.riderCode.localeCompare(b.riderCode),
  )
  const totals = items.reduce(
    (sum, row) => ({
      deliveries: sum.deliveries + row.deliveries,
      feePaise: sum.feePaise + row.feePaise,
      shiftMinutes: sum.shiftMinutes + row.shiftMinutes,
    }),
    { deliveries: 0, feePaise: 0, shiftMinutes: 0 },
  )
  return {
    from: query.from,
    to: query.to,
    totals,
    items,
    rows: items as unknown as Record<string, unknown>[],
  }
}

// Profile changes ---------------------------------------------------------------------------------

const dateFields = new Set(["licenceValidUntil", "registrationValidUntil"])
const changeFields = [
  "email",
  "address",
  "vehicleModel",
  "vehicleNumber",
  "drivingLicence",
  "licenceValidUntil",
  "registrationValidUntil",
] as const

/** Keeps only the fields the rider filled in, as stored JSON. */
const cleanChanges = (input: RiderProfileChangeRequest) =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))

export async function requestProfileChange(boyId: string, input: RiderProfileChangeRequest) {
  const pending = await prisma.riderProfileChange.findFirst({ where: { boyId, status: "pending" } })
  if (pending) throw badRequest("You already have a change waiting for approval.")
  const row = await prisma.riderProfileChange.create({
    data: { boyId, changes: cleanChanges(input) },
  })
  return { id: row.id, status: row.status, requestedAt: row.requestedAt.toISOString() }
}

export async function myProfileChanges(boyId: string) {
  const rows = await prisma.riderProfileChange.findMany({
    where: { boyId },
    orderBy: { requestedAt: "desc" },
    take: 20,
    select: { id: true, status: true, requestedAt: true, decidedAt: true, reason: true },
  })
  return rows.map((row) => ({
    ...row,
    requestedAt: row.requestedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }))
}

const formatValue = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

export async function listProfileChanges(
  member: MemberContext,
  query: RiderProfileChangeQuery,
): Promise<RiderProfileChangePage> {
  const where = {
    boy: riderScope(member),
    ...(query.status && { status: query.status }),
  }
  const [total, rows] = await Promise.all([
    prisma.riderProfileChange.count({ where }),
    prisma.riderProfileChange.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        boy: {
          select: {
            id: true,
            code: true,
            name: true,
            email: true,
            address: true,
            vehicleModel: true,
            vehicleNumber: true,
            drivingLicence: true,
            licenceValidUntil: true,
            registrationValidUntil: true,
            zone: { select: { location: true, district: true } },
          },
        },
      },
    }),
  ])

  return {
    total,
    page: query.page,
    pageSize: query.pageSize,
    items: rows.map((row) => {
      const changes = row.changes as Record<string, string>
      const current = row.boy as unknown as Record<string, unknown>
      return {
        id: row.id,
        riderId: row.boy.id,
        riderCode: row.boy.code,
        riderName: row.boy.name,
        zoneName: zoneLabel(row.boy.zone),
        status: row.status,
        requestedAt: row.requestedAt.toISOString(),
        decidedAt: row.decidedAt?.toISOString() ?? null,
        reason: row.reason,
        lines: changeFields
          .filter((field) => changes[field] !== undefined)
          .map((field) => ({
            field,
            from: formatValue(current[field]),
            to: formatValue(changes[field]),
          })),
      }
    }),
  }
}

export async function decideProfileChange(
  member: MemberContext,
  id: string,
  approve: boolean,
  decision: RiderProfileChangeDecision,
  actor: Actor,
) {
  const change = await prisma.riderProfileChange.findUnique({
    where: { id },
    include: { boy: { select: { id: true, zoneId: true, name: true } } },
  })
  if (!change) throw notFound("Profile change")
  if (member.role !== "super_admin" && !member.zoneIds.includes(change.boy.zoneId))
    throw forbidden()
  if (change.status !== "pending") throw badRequest("This request has already been decided.")
  if (!approve && !decision.reason) throw badRequest("Give a reason for rejecting this change.")

  const changes = change.changes as Record<string, string>
  const data = Object.fromEntries(
    changeFields
      .filter((field) => changes[field] !== undefined)
      .map((field) => [
        field,
        dateFields.has(field) ? new Date(`${changes[field]}T00:00:00.000Z`) : changes[field],
      ]),
  )
  const action = approve ? "rider.profile_change_approved" : "rider.profile_change_rejected"
  const title = approve ? "Your details were updated" : "Your change request was not approved"
  const body = approve
    ? "The details you asked to change are now saved on your profile."
    : `Reason: ${decision.reason}`

  await prisma.$transaction(async (tx) => {
    const current = await tx.deliveryBoy.findUniqueOrThrow({ where: { id: change.boyId } })
    const historyChanges = Object.fromEntries(
      changeFields
        .filter((field) => changes[field] !== undefined)
        .map((field) => [
          field,
          {
            from: formatValue((current as unknown as Record<string, unknown>)[field]),
            to: formatValue(changes[field]),
          },
        ]),
    )
    if (approve) await tx.deliveryBoy.update({ where: { id: change.boyId }, data })
    await tx.riderProfileChange.update({
      where: { id },
      data: {
        status: approve ? "approved" : "rejected",
        decidedAt: new Date(),
        decidedById: member.id,
        reason: decision.reason ?? null,
      },
    })
    await tx.deliveryHistory.create({
      data: {
        boyId: change.boyId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: member.role,
        action,
        reason: decision.reason ?? null,
        changes: historyChanges,
      },
    })
    await tx.deliveryBoyNotification.create({ data: { boyId: change.boyId, title, body } })
    await audit(tx, actor, action, { type: "delivery_boy", id: change.boyId }, { changeId: id })
  })
}

// Verification status (rider app) ----------------------------------------------------------------

export async function riderVerification(boyId: string): Promise<RiderVerificationStatus> {
  const boy = await prisma.deliveryBoy.findUniqueOrThrow({
    where: { id: boyId },
    select: {
      status: true,
      documents: { select: { kind: true, uploadedAt: true, verifiedAt: true } },
      reviews: {
        orderBy: { at: "desc" },
        take: 1,
        select: { decision: true, reason: true, at: true },
      },
    },
  })
  const uploaded = new Set(boy.documents.map((doc) => doc.kind))
  const latest = boy.reviews[0]
  return {
    status: boy.status,
    documents: boy.documents.map((doc) => ({
      kind: doc.kind,
      uploadedAt: doc.uploadedAt.toISOString(),
      verifiedAt: doc.verifiedAt?.toISOString() ?? null,
    })),
    missingDocuments: DeliveryBoyDocumentKind.options.filter((kind) => !uploaded.has(kind)),
    latestReview: latest
      ? { decision: latest.decision, reason: latest.reason, at: latest.at.toISOString() }
      : null,
  }
}

// Analytics --------------------------------------------------------------------------------------

export async function riderAnalytics(
  member: MemberContext,
  query: RiderAnalyticsQuery,
): Promise<RiderAnalytics> {
  const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000)
  const zones = await prisma.zone.findMany({
    where: member.role === "super_admin" ? {} : { id: { in: member.zoneIds } },
    select: { id: true, location: true, district: true },
    orderBy: [{ district: "asc" }, { location: "asc" }],
  })
  const zoneIds = zones.map((zone) => zone.id)
  const zoneName = new Map(zones.map((zone) => [zone.id, zoneLabel(zone)]))

  const [riders, deliveredEvents, offers, cod] = await Promise.all([
    prisma.deliveryBoy.groupBy({
      by: ["zoneId"],
      where: { status: "active", zoneId: { in: zoneIds } },
      _count: { _all: true },
    }),
    prisma.orderEvent.findMany({
      where: { to: "delivered", at: { gte: since }, order: { zoneId: { in: zoneIds } } },
      select: { at: true, order: { select: { zoneId: true } } },
    }),
    prisma.deliveryOffer.findMany({
      where: { offeredAt: { gte: since }, order: { zoneId: { in: zoneIds } } },
      select: { status: true, order: { select: { zoneId: true } } },
    }),
    prisma.codCollection.findMany({
      where: { status: "collected" },
      select: { orderId: true, amountPaise: true },
    }),
  ])

  const codOrders = await prisma.order.findMany({
    where: { id: { in: cod.map((row) => row.orderId) }, zoneId: { in: zoneIds } },
    select: { id: true, zoneId: true },
  })
  const codZone = new Map(codOrders.map((order) => [order.id, order.zoneId]))

  const stats = new Map(
    zones.map((zone) => [
      zone.id,
      {
        activeRiders: 0,
        deliveries: 0,
        offersSent: 0,
        offersAccepted: 0,
        offersExpired: 0,
        codOutstandingPaise: 0,
      },
    ]),
  )
  for (const row of riders) stats.get(row.zoneId)!.activeRiders = row._count._all
  for (const event of deliveredEvents) stats.get(event.order.zoneId)!.deliveries += 1
  for (const offer of offers) {
    const stat = stats.get(offer.order.zoneId)!
    stat.offersSent += 1
    if (offer.status === "accepted") stat.offersAccepted += 1
    if (offer.status === "expired") stat.offersExpired += 1
  }
  for (const row of cod) {
    const zoneId = codZone.get(row.orderId)
    if (zoneId) stats.get(zoneId)!.codOutstandingPaise += row.amountPaise
  }

  const daily = new Map<string, number>()
  for (const event of deliveredEvents) {
    const day = istDay(event.at)
    daily.set(day, (daily.get(day) ?? 0) + 1)
  }

  const zoneRows = zones.map((zone) => {
    const stat = stats.get(zone.id)!
    return {
      zoneId: zone.id,
      zoneName: zoneName.get(zone.id)!,
      ...stat,
      acceptanceRate:
        stat.offersSent > 0 ? Math.round((stat.offersAccepted * 100) / stat.offersSent) : null,
    }
  })
  const sum = (pick: (row: (typeof zoneRows)[number]) => number) =>
    zoneRows.reduce((total, row) => total + pick(row), 0)

  return {
    days: query.days,
    totals: {
      deliveries: sum((row) => row.deliveries),
      offersSent: sum((row) => row.offersSent),
      offersAccepted: sum((row) => row.offersAccepted),
      codOutstandingPaise: sum((row) => row.codOutstandingPaise),
    },
    zones: zoneRows,
    daily: [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, deliveries]) => ({ date, deliveries })),
  }
}
