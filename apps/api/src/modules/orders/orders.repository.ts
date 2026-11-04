import {
  FULFILMENT_STATUSES,
  ORDER_SLA_MINUTES,
  type Business,
  type OrderStatus,
} from "@zoauro/shared"
import type { Prisma } from "../../generated/prisma/client"
import { audit, type Actor } from "../../lib/audit"
import { conflict } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { recordCodCollection } from "../rider-ops/cod"

const withNames = {
  vendor: { select: { name: true } },
  partner: { select: { name: true } },
  deliveryFleet: { select: { name: true } },
  deliveryBoy: { select: { name: true } },
  zone: {
    select: {
      districtId: true,
      city: true,
      location: true,
      districtRecord: { select: { name: true } },
      members: {
        where: {
          member: { status: "active", role: "admin" },
        },
        orderBy: [{ member: { createdAt: "asc" } }, { member: { id: "asc" } }],
        select: {
          member: {
            select: {
              id: true,
              name: true,
              businesses: { select: { business: true } },
            },
          },
        },
      },
    },
  },
  items: true,
  events: {
    where: { reason: { not: null } },
    orderBy: { at: "desc" },
    take: 1,
    select: { reason: true, at: true },
  },
  deliveryAssignments: {
    orderBy: { assignedAt: "desc" },
    take: 10,
    include: {
      fleet: { select: { name: true } },
      boy: { select: { name: true } },
    },
  },
} satisfies Prisma.OrderInclude

export { withNames }

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof withNames }>

export type OrderFilter = {
  businesses: Business[]
  zoneIds: string[] | null
  status?: OrderStatus | undefined
  search?: string | undefined
  districtId?: string | undefined
  zoneId?: string | undefined
  adminId?: string | undefined
  deliveryFleetId?: string | undefined
  deliveryPartnerId?: string | undefined
  deliveryBoyId?: string | undefined
  partnerId?: string | undefined
  vendorId?: string | undefined
  delayed?: boolean | undefined
  fromDate?: string | undefined
  toDate?: string | undefined
}

type AdminAssignment = { id: string; name: string }
type AdminAssignments = {
  byBusinessZone: Map<string, AdminAssignment>
  zoneIds: string[]
}

const assignmentKey = (business: Business, zoneId: string) => `${business}:${zoneId}`

