import {
  partnerDecisions,
  partnerStatusLabel,
  type Business,
  type CreatePartnerRequest,
  type Partner,
  type PartnerAvailability,
  type PartnerDecision,
  type PartnerDetail,
  type PartnerStatus,
  type UpdatePartnerRequest,
} from "@zoauro/shared"
import { PartnerPlan } from "@zoauro/shared"
import { activityFor, type Actor } from "../../lib/audit"
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import * as repo from "./partners.repository"

type Scope = { businesses: Business[]; zoneIds: string[] | null }

const isoDate = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null

export function toDto(p: repo.PartnerRow, currentOrderCode: string | null = null): Partner {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    phone: p.phone,
    businesses: p.businesses.map((b) => b.business),
    zoneId: p.zoneId,
    zoneName: `${p.zone.location}, ${p.zone.city}`,
    vehicleType: p.vehicleType,
    vehicleNumber: p.vehicleNumber,
    status: p.status,
    availability: p.availability,
    kycVerified: p.kycVerified,
    bankVerified: p.bankVerified,
    rating: p.ratingTenths === null ? null : p.ratingTenths / 10,
    deliveriesCompleted: p.deliveriesCompleted,
    currentOrderCode,
    managedByAdminId: p.managedByAdminId,
    createdAt: p.createdAt.toISOString(),
  }
}

async function toDetail(p: repo.PartnerDetailRow): Promise<PartnerDetail> {
  const [current, bank, names, activity, delivered, plan] = await Promise.all([
    repo.currentOrders([p.id]),
    repo.bankAccount(p.id),
    repo.memberNames([p.submittedById, p.decidedById]),
    activityFor(prisma, { type: "partner", id: p.id }),
    repo.deliveredStats(p.id),
    repo.currentPayPlan(p.id),
  ])
  const payPlan = plan ? PartnerPlan.safeParse(plan.plan) : null
  return {
    ...toDto(p, current.get(p.id) ?? null),
    email: p.email,
    dateOfBirth: isoDate(p.dateOfBirth),
    gender: p.gender,
    address: p.address,
    pinCode: p.pinCode,
    district: p.zone.district,
    vehicleModel: p.vehicleModel,
    drivingLicence: p.drivingLicence,
    licenceValidUntil: isoDate(p.licenceValidUntil),
    bank: bank && {
      holderName: bank.holderName,
      bankName: bank.bankName,
      last4: bank.last4,
      ifsc: bank.ifsc,
      verified: bank.verified,
    },
    managerName: p.manager?.name ?? null,
    submittedByName: (p.submittedById && names.get(p.submittedById)) || null,
    decisionReason: p.decisionReason,
    decidedByName: (p.decidedById && names.get(p.decidedById)) || null,
    decidedAt: p.decidedAt?.toISOString() ?? null,
    documents: p.documents.map((d) => ({
      kind: d.kind,
      fileName: d.fileName,
      uploadedAt: d.uploadedAt.toISOString(),
      verified: Boolean(d.verifiedAt),
    })),
    activity,
    ...delivered,
    payPlan: payPlan?.success ? payPlan.data : null,
    payPlanFrom: plan?.effectiveFrom.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
  }
}

export async function list(
  filter: repo.PartnerFilter,
  page: number,
  pageSize: number,
  sort?: repo.PartnerSort,
) {
  const { items, total } = await repo.list(filter, page, pageSize, sort)
  const current = await repo.currentOrders(items.map((p) => p.id))
  return { items: items.map((p) => toDto(p, current.get(p.id) ?? null)), total, page }
}

export const summary = (scope: Scope) => repo.summary(scope)

// Out of scope answers 404 so ids from other zones or businesses can't be probed.
async function loadInScope(id: string, scope: Scope) {
  const p = await repo.findById(id)
  if (
    !p ||
    !p.businesses.some((b) => scope.businesses.includes(b.business)) ||
    (scope.zoneIds && !scope.zoneIds.includes(p.zoneId))
  )
    throw notFound("Delivery partner")
  return p
}

export async function get(id: string, scope: Scope) {
  return toDetail(await loadInScope(id, scope))
}

const day = (iso: string | undefined) => (iso ? new Date(`${iso}T00:00:00Z`) : null)

