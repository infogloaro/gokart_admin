import type { Business, OrderStatus, VendorStatus } from "@zoauro/shared"
import type { Prisma } from "../../generated/prisma/client"
import { audit, type Actor } from "../../lib/audit"
import { prisma } from "../../lib/prisma"

const withZone = {
  zone: { select: { city: true, location: true } },
} satisfies Prisma.VendorInclude

const withDetail = {
  ...withZone,
  documents: { orderBy: { uploadedAt: "desc" } },
} satisfies Prisma.VendorInclude

export type VendorRow = Prisma.VendorGetPayload<{ include: typeof withZone }>
export type VendorDetailRow = Prisma.VendorGetPayload<{ include: typeof withDetail }>

export type VendorFilter = {
  businesses: Business[]
  zoneIds: string[] | null
  status?: VendorStatus | undefined
  search?: string | undefined
}

function where(f: VendorFilter): Prisma.VendorWhereInput {
  return {
    business: { in: f.businesses },
    ...(f.zoneIds && { zoneId: { in: f.zoneIds } }),
    ...(f.status && { status: f.status }),
    ...(f.search && {
      OR: [
        { code: { contains: f.search, mode: "insensitive" } },
        { name: { contains: f.search, mode: "insensitive" } },
        { ownerName: { contains: f.search, mode: "insensitive" } },
      ],
    }),
  }
}

export type VendorSort = "newest" | "orders"

const orderBy = {
  newest: [{ code: "desc" }],
  orders: [{ orders: { _count: "desc" } }, { code: "desc" }],
} satisfies Record<VendorSort, Prisma.VendorOrderByWithRelationInput[]>

export async function list(
  f: VendorFilter,
  page: number,
  pageSize: number,
  sort: VendorSort = "newest",
) {
  const [items, total] = await prisma.$transaction([
    prisma.vendor.findMany({
      where: where(f),
      include: withZone,
      orderBy: orderBy[sort],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vendor.count({ where: where(f) }),
  ])
  return { items, total }
}

const CLOSED: OrderStatus[] = ["delivered", "cancelled", "refunded"]

export type OrderStats = { salesPaise: number; ordersCount: number; openOrders: number }

/** Sales (delivered orders), order count and open orders for each vendor. */
export async function orderStats(vendorIds: string[]): Promise<Map<string, OrderStats>> {
  const groups = await prisma.order.groupBy({
    by: ["vendorId", "status"],
    where: { vendorId: { in: vendorIds } },
    _count: { _all: true },
    _sum: { totalPaise: true },
  })
  const stats = new Map<string, OrderStats>()
  for (const g of groups) {
    const s = stats.get(g.vendorId) ?? { salesPaise: 0, ordersCount: 0, openOrders: 0 }
    s.ordersCount += g._count._all
    if (g.status === "delivered") s.salesPaise += g._sum.totalPaise ?? 0
    if (!CLOSED.includes(g.status)) s.openOrders += g._count._all
    stats.set(g.vendorId, s)
  }
  return stats
}

/** Vendor counts by status for each business, within the member's zones. */
export function summary(f: Pick<VendorFilter, "businesses" | "zoneIds">) {
  return Promise.all(
    f.businesses.map(async (business) => {
      const w = where({ ...f, businesses: [business] })
      const [total, active, pending, suspended, rejected] = await prisma.$transaction([
        prisma.vendor.count({ where: w }),
        prisma.vendor.count({ where: { ...w, status: "active" } }),
        prisma.vendor.count({ where: { ...w, status: "pending_review" } }),
        prisma.vendor.count({ where: { ...w, status: "suspended" } }),
        prisma.vendor.count({ where: { ...w, status: "rejected" } }),
      ])
      return { business, total, active, pending, suspended, rejected }
    }),
  )
}

export const findById = (id: string) =>
  prisma.vendor.findUnique({ where: { id }, include: withDetail })

/** Next code after the highest VEN-#### in use. */
async function nextCode(tx: Prisma.TransactionClient) {
  const last = await tx.vendor.findFirst({
    where: { code: { startsWith: "VEN-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  })
  const n = last ? Number(last.code.slice(4)) + 1 : 1001
  return `VEN-${n}`
}

export function create(
  data: Omit<Prisma.VendorUncheckedCreateInput, "code">,
  bank:
    | { holderName: string; bankName: string; ifsc: string; upiId: string | null; last4: string }
    | undefined,
  actor: Actor,
) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.vendor.create({
      data: { ...data, code: await nextCode(tx) },
      include: withDetail,
    })
    if (bank)
      await tx.bankAccount.create({ data: { accountType: "vendor", accountId: v.id, ...bank } })
    await audit(tx, actor, "vendor.created", { type: "vendor", id: v.id }, { code: v.code })
    return v
  })
}

export const bankAccount = (vendorId: string) =>
  prisma.bankAccount.findUnique({
    where: { accountType_accountId: { accountType: "vendor", accountId: vendorId } },
  })

/**
 * Applies a decision only if the vendor is still in the status the caller checked,
 * so two reviewers can't both approve or reject the same application.
 */
export function decide(
  vendor: { id: string; code: string; status: VendorStatus },
  to: { status: VendorStatus; verification?: "verified" | "rejected" },
  action: string,
  actor: Actor,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.vendor.updateMany({
      where: { id: vendor.id, status: vendor.status },
      data: {
        status: to.status,
        ...(to.verification && { verification: to.verification }),
        decisionReason: reason ?? null,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
    })
    if (count === 0) return null
    await audit(
      tx,
      actor,
      action,
      { type: "vendor", id: vendor.id },
      { code: vendor.code, from: vendor.status, to: to.status, ...(reason && { reason }) },
    )
    await tx.outboxEvent.create({
      data: {
        topic: "vendor.status_changed",
        payload: { vendorId: vendor.id, code: vendor.code, from: vendor.status, to: to.status },
      },
    })
    return tx.vendor.findUniqueOrThrow({ where: { id: vendor.id }, include: withDetail })
  })
}

/** Saves profile edits only if the vendor hasn't changed since `updatedAt`; audited. */
export function update(
  vendor: { id: string; code: string },
  updatedAt: Date,
  data: Prisma.VendorUncheckedUpdateManyInput,
  fields: string[],
  actor: Actor,
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.vendor.updateMany({ where: { id: vendor.id, updatedAt }, data })
    if (count === 0) return null
    await audit(
      tx,
      actor,
      "vendor.updated",
      { type: "vendor", id: vendor.id },
      { code: vendor.code, fields },
    )
    return tx.vendor.findUniqueOrThrow({ where: { id: vendor.id }, include: withDetail })
  })
}
