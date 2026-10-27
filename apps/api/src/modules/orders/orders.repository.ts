import type { Business, OrderStatus } from "@zoauro/shared"
import type { Prisma } from "../../generated/prisma/client"
import { audit, type Actor } from "../../lib/audit"
import { conflict } from "../../lib/errors"
import { prisma } from "../../lib/prisma"

const withNames = {
  vendor: { select: { name: true } },
  partner: { select: { name: true } },
  items: true,
} satisfies Prisma.OrderInclude

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof withNames }>

export type OrderFilter = {
  businesses: Business[]
  zoneIds: string[] | null
  status?: OrderStatus | undefined
  search?: string | undefined
  partnerId?: string | undefined
}

function where(f: OrderFilter): Prisma.OrderWhereInput {
  return {
    business: { in: f.businesses },
    ...(f.zoneIds && { zoneId: { in: f.zoneIds } }),
    ...(f.status && { status: f.status }),
    ...(f.partnerId && { partnerId: f.partnerId }),
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
      const [total, open] = await prisma.$transaction([
        prisma.order.count({ where: w }),
        prisma.order.count({ where: { ...w, status: { in: OPEN } } }),
      ])
      return { business, total, open }
    }),
  )
}

export const findById = (id: string) =>
  prisma.order.findUnique({ where: { id }, include: withNames })

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