/** Admins submit applications; nobody is active until a Super Admin approves. */
export async function create(input: CreatePartnerRequest, scope: Scope, actor: Actor) {
  const outside = input.businesses.find((b) => !scope.businesses.includes(b))
  if (outside) throw forbidden("You can only add partners to your own businesses.")
  if (scope.zoneIds && !scope.zoneIds.includes(input.zoneId))
    throw forbidden("That service area isn't one of yours.")
  const zone = await prisma.zone.findUnique({ where: { id: input.zoneId } })
  if (!zone?.active) throw badRequest("Choose an active service area.", { zoneId: ["Unknown"] })
  if (await repo.findByPhone(input.phone))
    throw badRequest("A partner with this mobile number already exists.", {
      phone: ["Already registered"],
    })

  const { businesses, bank, dateOfBirth, licenceValidUntil, ...rest } = input
  const p = await repo.create(
    {
      ...rest,
      email: rest.email ?? null,
      gender: rest.gender ?? null,
      address: rest.address ?? null,
      pinCode: rest.pinCode ?? null,
      vehicleModel: rest.vehicleModel ?? null,
      dateOfBirth: day(dateOfBirth),
      licenceValidUntil: day(licenceValidUntil),
      status: "pending_approval",
      submittedById: actor.id,
      // An admin who onboards a partner manages them; Super Admins assign one later.
      managedByAdminId: scope.zoneIds ? actor.id : null,
    },
    businesses,
    // Only the last four digits are kept; the full number goes to the payout provider.
    bank && {
      holderName: bank.holderName,
      bankName: bank.bankName,
      ifsc: bank.ifsc,
      last4: bank.accountNumber.slice(-4),
    },
    actor,
  )
  return toDetail(p)
}

const EDITABLE = [
  "name",
  "phone",
  "email",
  "dateOfBirth",
  "gender",
  "address",
  "pinCode",
  "zoneId",
  "vehicleType",
  "vehicleNumber",
  "vehicleModel",
  "drivingLicence",
  "licenceValidUntil",
] as const

/** Super Admin edits from the profile drawer, with an updatedAt check (409 if stale). */
export async function update(id: string, scope: Scope, input: UpdatePartnerRequest, actor: Actor) {
  const p = await loadInScope(id, scope)
  const current: Record<(typeof EDITABLE)[number], string | null> = {
    name: p.name,
    phone: p.phone,
    email: p.email,
    dateOfBirth: isoDate(p.dateOfBirth),
    gender: p.gender,
    address: p.address,
    pinCode: p.pinCode,
    zoneId: p.zoneId,
    vehicleType: p.vehicleType,
    vehicleNumber: p.vehicleNumber,
    vehicleModel: p.vehicleModel,
    drivingLicence: p.drivingLicence,
    licenceValidUntil: isoDate(p.licenceValidUntil),
  }
  const changed = EDITABLE.filter((k) => input[k] !== undefined && input[k] !== current[k])
  const was = p.businesses.map((b) => b.business).sort()
  const businesses =
    input.businesses && [...new Set(input.businesses)].sort().join() !== was.join()
      ? [...new Set(input.businesses)]
      : undefined
  if (!changed.length && !businesses) return toDetail(p)

  if (businesses?.some((b) => !scope.businesses.includes(b)))
    throw forbidden("You can only assign businesses you have access to.")
  if (changed.includes("zoneId")) {
    if (scope.zoneIds && !scope.zoneIds.includes(input.zoneId!))
      throw forbidden("That service area isn't one of yours.")
    const zone = await prisma.zone.findUnique({ where: { id: input.zoneId! } })
    if (!zone?.active) throw badRequest("Choose an active service area.", { zoneId: ["Unknown"] })
  }
  if (changed.includes("phone") && (await repo.findByPhone(input.phone!)))
    throw badRequest("A partner with this mobile number already exists.", {
      phone: ["Already registered"],
    })

  const data: Record<string, unknown> = {}
  for (const k of changed)
    data[k] = k === "dateOfBirth" || k === "licenceValidUntil" ? day(input[k]) : input[k]
  const updated = await repo.update(
    p,
    new Date(input.updatedAt),
    data,
    businesses,
    [...changed, ...(businesses ? ["businesses"] : [])],
    actor,
  )
  if (!updated)
    throw conflict("This partner was updated by someone else. Reload to see the latest.")
  return toDetail(updated)
}

const outcome: Record<
  PartnerDecision,
  {
    data: { status: PartnerStatus; kycVerified?: boolean; availability?: PartnerAvailability }
    action: string
  }
> = {
  approve: { data: { status: "active", kycVerified: true }, action: "partner.approved" },
  reject: { data: { status: "rejected" }, action: "partner.rejected" },
  suspend: { data: { status: "suspended", availability: "offline" }, action: "partner.suspended" },
  reactivate: { data: { status: "active" }, action: "partner.reactivated" },
}

export async function decide(
  id: string,
  scope: Scope,
  input: { decision: PartnerDecision; reason?: string | undefined },
  actor: Actor,
) {
  const p = await loadInScope(id, scope)
  const o = outcome[input.decision]
  if (!partnerDecisions[p.status].includes(input.decision))
    throw badRequest(
      `A partner that is “${partnerStatusLabel[p.status]}” can't be ${o.action.split(".")[1]}.`,
    )
  if ((input.decision === "reject" || input.decision === "suspend") && !input.reason)
    throw badRequest("Give a reason.", { reason: ["Required"] })
  const updated = await repo.decide(p, o.data, o.action, actor, input.reason)
  if (!updated)
    throw conflict("This partner was updated by someone else. Reload to see the latest.")
  return toDetail(updated)
}
