import {
  vendorDecisions,
  vendorStatusLabel,
  type Business,
  type CreateVendorRequest,
  type Vendor,
  type VendorDecision,
  type VendorDetail,
  type VendorStatus,
} from "@zoauro/shared"
import { activityFor, type Actor } from "../../lib/audit"
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import * as repo from "./vendors.repository"

type Scope = { businesses: Business[]; zoneIds: string[] | null }

const zoneName = (z: { city: string; location: string }) => `${z.location}, ${z.city}`

export function toDto(v: repo.VendorRow, s?: repo.OrderStats): Vendor {
  return {
    id: v.id,
    code: v.code,
    business: v.business,
    name: v.name,
    ownerName: v.ownerName,
    phone: v.phone,
    email: v.email,
    address: v.address,
    zoneId: v.zoneId,
    zoneName: zoneName(v.zone),
    status: v.status,
    verification: v.verification,
    commissionPct: v.commissionBps / 100,
    salesPaise: s?.salesPaise ?? 0,
    ordersCount: s?.ordersCount ?? 0,
    openOrders: s?.openOrders ?? 0,
    createdAt: v.createdAt.toISOString(),
  }
}

async function toDetail(v: repo.VendorDetailRow): Promise<VendorDetail> {
  const [stats, activity] = await Promise.all([
    repo.orderStats([v.id]),
    activityFor(prisma, { type: "vendor", id: v.id }),
  ])
  return {
    ...toDto(v, stats.get(v.id)),
    gstin: v.gstin,
    fssai: v.fssai,
    decisionReason: v.decisionReason,
    decidedAt: v.decidedAt?.toISOString() ?? null,
    documents: v.documents.map((d) => ({
      kind: d.kind,
      fileName: d.fileName,
      uploadedAt: d.uploadedAt.toISOString(),
      verified: Boolean(d.verifiedAt),
    })),
    activity,
  }
}

export async function list(filter: repo.VendorFilter, page: number, pageSize: number) {
  const { items, total } = await repo.list(filter, page, pageSize)
  const stats = await repo.orderStats(items.map((v) => v.id))
  return { items: items.map((v) => toDto(v, stats.get(v.id))), total, page }
}

export const summary = (scope: Scope) => repo.summary(scope)

// Out-of-scope vendors answer 404, as orders do, so ids from other zones can't be probed.
async function loadInScope(id: string, scope: Scope) {
  const v = await repo.findById(id)
  if (
    !v ||
    !scope.businesses.includes(v.business) ||
    (scope.zoneIds && !scope.zoneIds.includes(v.zoneId))
  )
    throw notFound("Vendor")
  return v
}

export async function get(id: string, scope: Scope) {
  return toDetail(await loadInScope(id, scope))
}

export async function create(input: CreateVendorRequest, scope: Scope, actor: Actor) {
  if (!scope.businesses.includes(input.business))
    throw forbidden("You don't have access to that business.")
  if (scope.zoneIds && !scope.zoneIds.includes(input.zoneId))
    throw forbidden("That service area isn't one of yours.")
  if (input.business === "food" && !input.fssai)
    throw badRequest("Restaurants need an FSSAI licence number.", { fssai: ["Required"] })
  const zone = await prisma.zone.findUnique({ where: { id: input.zoneId } })
  if (!zone?.active) throw badRequest("Choose an active service area.", { zoneId: ["Unknown"] })
  const { commissionPct, gstin, fssai, ...rest } = input
  const v = await repo.create(
    {
      ...rest,
      gstin: gstin ?? null,
      fssai: fssai ?? null,
      commissionBps: Math.round(commissionPct * 100),
    },
    actor,
  )
  return toDetail(v)
}

const outcome: Record<
  VendorDecision,
  { status: VendorStatus; verification?: "verified" | "rejected"; action: string }
> = {
  approve: { status: "active", verification: "verified", action: "vendor.approved" },
  reject: { status: "rejected", verification: "rejected", action: "vendor.rejected" },
  suspend: { status: "suspended", action: "vendor.suspended" },
  reactivate: { status: "active", action: "vendor.reactivated" },
}

export async function decide(
  id: string,
  scope: Scope,
  input: { decision: VendorDecision; reason?: string | undefined },
  actor: Actor,
) {
  const v = await loadInScope(id, scope)
  const o = outcome[input.decision]
  if (!vendorDecisions[v.status].includes(input.decision))
    throw badRequest(
      `A vendor that is “${vendorStatusLabel[v.status]}” can't be ${o.action.split(".")[1]}.`,
    )
  if ((input.decision === "reject" || input.decision === "suspend") && !input.reason)
    throw badRequest("Give a reason.", { reason: ["Required"] })
  const updated = await repo.decide(v, o, o.action, actor, input.reason)
  if (!updated) throw conflict("This vendor was updated by someone else. Reload to see the latest.")
  return toDetail(updated)
}