async function adminAssignments(
  businesses: Business[],
  zoneIds: string[] | null,
): Promise<AdminAssignments> {
  const [members, zones] = await Promise.all([
    prisma.member.findMany({
      where: {
        role: "admin",
        status: "active",
        businesses: { some: { business: { in: businesses } } },
        ...(zoneIds !== null && { zones: { some: { zoneId: { in: zoneIds } } } }),
      },
      select: {
        id: true,
        name: true,
        businesses: { select: { business: true } },
        zones: { select: { zoneId: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.zone.findMany({
      where: zoneIds === null ? {} : { id: { in: zoneIds } },
      select: { id: true },
    }),
  ])
  const byBusinessZone = new Map<string, AdminAssignment>()
  for (const member of members) {
    for (const { business } of member.businesses) {
      if (!businesses.includes(business)) continue
      for (const { zoneId } of member.zones) {
        if (zoneIds !== null && !zoneIds.includes(zoneId)) continue
        const key = assignmentKey(business, zoneId)
        if (!byBusinessZone.has(key)) byBusinessZone.set(key, { id: member.id, name: member.name })
      }
    }
  }
  return { byBusinessZone, zoneIds: zones.map((zone) => zone.id) }
}

/** Still being fulfilled after the business's time limit. */
export function delayedWhere(now = Date.now()): Prisma.OrderWhereInput {
  return {
    status: { in: [...FULFILMENT_STATUSES] },
    OR: (["food", "mart"] as const).map((business) => ({
      business,
      placedAt: { lt: new Date(now - ORDER_SLA_MINUTES[business] * 60_000) },
    })),
  }
}

function where(f: OrderFilter, assignments?: AdminAssignments): Prisma.OrderWhereInput {
  const filters: Prisma.OrderWhereInput[] = []
  if (f.status) filters.push({ status: f.status })
  if (f.districtId) filters.push({ zone: { is: { districtId: f.districtId } } })
  if (f.zoneId) filters.push({ zoneId: f.zoneId })
  if (f.adminId && assignments) {
    const zonesByBusiness = f.businesses.map((business) => ({
      business,
      zoneIds: assignments.zoneIds.filter((zoneId) => {
        const assigned = assignments.byBusinessZone.get(assignmentKey(business, zoneId))
        return f.adminId === "unassigned" ? !assigned : assigned?.id === f.adminId
      }),
    }))
    const assigned = zonesByBusiness
      .filter(({ zoneIds }) => zoneIds.length > 0)
      .map(({ business, zoneIds }) => ({ business, zoneId: { in: zoneIds } }))
    filters.push(assigned.length ? { OR: assigned } : { id: { in: [] } })
  }
  if (f.deliveryPartnerId === "unassigned") filters.push({ partnerId: null })
  else if (f.deliveryPartnerId) filters.push({ partnerId: f.deliveryPartnerId })
  if (f.deliveryFleetId) filters.push({ deliveryFleetId: f.deliveryFleetId })
  if (f.deliveryBoyId) filters.push({ deliveryBoyId: f.deliveryBoyId })
  if (f.partnerId) filters.push({ partnerId: f.partnerId })
  if (f.vendorId) filters.push({ vendorId: f.vendorId })
  if (f.delayed) filters.push(delayedWhere())
  if (f.search)
    filters.push({
      OR: [
        { code: { contains: f.search, mode: "insensitive" } },
        { customerName: { contains: f.search, mode: "insensitive" } },
        { vendor: { name: { contains: f.search, mode: "insensitive" } } },
      ],
    })
  if (f.fromDate || f.toDate) {
    const placedAt: Prisma.DateTimeFilter = {}
    if (f.fromDate) placedAt.gte = new Date(`${f.fromDate}T00:00:00.000Z`)
    if (f.toDate) {
      const end = new Date(`${f.toDate}T00:00:00.000Z`)
      end.setUTCDate(end.getUTCDate() + 1)
      placedAt.lt = end
    }
    filters.push({ placedAt })
  }
  return {
    business: { in: f.businesses },
    ...(f.zoneIds && { zoneId: { in: f.zoneIds } }),
    ...(filters.length > 0 && { AND: filters }),
  }
}

export async function list(f: OrderFilter, page: number, pageSize: number) {
  const assignments = f.adminId ? await adminAssignments(f.businesses, f.zoneIds) : undefined
  const orderWhere = where(f, assignments)
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where: orderWhere,
      include: withNames,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where: orderWhere }),
  ])
  return { items, total }
}

export async function filterOptions(f: Pick<OrderFilter, "businesses" | "zoneIds">) {
  const assignments = await adminAssignments(f.businesses, f.zoneIds)
  const admins = [
    ...new Map([...assignments.byBusinessZone.values()].map((admin) => [admin.id, admin])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name))
  const deliveryPartners = await prisma.partner.findMany({
    where: {
      orders: {
        some: {
          business: { in: f.businesses },
          ...(f.zoneIds !== null && { zoneId: { in: f.zoneIds } }),
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
  return { admins, deliveryPartners }
}

const OPEN: OrderStatus[] = [
  "placed",
  "accepted",
  "preparing",
  "packed",
  "ready",
  "assigned",
  "picked_up",
  "out_for_delivery",
  "refund_requested",
]

/** Total and still-open orders per business, within the member's zones. */
export function summary(f: Pick<OrderFilter, "businesses" | "zoneIds">) {
  return Promise.all(
    f.businesses.map(async (business) => {
      const w = where({ ...f, businesses: [business] })
      const [total, open, delayed] = await prisma.$transaction([
        prisma.order.count({ where: w }),
        prisma.order.count({ where: { ...w, status: { in: OPEN } } }),
        prisma.order.count({ where: { AND: [w, delayedWhere()] } }),
      ])
      return { business, total, open, delayed }
    }),
  )
}

export const findById = (id: string) =>
  prisma.order.findUnique({ where: { id }, include: withNames })

export const countActiveAssignments = (boyId: string) =>
  prisma.deliveryAssignment.count({ where: { boyId, endedAt: null } })

export const findDetail = (id: string) =>
  prisma.order.findUnique({
    where: { id },
    include: {
      ...withNames,
      events: { orderBy: { at: "asc" } },
      deliveryAssignments: {
        orderBy: { assignedAt: "desc" },
        include: {
          fleet: { select: { name: true } },
          boy: { select: { name: true } },
        },
      },
    },
  })

/** Display names for event actors: members and partners. */
export async function actorNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>()
  const [members, partners] = await Promise.all([
    prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.partner.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ])
  const fleets = await prisma.deliveryFleet.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  })
  return new Map([...members, ...partners, ...fleets].map((x) => [x.id, x.name]))
}

/** Approved partners for the order's business and area who are on shift. */
export function candidatePartners(business: Business, zoneId: string) {
  return prisma.partner.findMany({
    where: {
      status: "active",
      zoneId,
      availability: { not: "offline" },
      businesses: { some: { business } },
    },
    select: {
      id: true,
      code: true,
      name: true,
      availability: true,
      vehicleType: true,
      _count: {
        select: {
          orders: { where: { status: { in: ["assigned", "picked_up", "out_for_delivery"] } } },
        },
      },
    },
    orderBy: [{ availability: "asc" }, { name: "asc" }],
  })
}

/**
 * Gives a ready order to a partner, or moves an assigned one to another partner, with
 * the version check. Writes the event, audit entry and outbox event together.
 */
export function assignPartner(
  order: { id: string; code: string; status: OrderStatus; partnerId: string | null },
  version: number,
  partner: { id: string; name: string },
  actor: Actor,
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, version, status: { in: ["ready", "assigned"] } },
      data: { status: "assigned", partnerId: partner.id, version: { increment: 1 } },
    })
    if (count === 0)
      throw conflict("This order was updated by someone else. Reload to see the latest.")
    const reassigned = order.status === "assigned"
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        from: order.status,
        to: "assigned",
        actorType: "member",
        actorId: actor.id,
        reason: reassigned ? `Reassigned to ${partner.name}` : `Assigned to ${partner.name}`,
      },
    })
    await audit(
      tx,
      actor,
      "order.assigned",
      { type: "order", id: order.id },
      { code: order.code, partnerId: partner.id, previousPartnerId: order.partnerId },
    )
    await tx.outboxEvent.create({
      data: {
        topic: "order.assigned",
        payload: { orderId: order.id, code: order.code, partnerId: partner.id },
      },
    })
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: withNames })
  })
}

