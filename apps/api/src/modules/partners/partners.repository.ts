import type { Business, OrderStatus, PartnerAvailability, PartnerStatus } from "@zoauro/shared"
import type { Prisma } from "../../generated/prisma/client"
import { audit, type Actor } from "../../lib/audit"
import { prisma } from "../../lib/prisma"

const withZone = {
  zone: { select: { district: true, city: true, location: true } },
  businesses: { select: { business: true } },
} satisfies Prisma.PartnerInclude

const withDetail = {
  ...withZone,
  manager: { select: { name: true } },
  documents: { orderBy: { uploadedAt: "desc" } },
} satisfies Prisma.PartnerInclude

export type PartnerRow = Prisma.PartnerGetPayload<{ include: typeof withZone }>
export type PartnerDetailRow = Prisma.PartnerGetPayload<{ include: typeof withDetail }>

export type PartnerFilter = {
  businesses: Business[]
  zoneIds: string[] | null
  status?: PartnerStatus | undefined
  availability?: PartnerAvailability | undefined
  search?: string | undefined
}

function where(f: PartnerFilter): Prisma.PartnerWhereInput {
  return {
    // A partner serving both businesses shows to admins of either.
    businesses: { some: { business: { in: f.businesses } } },
    ...(f.zoneIds && { zoneId: { in: f.zoneIds } }),
    ...(f.status && { status: f.status }),
    ...(f.availability && { availability: f.availability }),
    ...(f.search && {
      OR: [
        { code: { contains: f.search, mode: "insensitive" } },
        { name: { contains: f.search, mode: "insensitive" } },
        { phone: { contains: f.search.replace(/\D/g, "") || f.search } },
      ],
    }),
  }
}

export async function list(f: PartnerFilter, page: number, pageSize: number) {
  const [items, total] = await prisma.$transaction([
    prisma.partner.findMany({
      where: where(f),
      include: withZone,
      // Applications waiting for a decision first, then newest.
      orderBy: [{ status: "asc" }, { code: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.partner.count({ where: where(f) }),
  ])
  return { items, total }
}

const CARRYING: OrderStatus[] = ["assigned", "picked_up", "out_for_delivery"]

/** The newest open order each partner is carrying. */
export async function currentOrders(partnerIds: string[]) {
  const orders = await prisma.order.findMany({
    where: { partnerId: { in: partnerIds }, status: { in: CARRYING } },
    orderBy: { placedAt: "desc" },
    select: { partnerId: true, code: true },
  })
  const byPartner = new Map<string, string>()
  for (const o of orders)
    if (o.partnerId && !byPartner.has(o.partnerId)) byPartner.set(o.partnerId, o.code)
  return byPartner
}

export async function summary(f: Pick<PartnerFilter, "businesses" | "zoneIds">) {
  const w = where(f)
  const approved = { ...w, status: "active" as const }
  const [total, active, pending, suspended, available, onDelivery, offline] =
    await prisma.$transaction([
      prisma.partner.count({ where: w }),
      prisma.partner.count({ where: approved }),
      prisma.partner.count({ where: { ...w, status: "pending_approval" } }),
      prisma.partner.count({ where: { ...w, status: "suspended" } }),
      prisma.partner.count({ where: { ...approved, availability: "available" } }),
      prisma.partner.count({ where: { ...approved, availability: "on_delivery" } }),
      prisma.partner.count({ where: { ...approved, availability: "offline" } }),
    ])
  return { total, active, pending, suspended, available, onDelivery, offline }
}

export const findById = (id: string) =>
  prisma.partner.findUnique({ where: { id }, include: withDetail })

export const findByPhone = (phone: string) =>
  prisma.partner.findUnique({ where: { phone }, select: { id: true } })

export const bankAccount = (partnerId: string) =>
  prisma.bankAccount.findUnique({
    where: { accountType_accountId: { accountType: "partner", accountId: partnerId } },
  })

export async function memberNames(ids: (string | null)[]) {
  const wanted = ids.filter((x): x is string => Boolean(x))
  if (!wanted.length) return new Map<string, string>()
  const rows = await prisma.member.findMany({
    where: { id: { in: wanted } },
    select: { id: true, name: true },
  })
  return new Map(rows.map((r) => [r.id, r.name]))
}

/** Applications are numbered per year: DP-2026-001, DP-2026-002, … */
async function nextCode(tx: Prisma.TransactionClient) {
  const prefix = `DP-${new Date().getFullYear()}-`
  const last = await tx.partner.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  })
  const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1
  return prefix + String(n).padStart(3, "0")
}

export function create(
  data: Omit<Prisma.PartnerUncheckedCreateInput, "code" | "businesses">,
  businesses: Business[],
  bank: { holderName: string; bankName: string; last4: string; ifsc: string } | undefined,
  actor: Actor,
) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.partner.create({
      data: {
        ...data,
        code: await nextCode(tx),
        businesses: { create: businesses.map((business) => ({ business })) },
      },
      include: withDetail,
    })
    if (bank)
      await tx.bankAccount.create({
        data: { accountType: "partner", accountId: p.id, ...bank },
      })
    await audit(tx, actor, "partner.submitted", { type: "partner", id: p.id }, { code: p.code })
    return p
  })
}

/** Applies a decision only if the partner is still in the status the caller checked. */
export function decide(
  partner: { id: string; code: string; status: PartnerStatus },
  data: { status: PartnerStatus; kycVerified?: boolean; availability?: PartnerAvailability },
  action: string,
  actor: Actor,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.partner.updateMany({
      where: { id: partner.id, status: partner.status },
      data: {
        ...data,
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
      { type: "partner", id: partner.id },
      { code: partner.code, from: partner.status, to: data.status, ...(reason && { reason }) },
    )
    await tx.outboxEvent.create({
      data: {
        topic: "partner.status_changed",
        payload: {
          partnerId: partner.id,
          code: partner.code,
          from: partner.status,
          to: data.status,
        },
      },
    })
    return tx.partner.findUniqueOrThrow({ where: { id: partner.id }, include: withDetail })
  })
}
