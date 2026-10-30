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

const withNames = {
  vendor: { select: { name: true } },
  partner: { select: { name: true } },
  items: true,
  // The latest reason on the order (cancellation, refund request, …) for list views.
  events: {
    where: { reason: { not: null } },
    orderBy: { at: "desc" },
    take: 1,
    select: { reason: true, at: true },
  },
} satisfies Prisma.OrderInclude

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof withNames }>

export type OrderFilter = {
  businesses: Business[]
  zoneIds: string[] | null
  status?: OrderStatus | undefined
  search?: string | undefined
  partnerId?: string | undefined
  vendorId?: string | undefined
  delayed?: boolean | undefined
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

function where(f: OrderFilter): Prisma.OrderWhereInput {
  return {
    business: { in: f.businesses },
    ...(f.zoneIds && { zoneId: { in: f.zoneIds } }),
    ...(f.status && { status: f.status }),
    ...(f.partnerId && { partnerId: f.partnerId }),
    ...(f.vendorId && { vendorId: f.vendorId }),
    ...(f.delayed && { AND: [delayedWhere()] }),
    ...(f.search && {
      OR: [
        { code: { contains: f.search, mode: "insensitive" } },
        { customerName: { contains: f.search, mode: "insensitive" } },
        { vendor: { name: { contains: f.search, mode: "insensitive" } } },
      ],
    }),
  }
}

export async function list(f: OrderFilter, page: number, pageSize: number) {
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where: where(f),
      include: withNames,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where: where(f) }),
  ])
  return { items, total }
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

export const findDetail = (id: string) =>
  prisma.order.findUnique({
    where: { id },
    include: { ...withNames, events: { orderBy: { at: "asc" } } },
  })

/** Display names for event actors: members and partners. */
export async function actorNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>()
  const [members, partners] = await Promise.all([
    prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.partner.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ])
  return new Map([...members, ...partners].map((x) => [x.id, x.name]))
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
  order: { id: string; code: string; status: OrderStatus },
  version: number,
  to: OrderStatus,
  actor: Actor,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, version },
      data: { status: to, version: { increment: 1 } },
    })
    if (count === 0)
      throw conflict("This order was updated by someone else. Reload to see the latest.")
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