/**
 * Moves an order to a new status only if nobody changed it since `version`.
 * Writes the event, the audit entry and an outbox event in the same transaction.
 */
export function changeStatus(
  order: { id: string; code: string; status: OrderStatus; deliveryBoyId: string | null },
  version: number,
  to: OrderStatus,
  actor: Actor,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, version },
      data: {
        status: to,
        version: { increment: 1 },
        ...(to === "ready" && order.deliveryBoyId
          ? { deliveryFleetId: null, deliveryBoyId: null }
          : {}),
      },
    })
    if (count === 0)
      throw conflict("This order was updated by someone else. Reload to see the latest.")
    if (to === "delivered") await recordCodCollection(tx, order.id)
    if (order.deliveryBoyId && ["cancelled", "delivered", "ready"].includes(to)) {
      await tx.deliveryAssignment.updateMany({
        where: { orderId: order.id, boyId: order.deliveryBoyId, endedAt: null },
        data: {
          status: to === "delivered" ? "completed" : "cancelled",
          endedAt: new Date(),
        },
      })
      const boy = await tx.deliveryBoy.findUnique({
        where: { id: order.deliveryBoyId },
        select: { maxActiveOrders: true },
      })
      if (boy) {
        const remaining = await tx.deliveryAssignment.count({
          where: { boyId: order.deliveryBoyId, endedAt: null },
        })
        await tx.deliveryBoy.updateMany({
          where: { id: order.deliveryBoyId, status: "active" },
          data: {
            availability: remaining < boy.maxActiveOrders ? "available" : "on_delivery",
            version: { increment: 1 },
          },
        })
      }
    }
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        from: order.status,
        to,
        actorType: "member",
        actorId: actor.id,
        reason: reason ?? null,
      },
    })
    await audit(
      tx,
      actor,
      "order.status_changed",
      { type: "order", id: order.id },
      {
        code: order.code,
        from: order.status,
        to,
        ...(reason && { reason }),
      },
    )
    await tx.outboxEvent.create({
      data: {
        topic: "order.status_changed",
        payload: { orderId: order.id, code: order.code, from: order.status, to },
      },
    })
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: withNames })
  })
}
