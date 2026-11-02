import {
  VENDOR_DOCUMENT_KINDS,
  vendorDecisions,
  vendorStatusLabel,
  type Business,
  type CreateVendorRequest,
  type UpdateVendorRequest,
  type Vendor,
  type VendorDecision,
  type VendorDetail,
  type VendorStatus,
} from "@zoauro/shared"
import { activityFor, type Actor } from "../../lib/audit"
import { checkUpload, toStoredDocument } from "../../lib/documents"
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { deleteObject, getObject, putObject } from "../../lib/storage"
import * as repo from "./vendors.repository"

type Scope = { businesses: Business[]; zoneIds: string[] | null }

const zoneName = (z: { city: string; location: string }) => `${z.location}, ${z.city}`

export function toDto(v: repo.VendorRow, s?: repo.OrderStats): Vendor {
  const responsibleAdmin = v.zone.members.find((entry) =>
    entry.member.businesses.some(({ business }) => business === v.business),
  )?.member
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
    responsibleAdminId: responsibleAdmin?.id ?? null,
    responsibleAdminName: responsibleAdmin?.name ?? null,
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
  const [stats, activity, bank] = await Promise.all([
    repo.orderStats([v.id]),
    activityFor(prisma, { type: "vendor", id: v.id }),
    repo.bankAccount(v.id),
  ])
  return {
    ...toDto(v, stats.get(v.id)),
    category: v.category,
    launchPreference: (v.launchPreference as VendorDetail["launchPreference"]) ?? null,
    ownerPhone: v.ownerPhone,
    panMasked: v.pan ? `${v.pan.slice(0, 5)}••••${v.pan.slice(-1)}` : null,
    pinCode: v.pinCode,
    settlementCycle: (v.settlementCycle as VendorDetail["settlementCycle"]) ?? null,
    bank: bank && {
      holderName: bank.holderName,
      bankName: bank.bankName,
      last4: bank.last4,
      ifsc: bank.ifsc,
      upiId: bank.upiId,
      verified: bank.verified,
    },
    gstin: v.gstin,
    fssai: v.fssai,
    decisionReason: v.decisionReason,
    decidedAt: v.decidedAt?.toISOString() ?? null,
    documents: v.documents.map(toStoredDocument),
    activity,
    updatedAt: v.updatedAt.toISOString(),
  }
}

export async function list(
  filter: repo.VendorFilter,
  page: number,
  pageSize: number,
  sort?: repo.VendorSort,
) {
  const { items, total } = await repo.list(filter, page, pageSize, sort)
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
  const { commissionPct, bank, ...rest } = input
  const v = await repo.create(
    {
      ...rest,
      gstin: rest.gstin ?? null,
      fssai: rest.fssai ?? null,
      category: rest.category ?? null,
      launchPreference: rest.launchPreference ?? null,
      ownerPhone: rest.ownerPhone ?? null,
      pan: rest.pan ?? null,
      pinCode: rest.pinCode ?? null,
      settlementCycle: rest.settlementCycle ?? null,
      commissionBps: Math.round(commissionPct * 100),
    },
    // Only the last four digits are kept; the full number goes to the payout provider.
    bank && {
      holderName: bank.holderName,
      bankName: bank.bankName,
      ifsc: bank.ifsc,
      upiId: bank.upiId ?? null,
      last4: bank.accountNumber.slice(-4),
    },
    actor,
  )
  return toDetail(v)
}

/** Super Admin edits from the vendor drawer, with an updatedAt check (409 if stale). */
export async function update(id: string, scope: Scope, input: UpdateVendorRequest, actor: Actor) {
  const v = await loadInScope(id, scope)
  const current = {
    name: v.name,
    ownerName: v.ownerName,
    phone: v.phone,
    email: v.email,
    address: v.address,
    zoneId: v.zoneId,
    gstin: v.gstin ?? undefined,
    fssai: v.fssai ?? undefined,
    commissionPct: v.commissionBps / 100,
    category: v.category ?? undefined,
    launchPreference: v.launchPreference ?? undefined,
    ownerPhone: v.ownerPhone ?? undefined,
    pinCode: v.pinCode ?? undefined,
    settlementCycle: v.settlementCycle ?? undefined,
  }
  const keys = Object.keys(current) as (keyof typeof current)[]
  const changed = keys.filter((k) => input[k] !== undefined && input[k] !== current[k])
  if (!changed.length) return toDetail(v)
  if (changed.includes("zoneId")) {
    if (scope.zoneIds && !scope.zoneIds.includes(input.zoneId!))
      throw forbidden("That service area isn't one of yours.")
    const zone = await prisma.zone.findUnique({ where: { id: input.zoneId! } })
    if (!zone?.active) throw badRequest("Choose an active service area.", { zoneId: ["Unknown"] })
  }
  const data: Record<string, unknown> = {}
  for (const k of changed)
    if (k === "commissionPct") data.commissionBps = Math.round(input.commissionPct! * 100)
    else data[k] = input[k]
  const updated = await repo.update(
    v,
    new Date(input.updatedAt),
    data,
    changed,
    input.reason,
    actor,
  )
  if (!updated) throw conflict("This vendor was updated by someone else. Reload to see the latest.")
  return toDetail(updated)
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

// ---- documents ----

export async function uploadDocument(
  id: string,
  scope: Scope,
  kind: string,
  upload: { body: unknown; contentType: string | undefined; fileName: string | undefined },
  actor: Actor,
) {
  if (!(VENDOR_DOCUMENT_KINDS as readonly string[]).includes(kind))
    throw badRequest("Unknown document type.", { kind: ["Unknown"] })
  const v = await loadInScope(id, scope)
  const file = checkUpload(upload.body, upload.contentType, upload.fileName, kind)
  const s3Key = `vendors/${v.code}/${kind}-${Date.now()}.${file.ext}`
  await putObject(s3Key, file.buffer, file.contentType)
  const { doc, oldKeys } = await repo.replaceDocument(
    v,
    {
      kind,
      s3Key,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.buffer.length,
    },
    actor,
  )
  // Old files are only removed once the new record is saved.
  await Promise.allSettled(oldKeys.map((k) => deleteObject(k)))
  return toStoredDocument(doc)
}

export async function documentFile(id: string, documentId: string, scope: Scope) {
  const v = await loadInScope(id, scope)
  const doc = await repo.findDocument(v.id, documentId)
  if (!doc) throw notFound("Document")
  const body = await getObject(doc.s3Key)
  if (!body) throw notFound("Stored file")
  return {
    body,
    fileName: doc.fileName,
    contentType: doc.contentType ?? "application/octet-stream",
  }
}

export async function verifyDocument(
  id: string,
  documentId: string,
  scope: Scope,
  verified: boolean,
  actor: Actor,
) {
  const v = await loadInScope(id, scope)
  const doc = await repo.findDocument(v.id, documentId)
  if (!doc) throw notFound("Document")
  return toStoredDocument(await repo.setDocumentVerified(v, doc, verified, actor))
}
