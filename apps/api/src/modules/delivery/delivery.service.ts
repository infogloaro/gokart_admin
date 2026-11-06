import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import {
  DELIVERY_BOYS_PER_PARTNER,
  DeliveryBoy,
  DeliveryBoyDocumentKind,
  DeliveryFleetOrder,
  DeliveryHistoryEntry,
  canTransition,
  type CreateDeliveryFleetRequest,
  type DeliveryBoyApplicationRequest,
  type DeliveryBoyAssignmentRequest,
  type DeliveryBoyCorrectionRequest,
  type DeliveryBoyListQuery,
  type DeliveryBoyOrderStatusRequest,
  type DeliveryBoyOtpRequest,
  type DeliveryBoyReviewRequest,
  type DeliveryBoySubmissionRequest,
  type DeliveryFleetListQuery,
  type DeliveryFleetReviewRequest,
  type RequestDeliveryFleetRequest,
  type RotateCredentialRequest,
  type AssignFleetZoneRequest,
  type UpdateDeliveryFleetRequest,
} from "@zoauro/shared"
import { z } from "zod"
import { env } from "../../config/env"
import { Prisma } from "../../generated/prisma/client"
import { audit, type Actor } from "../../lib/audit"
import { hashForLookup } from "../../lib/crypto"
import { checkUpload, toStoredDocument } from "../../lib/documents"
import {
  badRequest,
  conflict,
  forbidden,
  HttpError,
  notFound,
  tooMany,
  unauthorized,
} from "../../lib/errors"
import { distanceKm } from "../../lib/geo"
import { issueDeliveryCode } from "../rider-ops/delivery-code"
import { linkFor, notify } from "../../lib/notify"
import { prisma } from "../../lib/prisma"
import { rateLimit } from "../../lib/rate-limit"
import { redis } from "../../lib/redis"
import { sendOtpSms } from "../../lib/sms"
import type { Db } from "../../lib/prisma"
import type { MemberContext } from "../../middleware/auth"
import { deleteObject, getObject, putObject } from "../../lib/storage"
import {
  assertOrderAssignmentEligible,
  nextDeliveryBoyStatus,
  TRANSIT_STATUSES,
} from "./delivery.policy"

type CreateDeliveryFleetInput = z.infer<typeof CreateDeliveryFleetRequest>
type UpdateDeliveryFleetInput = z.infer<typeof UpdateDeliveryFleetRequest>
type DeliveryBoyApplicationInput = z.infer<typeof DeliveryBoyApplicationRequest>
type DeliveryBoyOtpInput = z.infer<typeof DeliveryBoyOtpRequest>
type DeliveryBoyCorrectionInput = z.infer<typeof DeliveryBoyCorrectionRequest>
type DeliveryBoySubmissionInput = z.infer<typeof DeliveryBoySubmissionRequest>
type DeliveryBoyAssignmentInput = z.infer<typeof DeliveryBoyAssignmentRequest>
type DeliveryBoyOrderStatusInput = z.infer<typeof DeliveryBoyOrderStatusRequest>
type DeliveryFleetListQueryInput = z.infer<typeof DeliveryFleetListQuery>
type DeliveryBoyListQueryInput = z.infer<typeof DeliveryBoyListQuery>
type RequestDeliveryFleetInput = z.infer<typeof RequestDeliveryFleetRequest>
type DeliveryFleetReviewInput = z.infer<typeof DeliveryFleetReviewRequest>
type RotateCredentialInput = z.infer<typeof RotateCredentialRequest>
type AssignFleetZoneInput = z.infer<typeof AssignFleetZoneRequest>

const day = (date: string | undefined) => (date ? new Date(`${date}T00:00:00.000Z`) : null)

type Change = { from: unknown; to: unknown }
type HistoryActor = Pick<Actor, "id" | "name" | "role">

/** Dates become ISO strings so they compare and display the same way as request values. */
function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  return value === undefined ? null : value
}

/** Field-by-field before and after values, or null when nothing changed. */
function changesOf(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, Change> | null {
  const changes: Record<string, Change> = {}
  for (const key of Object.keys(after)) {
    const from = comparable(before[key])
    const to = comparable(after[key])
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to }
  }
  return Object.keys(changes).length ? changes : null
}

/** Every change to a partner or delivery boy is stored with who made it and why. */
async function recordHistory(
  tx: Db,
  target: { fleetId?: string; boyId?: string },
  entry: {
    action: string
    actor: HistoryActor
    reason?: string | null
    changes?: Record<string, Change> | null
  },
) {
  await tx.deliveryHistory.create({
    data: {
      fleetId: target.fleetId ?? null,
      boyId: target.boyId ?? null,
      actorId: entry.actor.id,
      actorName: entry.actor.name,
      actorRole: entry.actor.role ?? "system",
      action: entry.action,
      reason: entry.reason ?? null,
      changes: entry.changes ? (entry.changes as Prisma.InputJsonObject) : Prisma.JsonNull,
    },
  })
}

function deliveryBoyData(input: DeliveryBoyApplicationInput) {
  const {
    dateOfBirth,
    gender,
    pinCode,
    drivingLicence,
    licenceValidUntil,
    vehicleModel,
    registrationValidUntil,
    payout,
    email,
    ...profile
  } = input
  return {
    ...profile,
    ...(email !== undefined && { email }),
    ...(dateOfBirth !== undefined && { dateOfBirth: day(dateOfBirth) }),
    ...(gender !== undefined && { gender }),
    ...(pinCode !== undefined && { pinCode }),
    ...(drivingLicence !== undefined && { drivingLicence }),
    ...(licenceValidUntil !== undefined && { licenceValidUntil: day(licenceValidUntil) }),
    ...(registrationValidUntil !== undefined && {
      registrationValidUntil: day(registrationValidUntil),
    }),
    ...(vehicleModel !== undefined && { vehicleModel }),
    ...(payout && {
      payoutHolderName: payout.holderName,
      payoutBankName: payout.bankName || null,
      payoutLast4: payout.accountNumber.slice(-4),
      payoutIfsc: payout.ifsc,
    }),
  }
}

const fleetInclude = {
  district: { select: { name: true } },
  businesses: { select: { business: true } },
  zones: {
    where: { endedAt: null },
    include: { zone: { select: { id: true, city: true, location: true } } },
    orderBy: { assignedAt: "desc" },
  },
  _count: { select: { boys: true } },
} satisfies Prisma.DeliveryFleetInclude

type FleetRow = Prisma.DeliveryFleetGetPayload<{ include: typeof fleetInclude }>

function fleetDto(fleet: FleetRow) {
  return {
    id: fleet.id,
    code: fleet.code,
    name: fleet.name,
    companyName: fleet.companyName,
    contactPerson: fleet.contactPerson,
    phone: fleet.phone,
    email: fleet.email,
    address: fleet.address,
    districtId: fleet.districtId,
    district: fleet.district.name,
    businesses: fleet.businesses.map(({ business }) => business),
    status: fleet.status,
    requestedByName: fleet.requestedByName,
    zones: fleet.zones.map(({ zone }) => ({
      id: zone.id,
      name: `${zone.location}, ${zone.city}`,
    })),
    deliveryBoyCount: fleet._count.boys,
    availableBoyCount: 0,
    createdAt: fleet.createdAt.toISOString(),
  }
}

function fleetWhere(
  q: DeliveryFleetListQueryInput,
  member: MemberContext,
): Prisma.DeliveryFleetWhereInput {
  return {
    // Admins see the partners they asked for; Super Admin sees every partner.
    ...(member.role !== "super_admin" && { requestedById: member.id }),
    ...(q.status && { status: q.status }),
    ...(q.business && { businesses: { some: { business: q.business } } }),
    ...(q.districtId && { districtId: q.districtId }),
    ...(q.zoneId && { zones: { some: { zoneId: q.zoneId, endedAt: null } } }),
    ...(q.search && {
      OR: [
        { code: { contains: q.search, mode: "insensitive" } },
        { name: { contains: q.search, mode: "insensitive" } },
        { companyName: { contains: q.search, mode: "insensitive" } },
        { contactPerson: { contains: q.search, mode: "insensitive" } },
        { phone: { contains: q.search.replace(/\D/g, "") || q.search } },
      ],
    }),
  }
}

export async function listFleets(q: DeliveryFleetListQueryInput, member: MemberContext) {
  const where = fleetWhere(q, member)
  const [rows, total] = await prisma.$transaction([
    prisma.deliveryFleet.findMany({
      where,
      include: fleetInclude,
      orderBy: [{ createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.deliveryFleet.count({ where }),
  ])
  const activeBoys = await prisma.deliveryBoy.groupBy({
    by: ["fleetId"],
    where: {
      fleetId: { in: rows.map((row) => row.id) },
      status: "active",
      availability: "available",
    },
    _count: { _all: true },
  })
  const availableByFleet = new Map(activeBoys.map((row) => [row.fleetId, row._count._all]))
  return {
    items: rows.map((fleet) => ({
      ...fleetDto(fleet),
      availableBoyCount: availableByFleet.get(fleet.id) ?? 0,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  }
}

export async function createFleet(
  input: CreateDeliveryFleetInput,
  actor: Actor,
  issueCredential: () => string,
) {
  const credential = issueCredential()
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const district = await tx.district.findFirst({
          where: { id: input.districtId, active: true },
          select: { id: true },
        })
        if (!district) throw badRequest("Choose an active district.")
        const zones = await tx.zone.findMany({
          where: { id: { in: input.zoneIds }, districtId: district.id, active: true },
          select: { id: true },
        })
        if (zones.length !== input.zoneIds.length)
          throw badRequest("Every selected zone must be active and belong to this district.")
        const created = await tx.deliveryFleet.create({
          data: {
            code: `FLEET-${randomBytes(4).toString("hex").toUpperCase()}`,
            name: input.name,
            companyName: input.companyName || null,
            contactPerson: input.contactPerson,
            phone: input.phone,
            email: input.email ?? null,
            address: input.address,
            districtId: district.id,
            // Super Admin's own partners go live immediately; Admin requests wait in requestFleet.
            status: "active",
            credentialHash: hashForLookup("delivery-fleet", credential),
            credentialIssuedAt: new Date(),
          },
        })
        await tx.deliveryFleetBusiness.createMany({
          data: input.businesses.map((business) => ({ fleetId: created.id, business })),
        })
        await tx.deliveryFleetZone.createMany({
          data: zones.map((zone) => ({
            fleetId: created.id,
            zoneId: zone.id,
            assignedById: actor.id!,
          })),
        })
        const riders = []
        for (const inputBoy of input.deliveryBoys) {
          if (!input.zoneIds.includes(inputBoy.zoneId))
            throw badRequest(
              "Every delivery boy must be assigned to one of the fleet's selected zones.",
            )
          const admins = await assignedReviewAdmins(tx, inputBoy.zoneId)
          if (!admins.length)
            throw conflict(
              "Every rider zone must have an active Admin with partner-management access.",
            )
          const rider = await tx.deliveryBoy.create({
            data: {
              ...deliveryBoyData(inputBoy),
              fleetId: created.id,
              reviewAdminId: admins[0]!.id,
              code: `DB-${randomBytes(5).toString("hex").toUpperCase()}`,
            },
          })
          await tx.deliveryBoyReview.create({
            data: {
              boyId: rider.id,
              fleetId: created.id,
              actorId: actor.id,
              actorName: actor.name,
              actorRole: actor.role ?? "super_admin",
              decision: "submitted",
              from: "pending_admin",
              to: "pending_admin",
            },
          })
          await audit(
            tx,
            actor,
            "delivery_boy.submitted",
            { type: "delivery_boy", id: rider.id },
            {
              code: rider.code,
              fleetId: created.id,
              zoneId: rider.zoneId,
              reviewAdminId: admins[0]!.id,
            },
          )
          const recipients = await tx.member.findMany({
            where: {
              status: "active",
              OR: [{ role: "super_admin" }, { id: admins[0]!.id }],
            },
            select: { id: true, role: true },
          })
          for (const recipient of recipients)
            await notify(
              tx,
              [recipient.id],
              {
                title: "Delivery boy application submitted",
                body: `${rider.name} (${rider.code}) needs review.`,
                link: linkFor(recipient.role, "food", "partners", `boy=${rider.id}`),
              },
              actor.id,
            )
          await tx.outboxEvent.create({
            data: {
              topic: "delivery_boy.submitted",
              payload: { deliveryBoyId: rider.id, fleetId: created.id, zoneId: rider.zoneId },
            },
          })
          riders.push({ id: rider.id, code: rider.code, name: rider.name })
        }
        await audit(
          tx,
          actor,
          "delivery_fleet.created",
          { type: "delivery_fleet", id: created.id },
          {
            code: created.code,
            districtId: district.id,
            zoneIds: input.zoneIds,
            businesses: input.businesses,
            deliveryBoyCount: riders.length,
          },
        )
        await recordHistory(tx, { fleetId: created.id }, { action: "fleet.created", actor })
        return {
          fleet: await tx.deliveryFleet.findUniqueOrThrow({
            where: { id: created.id },
            include: fleetInclude,
          }),
          riders,
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    return { fleet: fleetDto(result.fleet), credential, deliveryBoys: result.riders }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("A fleet, delivery boy, or zone assignment already uses that phone or code.")
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw conflict("Zone assignments changed at the same time. Reload and retry.")
    throw error
  }
}

/** An Admin asks Super Admin to create a delivery partner for their zones. */
export async function requestFleet(
  input: RequestDeliveryFleetInput,
  member: MemberContext,
  actor: Actor,
) {
  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const district = await tx.district.findFirst({
          where: { id: input.districtId, active: true },
          select: { id: true },
        })
        if (!district) throw badRequest("Choose an active district.")
        const zones = await tx.zone.findMany({
          where: { id: { in: input.zoneIds }, districtId: district.id, active: true },
          select: { id: true },
        })
        if (zones.length !== input.zoneIds.length)
          throw badRequest("Every selected zone must be active and belong to this district.")
        if (input.zoneIds.some((zoneId) => !member.zoneIds.includes(zoneId)))
          throw forbidden("You can only request delivery partners for your assigned zones.")
        const occupied = await tx.deliveryFleetZone.findFirst({
          where: { zoneId: { in: input.zoneIds }, endedAt: null },
          include: { zone: { select: { city: true, location: true } } },
        })
        if (occupied)
          throw conflict(
            `${occupied.zone.location}, ${occupied.zone.city} already has a primary delivery partner. Ask Super Admin to replace it first.`,
          )
        const fleet = await tx.deliveryFleet.create({
          data: {
            code: `FLEET-${randomBytes(4).toString("hex").toUpperCase()}`,
            name: input.name,
            companyName: input.companyName || null,
            contactPerson: input.contactPerson,
            phone: input.phone,
            email: input.email ?? null,
            address: input.address,
            districtId: district.id,
            requestedById: actor.id,
            requestedByName: actor.name,
            requestedZoneIds: input.zoneIds,
          },
        })
        await tx.deliveryFleetBusiness.createMany({
          data: input.businesses.map((business) => ({ fleetId: fleet.id, business })),
        })
        await audit(
          tx,
          actor,
          "delivery_fleet.requested",
          { type: "delivery_fleet", id: fleet.id },
          { code: fleet.code, zoneIds: input.zoneIds, businesses: input.businesses },
        )
        await recordHistory(tx, { fleetId: fleet.id }, { action: "fleet.requested", actor })
        const superAdmins = await tx.member.findMany({
          where: { status: "active", role: "super_admin" },
          select: { id: true, role: true },
        })
        for (const recipient of superAdmins)
          await notify(
            tx,
            [recipient.id],
            {
              title: "Delivery partner approval requested",
              body: `${fleet.name} (${fleet.code}) requested by ${actor.name}.`,
              link: linkFor(recipient.role, input.businesses[0]!, "partners", `fleet=${fleet.id}`),
            },
            actor.id,
          )
        await tx.outboxEvent.create({
          data: { topic: "delivery_fleet.requested", payload: { fleetId: fleet.id } },
        })
        return tx.deliveryFleet.findUniqueOrThrow({
          where: { id: fleet.id },
          include: fleetInclude,
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    return fleetDto(created)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("A delivery partner already uses that phone number.")
    throw error
  }
}

/** Super Admin's final decision on an Admin's partner request. Approval activates the zones and issues a credential. */
export async function reviewFleet(
  id: string,
  input: DeliveryFleetReviewInput,
  actor: Actor,
  issueCredential: () => string,
) {
  const result = await prisma.$transaction(
    async (tx) => {
      const fleet = await tx.deliveryFleet.findUnique({
        where: { id },
        include: { businesses: { select: { business: true } } },
      })
      if (!fleet) throw notFound("Delivery partner")
      if (fleet.status !== "pending_approval")
        throw conflict("Only partner requests waiting for approval can be decided.")
      let credential: string | null = null
      if (input.decision === "approved") {
        const zones = await tx.zone.findMany({
          where: { id: { in: fleet.requestedZoneIds }, active: true, districtId: fleet.districtId },
          select: { id: true },
        })
        if (zones.length !== fleet.requestedZoneIds.length)
          throw conflict("A requested zone is no longer active in this district.")
        const occupied = await tx.deliveryFleetZone.findFirst({
          where: { zoneId: { in: fleet.requestedZoneIds }, endedAt: null },
          include: { zone: { select: { city: true, location: true } } },
        })
        if (occupied)
          throw conflict(
            `${occupied.zone.location}, ${occupied.zone.city} now has a primary delivery partner. Replace it from the zone assignment first.`,
          )
        credential = issueCredential()
        await tx.deliveryFleetZone.createMany({
          data: fleet.requestedZoneIds.map((zoneId) => ({
            fleetId: id,
            zoneId,
            assignedById: actor.id!,
            notes: input.reason,
          })),
        })
      }
      const next = input.decision === "approved" ? "active" : "rejected"
      await tx.deliveryFleet.update({
        where: { id },
        data: {
          status: next,
          ...(credential && {
            credentialHash: hashForLookup("delivery-fleet", credential),
            credentialIssuedAt: new Date(),
          }),
        },
      })
      await audit(
        tx,
        actor,
        `delivery_fleet.${input.decision}`,
        { type: "delivery_fleet", id },
        { code: fleet.code, reason: input.reason },
      )
      await recordHistory(
        tx,
        { fleetId: id },
        {
          action: `fleet.${input.decision}`,
          actor,
          reason: input.reason,
          changes: { status: { from: fleet.status, to: next } },
        },
      )
      if (fleet.requestedById) {
        const admin = await tx.member.findUnique({
          where: { id: fleet.requestedById },
          select: { id: true, role: true, status: true },
        })
        if (admin?.status === "active")
          await notify(
            tx,
            [admin.id],
            {
              title: `Delivery partner ${input.decision}`,
              body: `${fleet.name} (${fleet.code}) — ${input.reason}`,
              link: linkFor(
                admin.role,
                fleet.businesses[0]!.business,
                "partners",
                `search=${encodeURIComponent(fleet.code)}`,
              ),
            },
            actor.id,
          )
      }
      await tx.outboxEvent.create({
        data: {
          topic: `delivery_fleet.${input.decision}`,
          payload: { fleetId: id, code: fleet.code, status: next },
        },
      })
      return {
        fleet: await tx.deliveryFleet.findUniqueOrThrow({ where: { id }, include: fleetInclude }),
        credential,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
  return { fleet: fleetDto(result.fleet), credential: result.credential }
}

export async function updateFleet(id: string, input: UpdateDeliveryFleetInput, actor: Actor) {
  const fleet = await prisma.deliveryFleet.findUnique({
    where: { id },
    include: { businesses: { select: { business: true } } },
  })
  if (!fleet) throw notFound("Delivery partner")
  const { businesses, reason, ...profile } = input
  const fields = (
    ["name", "companyName", "contactPerson", "phone", "email", "address", "status"] as const
  ).filter((key) => profile[key] !== fleet[key])
  const previousBusinesses = fleet.businesses.map(({ business }) => business)
  const businessesChanged = [...businesses].sort().join() !== [...previousBusinesses].sort().join()
  if (fleet.status === "pending_approval" || fleet.status === "rejected")
    throw conflict("Approve this delivery partner before editing it.")
  const before = {
    ...fleet,
    businesses: [...previousBusinesses].sort().join(", "),
  }
  const after = {
    ...profile,
    companyName: profile.companyName || null,
    email: profile.email || null,
    businesses: [...businesses].sort().join(", "),
  }
  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        if (fleet.status === "active" && profile.status === "suspended") {
          const busy = await tx.deliveryAssignment.count({
            where: { fleetId: id, endedAt: null },
          })
          if (busy)
            throw conflict("This partner has active deliveries. Complete or reassign them first.")
        }
        if (businessesChanged) {
          const incompatibleAssignments = await tx.deliveryAssignment.count({
            where: {
              fleetId: id,
              endedAt: null,
              order: { business: { notIn: businesses } },
            },
          })
          if (incompatibleAssignments)
            throw conflict(
              "Finish or reassign this partner's active deliveries before changing its businesses.",
            )
        }
        await tx.deliveryFleet.update({
          where: { id },
          data: {
            ...profile,
            companyName: profile.companyName || null,
            email: profile.email || null,
          },
        })
        if (businessesChanged) {
          await tx.deliveryFleetBusiness.deleteMany({ where: { fleetId: id } })
          await tx.deliveryFleetBusiness.createMany({
            data: businesses.map((business) => ({ fleetId: id, business })),
          })
        }
        await audit(
          tx,
          actor,
          "delivery_fleet.updated",
          { type: "delivery_fleet", id },
          {
            code: fleet.code,
            fields: [...fields, ...(businessesChanged ? ["businesses"] : [])],
            reason,
          },
        )
        await recordHistory(
          tx,
          { fleetId: id },
          { action: "fleet.updated", actor, reason, changes: changesOf(before, after) },
        )
        return tx.deliveryFleet.findUniqueOrThrow({ where: { id }, include: fleetInclude })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    return fleetDto(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("That phone number is already in use.")
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw conflict("Fleet details changed at the same time. Reload and retry.")
    throw error
  }
}

export async function rotateCredential(
  id: string,
  input: RotateCredentialInput,
  actor: Actor,
  issueCredential: () => string,
) {
  const credential = issueCredential()
  const fleet = await prisma.deliveryFleet.findUnique({ where: { id } })
  if (!fleet) throw notFound("Delivery partner")
  const hash = hashForLookup("delivery-fleet", credential)
  await prisma.$transaction(async (tx) => {
    await tx.deliveryFleet.update({
      where: { id },
      data: { credentialHash: hash, credentialIssuedAt: new Date() },
    })
    await audit(
      tx,
      actor,
      "delivery_fleet.credential_rotated",
      { type: "delivery_fleet", id },
      { code: fleet.code, reason: input.reason },
    )
    await recordHistory(
      tx,
      { fleetId: id },
      { action: "fleet.credential_rotated", actor, reason: input.reason },
    )
  })
  return { credential }
}

export async function assignZone(
  fleetId: string,
  zoneId: string,
  input: AssignFleetZoneInput,
  actor: Actor,
) {
  try {
    await prisma.$transaction(
      async (tx) => {
        const [fleet, zone, current] = await Promise.all([
          tx.deliveryFleet.findUnique({ where: { id: fleetId } }),
          tx.zone.findUnique({ where: { id: zoneId } }),
          tx.deliveryFleetZone.findFirst({ where: { zoneId, endedAt: null } }),
        ])
        if (!fleet || fleet.status !== "active") throw notFound("Active delivery partner")
        if (!zone || !zone.active || zone.districtId !== fleet.districtId)
          throw badRequest("The zone must be active and belong to the partner's district.")
        if (current?.fleetId === fleetId)
          throw conflict("This partner is already assigned to the zone.")
        if (current && !input.replaceCurrent)
          throw conflict(
            "This zone already has a primary partner. Confirm replacement to continue.",
          )
        if (current)
          await tx.deliveryFleetZone.update({
            where: { id: current.id },
            data: { endedAt: new Date() },
          })
        const assignment = await tx.deliveryFleetZone.create({
          data: { fleetId, zoneId, assignedById: actor.id!, notes: input.reason },
        })
        await audit(
          tx,
          actor,
          current ? "delivery_fleet.zone_reassigned" : "delivery_fleet.zone_assigned",
          { type: "zone", id: zoneId },
          {
            fleetId,
            previousFleetId: current?.fleetId ?? null,
            assignmentId: assignment.id,
            reason: input.reason,
          },
        )
        await recordHistory(
          tx,
          { fleetId },
          {
            action: current ? "fleet.zone_reassigned" : "fleet.zone_assigned",
            actor,
            reason: input.reason,
            changes: {
              [`primaryFleet:${zoneId}`]: { from: current?.fleetId ?? null, to: fleetId },
            },
          },
        )
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("The zone already has a primary delivery partner.")
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw conflict("The zone assignment changed at the same time. Reload and retry.")
    throw error
  }
}

const boyInclude = {
  fleet: { select: { name: true, status: true } },
  zone: { include: { districtRecord: { select: { id: true, name: true } } } },
  reviewAdmin: { select: { id: true, name: true } },
  documents: { orderBy: { uploadedAt: "desc" } },
  reviews: { orderBy: { at: "asc" } },
} satisfies Prisma.DeliveryBoyInclude

type BoyRow = Prisma.DeliveryBoyGetPayload<{ include: typeof boyInclude }>

function boyDto(boy: BoyRow) {
  return DeliveryBoy.parse({
    id: boy.id,
    code: boy.code,
    fleetId: boy.fleetId,
    fleetName: boy.fleet.name,
    zoneId: boy.zoneId,
    zoneName: `${boy.zone.location}, ${boy.zone.city}`,
    districtId: boy.zone.districtRecord.id,
    district: boy.zone.districtRecord.name,
    name: boy.name,
    phone: boy.phone,
    email: boy.email,
    address: boy.address,
    dateOfBirth: boy.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: boy.gender,
    pinCode: boy.pinCode,
    drivingLicence: boy.drivingLicence,
    licenceValidUntil: boy.licenceValidUntil?.toISOString().slice(0, 10) ?? null,
    registrationValidUntil: boy.registrationValidUntil?.toISOString().slice(0, 10) ?? null,
    vehicleType: boy.vehicleType,
    vehicleNumber: boy.vehicleNumber,
    vehicleModel: boy.vehicleModel,
    payout:
      boy.payoutHolderName && boy.payoutLast4 && boy.payoutIfsc
        ? {
            holderName: boy.payoutHolderName,
            bankName: boy.payoutBankName,
            last4: boy.payoutLast4,
            ifsc: boy.payoutIfsc,
          }
        : null,
    status: boy.status,
    availability: boy.availability,
    maxActiveOrders: boy.maxActiveOrders,
    version: boy.version,
    reviewAdminId: boy.reviewAdminId,
    reviewAdminName: boy.reviewAdmin?.name ?? null,
    documents: boy.documents.map((document) => ({
      ...toStoredDocument(document),
      kind: DeliveryBoyDocumentKind.parse(document.kind),
    })),
    reviews: boy.reviews.map((review) => ({
      id: review.id,
      actorId: review.actorId,
      fleetId: review.fleetId,
      actorName: review.actorName,
      actorRole: review.actorRole,
      decision: review.decision,
      from: review.from,
      to: review.to,
      reason: review.reason,
      at: review.at.toISOString(),
    })),
    createdAt: boy.createdAt.toISOString(),
    updatedAt: boy.updatedAt.toISOString(),
  })
}

function boyWhere(
  q: DeliveryBoyListQueryInput,
  member: MemberContext,
): Prisma.DeliveryBoyWhereInput {
  const zoneIds = member.role === "super_admin" ? undefined : member.zoneIds
  return {
    ...(zoneIds && { zoneId: { in: zoneIds } }),
    ...(q.status && { status: q.status }),
    ...(q.business && { fleet: { businesses: { some: { business: q.business } } } }),
    ...(q.districtId && { zone: { districtId: q.districtId } }),
    ...(q.zoneId && { zoneId: q.zoneId }),
    ...(q.fleetId && { fleetId: q.fleetId }),
    ...(q.search && {
      OR: [
        { code: { contains: q.search, mode: "insensitive" } },
        { name: { contains: q.search, mode: "insensitive" } },
        { phone: { contains: q.search.replace(/\D/g, "") || q.search } },
        { fleet: { name: { contains: q.search, mode: "insensitive" } } },
      ],
    }),
  }
}

export async function listBoys(q: DeliveryBoyListQueryInput, member: MemberContext) {
  if (member.role !== "super_admin" && q.zoneId && !member.zoneIds.includes(q.zoneId))
    return { items: [], total: 0, page: q.page, pageSize: q.pageSize }
  const where = boyWhere(q, member)
  const [rows, total] = await prisma.$transaction([
    prisma.deliveryBoy.findMany({
      where,
      include: boyInclude,
      orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.deliveryBoy.count({ where }),
  ])
  return { items: rows.map(boyDto), total, page: q.page, pageSize: q.pageSize }
}

async function loadBoy(id: string, member: MemberContext, fleetId?: string) {
  const boy = await prisma.deliveryBoy.findUnique({ where: { id }, include: boyInclude })
  if (
    !boy ||
    (fleetId && boy.fleetId !== fleetId) ||
    (member.role !== "super_admin" && !member.zoneIds.includes(boy.zoneId))
  )
    throw notFound("Delivery boy")
  return boy
}

async function assignedReviewAdmins(db: Pick<Db, "member">, zoneId: string) {
  return db.member.findMany({
    where: {
      status: "active",
      role: "admin",
      permissions: { some: { permission: "partners.manage" } },
      zones: { some: { zoneId } },
    },
    select: { id: true, name: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
}

export async function submitBoy(fleetId: string, input: DeliveryBoySubmissionInput, actor: Actor) {
  const { otpChallengeId, otp, ...application } = input
  await consumeDeliveryBoyOtp(fleetId, application.phone, otpChallengeId, otp)
  try {
    const boy = await prisma.$transaction(async (tx) => {
      const fleet = await tx.deliveryFleet.findUnique({ where: { id: fleetId } })
      if (!fleet || fleet.status !== "active")
        throw forbidden("This delivery partner account is inactive.")
      const zone = await tx.zone.findFirst({
        where: {
          id: input.zoneId,
          active: true,
          districtId: fleet.districtId,
          fleetAssignments: { some: { fleetId, endedAt: null } },
        },
        select: { id: true },
      })
      if (!zone) throw forbidden("The selected zone is not currently assigned to this partner.")
      const riders = await tx.deliveryBoy.count({
        where: { fleetId, status: { not: "rejected" } },
      })
      if (riders >= DELIVERY_BOYS_PER_PARTNER.max)
        throw conflict(
          `This delivery partner already has ${DELIVERY_BOYS_PER_PARTNER.max} delivery boys, the maximum.`,
        )
      const admins = await assignedReviewAdmins(tx, input.zoneId)
      if (!admins.length)
        throw conflict(
          "No active Admin is assigned to this zone. Contact Super Admin before submitting.",
        )
      const created = await tx.deliveryBoy.create({
        data: {
          ...deliveryBoyData(application),
          fleetId,
          reviewAdminId: admins[0]!.id,
          code: `DB-${randomBytes(5).toString("hex").toUpperCase()}`,
        },
      })
      await tx.deliveryBoyReview.create({
        data: {
          boyId: created.id,
          fleetId,
          actorName: actor.name,
          actorRole: "delivery_partner",
          decision: "submitted",
          from: "pending_admin",
          to: "pending_admin",
        },
      })
      await audit(
        tx,
        actor,
        "delivery_boy.submitted",
        { type: "delivery_boy", id: created.id },
        {
          code: created.code,
          fleetId,
          zoneId: created.zoneId,
          reviewAdminId: admins[0]!.id,
        },
      )
      await recordHistory(tx, { boyId: created.id, fleetId }, { action: "boy.submitted", actor })
      const recipients = await tx.member.findMany({
        where: {
          status: "active",
          OR: [{ role: "super_admin" }, { id: admins[0]!.id }],
        },
        select: { id: true, role: true },
      })
      for (const recipient of recipients)
        await notify(
          tx,
          [recipient.id],
          {
            title: "Delivery boy application submitted",
            body: `${created.name} (${created.code}) needs review.`,
            link: linkFor(recipient.role, "food", "partners", `boy=${created.id}`),
          },
          actor.id,
        )
      await tx.outboxEvent.create({
        data: {
          topic: "delivery_boy.submitted",
          payload: { deliveryBoyId: created.id, fleetId, zoneId: created.zoneId },
        },
      })
      return tx.deliveryBoy.findUniqueOrThrow({ where: { id: created.id }, include: boyInclude })
    })
    return boyDto(boy)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("A delivery boy with this phone number or generated code already exists.")
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw conflict("The partner's zone or Admin assignment changed. Reload and retry.")
    throw error
  }
}

export async function correctBoy(
  fleetId: string,
  id: string,
  input: DeliveryBoyCorrectionInput,
  actor: Actor,
) {
  const { reason, ...application } = input
  const boy = await prisma.$transaction(
    async (tx) => {
      const fleet = await tx.deliveryFleet.findUnique({ where: { id: fleetId } })
      if (!fleet || fleet.status !== "active") throw forbidden()
      const zone = await tx.zone.findFirst({
        where: {
          id: input.zoneId,
          active: true,
          districtId: fleet.districtId,
          fleetAssignments: { some: { fleetId, endedAt: null } },
        },
        select: { id: true },
      })
      if (!zone) throw forbidden("The selected zone is not assigned to this partner.")
      const admins = await assignedReviewAdmins(tx, input.zoneId)
      if (!admins.length) throw conflict("No active Admin is assigned to this zone.")
      const previous = await tx.deliveryBoy.findFirst({ where: { id, fleetId } })
      if (!previous) throw notFound("Delivery boy application")
      if (previous.status !== "corrections_requested")
        throw conflict("Only applications returned for corrections can be resubmitted.")
      const updated = await tx.deliveryBoy.updateMany({
        where: { id, fleetId, version: previous.version, status: "corrections_requested" },
        data: {
          ...deliveryBoyData(application),
          reviewAdminId: admins[0]!.id,
          status: "pending_admin",
          version: { increment: 1 },
        },
      })
      if (!updated.count) throw conflict("This application changed. Reload and try again.")
      await tx.deliveryBoyReview.create({
        data: {
          boyId: id,
          fleetId,
          actorName: actor.name,
          actorRole: "delivery_partner",
          decision: "corrections_resubmitted",
          from: previous.status,
          to: "pending_admin",
          reason,
        },
      })
      await recordHistory(
        tx,
        { boyId: id, fleetId },
        {
          action: "boy.corrections_resubmitted",
          actor,
          reason,
          changes: changesOf(previous, deliveryBoyData(application)),
        },
      )
      await audit(
        tx,
        actor,
        "delivery_boy.corrections_resubmitted",
        { type: "delivery_boy", id },
        {
          fleetId,
          zoneId: application.zoneId,
          reason,
        },
      )
      const recipients = await tx.member.findMany({
        where: {
          status: "active",
          OR: [{ role: "super_admin" }, { id: admins[0]!.id }],
        },
        select: { id: true, role: true },
      })
      for (const recipient of recipients)
        await notify(
          tx,
          [recipient.id],
          {
            title: "Delivery boy application resubmitted",
            body: `${previous.name} (${previous.code}) needs review.`,
            link: linkFor(recipient.role, "food", "partners", `boy=${id}`),
          },
          actor.id,
        )
      await tx.outboxEvent.create({
        data: { topic: "delivery_boy.resubmitted", payload: { deliveryBoyId: id } },
      })
      return tx.deliveryBoy.findUniqueOrThrow({ where: { id }, include: boyInclude })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
  return boyDto(boy)
}

export async function listFleetBoys(fleetId: string) {
  const rows = await prisma.deliveryBoy.findMany({
    where: { fleetId },
    include: boyInclude,
    orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
    take: 100,
  })
  return rows.map(boyDto)
}

export async function fleetProfile(fleetId: string) {
  const fleet = await prisma.deliveryFleet.findFirst({
    where: { id: fleetId, status: "active" },
    include: fleetInclude,
  })
  if (!fleet) throw forbidden("This delivery partner account is inactive.")
  return fleetDto(fleet)
}

const BOY_OTP_TTL_SECONDS = 10 * 60
const BOY_OTP_RESEND_SECONDS = 30
const BOY_OTP_MAX_ATTEMPTS = 5
const boyOtpKey = (id: string) => `delivery-boy:otp:${id}`
const boyOtpCooldownKey = (fleetId: string, phoneHash: string) =>
  `delivery-boy:otp:cooldown:${fleetId}:${phoneHash}`
const boyOtpHash = (challengeId: string, code: string) =>
  createHash("sha256").update(`${challengeId}:${code}:${env.SESSION_SECRET}`).digest("hex")
const maskPhone = (phone: string) => `${phone.slice(0, 5)}••••${phone.slice(-3)}`
const BoyOtpChallenge = z.object({
  fleetId: z.string(),
  phone: z.string(),
  codeHash: z.string(),
  attempts: z.number().int().nonnegative(),
})

export async function sendDeliveryBoyOtp(fleetId: string, input: DeliveryBoyOtpInput) {
  const fleet = await prisma.deliveryFleet.findFirst({
    where: { id: fleetId, status: "active" },
    select: { id: true },
  })
  if (!fleet) throw forbidden("This delivery partner account is inactive.")
  const phoneHash = hashForLookup("delivery-boy-otp", input.phone)
  const cooldownKey = boyOtpCooldownKey(fleetId, phoneHash)
  if (await redis.exists(cooldownKey))
    throw tooMany("Wait 30 seconds before requesting another code.")
  await rateLimit(`delivery-boy-otp:fleet:${fleetId}`, 10, 15 * 60, "Too many OTP requests.")
  await rateLimit(
    `delivery-boy-otp:phone:${phoneHash}`,
    5,
    15 * 60,
    "Too many OTP requests for this phone number.",
  )

  const challengeId = randomUUID()
  const code = String(randomInt(0, 10 ** 6)).padStart(6, "0")
  await redis.set(
    boyOtpKey(challengeId),
    JSON.stringify({
      fleetId,
      phone: input.phone,
      codeHash: boyOtpHash(challengeId, code),
      attempts: 0,
    }),
    "EX",
    BOY_OTP_TTL_SECONDS,
  )
  await redis.set(cooldownKey, "1", "EX", BOY_OTP_RESEND_SECONDS)
  try {
    await sendOtpSms(input.phone, code, "delivery boy application")
  } catch (error) {
    await redis.del(boyOtpKey(challengeId))
    await redis.del(cooldownKey)
    throw error
  }
  return {
    challengeId,
    destination: maskPhone(input.phone),
    expiresInSeconds: BOY_OTP_TTL_SECONDS,
    resendInSeconds: BOY_OTP_RESEND_SECONDS,
  }
}

async function consumeDeliveryBoyOtp(
  fleetId: string,
  phone: string,
  challengeId: string,
  code: string,
) {
  const key = boyOtpKey(challengeId)
  const raw = await redis.get(key)
  if (!raw) throw new HttpError(410, "challenge_expired", "Request a new verification code.")
  const parsed = BoyOtpChallenge.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    await redis.del(key)
    throw new HttpError(410, "challenge_expired", "Request a new verification code.")
  }
  const challenge = parsed.data
  if (challenge.fleetId !== fleetId || challenge.phone !== phone)
    throw unauthorized("The verification code does not match this delivery boy's phone.")

  const submittedHash = Buffer.from(boyOtpHash(challengeId, code))
  const expectedHash = Buffer.from(challenge.codeHash)
  const correct =
    submittedHash.length === expectedHash.length && timingSafeEqual(submittedHash, expectedHash)
  if (!correct) {
    const attempts = challenge.attempts + 1
    if (attempts >= BOY_OTP_MAX_ATTEMPTS) await redis.del(key)
    else {
      challenge.attempts = attempts
      await redis.set(key, JSON.stringify(challenge), "KEEPTTL")
    }
    throw badRequest("The verification code is incorrect.")
  }
  await redis.del(key)
}

function fleetOrderDto(order: {
  id: string
  code: string
  business: "food" | "mart"
  status: string
  zoneId: string
  zone: { city: string; location: string }
  vendor: { name: string }
  placedAt: Date
  totalPaise: number
}): DeliveryFleetOrder {
  return DeliveryFleetOrder.parse({
    id: order.id,
    code: order.code,
    business: order.business,
    status: order.status,
    zoneId: order.zoneId,
    zoneName: `${order.zone.location}, ${order.zone.city}`,
    vendorName: order.vendor.name,
    placedAt: order.placedAt.toISOString(),
    totalPaise: order.totalPaise,
  })
}

export async function fleetOrders(fleetId: string) {
  const fleet = await prisma.deliveryFleet.findFirst({
    where: { id: fleetId, status: "active" },
    select: { id: true, businesses: { select: { business: true } } },
  })
  if (!fleet) throw forbidden("This delivery partner account is inactive.")
  const zoneIds = (
    await prisma.deliveryFleetZone.findMany({
      where: { fleetId, endedAt: null, zone: { active: true } },
      select: { zoneId: true },
    })
  ).map(({ zoneId }) => zoneId)
  if (!zoneIds.length) return []
  const orders = await prisma.order.findMany({
    where: {
      zoneId: { in: zoneIds },
      business: { in: fleet.businesses.map(({ business }) => business) },
      status: { in: ["ready", "assigned"] },
      partnerId: null,
      deliveryBoyId: null,
      OR: [{ deliveryFleetId: null }, { deliveryFleetId: fleetId }],
    },
    include: {
      zone: { select: { city: true, location: true } },
      vendor: { select: { name: true } },
    },
    orderBy: { placedAt: "asc" },
    take: 100,
  })
  return orders.map(fleetOrderDto)
}

export async function assignOrderToBoy(
  fleetId: string,
  orderId: string,
  input: DeliveryBoyAssignmentInput,
  actor: Actor,
) {
  try {
    const assigned = await prisma.$transaction(
      async (tx) => {
        const [fleet, order, boy] = await Promise.all([
          tx.deliveryFleet.findUnique({
            where: { id: fleetId },
            include: { businesses: { select: { business: true } } },
          }),
          tx.order.findUnique({
            where: { id: orderId },
            include: {
              vendor: { select: { name: true } },
              zone: { select: { city: true, location: true } },
            },
          }),
          tx.deliveryBoy.findUnique({
            where: { id: input.boyId },
            include: {
              documents: { where: { verifiedAt: { not: null } }, select: { kind: true } },
            },
          }),
        ])
        if (!fleet || fleet.status !== "active")
          throw forbidden("This delivery partner account is inactive.")
        if (!order) throw notFound("Order")
        if (!fleet.businesses.some(({ business }) => business === order.business))
          throw forbidden("This delivery partner is not assigned to the order's business.")
        if (!boy) throw forbidden("Choose an approved, available rider from this partner and zone.")
        const primaryZone = await tx.deliveryFleetZone.findFirst({
          where: {
            fleetId,
            zoneId: order.zoneId,
            endedAt: null,
            zone: { active: true, districtId: fleet.districtId },
          },
          select: { id: true },
        })
        const openAssignment = await tx.deliveryAssignment.findFirst({
          where: { orderId, endedAt: null },
          select: { id: true },
        })
        const workload = await tx.deliveryAssignment.count({
          where: { boyId: input.boyId, endedAt: null },
        })
        const areaApproved =
          boy && boy.zoneId !== order.zoneId
            ? await tx.deliveryBoyArea.findFirst({
                where: { boyId: boy.id, zoneId: order.zoneId, status: "approved" },
                select: { id: true },
              })
            : null
        assertOrderAssignmentEligible({
          fleetId,
          boy,
          order,
          primaryZone: Boolean(primaryZone),
          areaApproved: Boolean(areaApproved),
          openAssignment: Boolean(openAssignment),
          workload,
          verifiedDocumentKinds: boy.documents.map((document) => document.kind),
        })

        const boyUpdate = await tx.deliveryBoy.updateMany({
          where: {
            id: input.boyId,
            version: boy.version,
            status: "active",
            availability: "available",
          },
          data: {
            version: { increment: 1 },
            availability: workload + 1 >= boy.maxActiveOrders ? "on_delivery" : "available",
          },
        })
        if (!boyUpdate.count)
          throw conflict("The rider's availability changed. Reload and select another rider.")
        // An order already on the road whose rider raised an SOS is taken over where it stands:
        // it keeps its status and the customer keeps the same delivery code.
        const takeover = Boolean(order.sosAt) && TRANSIT_STATUSES.includes(order.status)
        const orderUpdate = await tx.order.updateMany({
          where: {
            id: order.id,
            version: input.version,
            status: takeover ? order.status : { in: ["ready", "assigned"] },
            partnerId: null,
            deliveryBoyId: null,
            OR: [{ deliveryFleetId: null }, { deliveryFleetId: fleetId }],
          },
          data: {
            status: takeover ? order.status : "assigned",
            deliveryFleetId: fleetId,
            deliveryBoyId: boy.id,
            version: { increment: 1 },
            ...(takeover ? { sosAt: null, sosReason: null, sosLat: null, sosLng: null } : {}),
          },
        })
        if (!orderUpdate.count)
          throw conflict("This order changed. Reload to see the latest assignment.")
        const assignment = await tx.deliveryAssignment.create({
          data: {
            orderId,
            fleetId,
            boyId: input.boyId,
            status: takeover ? "accepted" : "assigned",
            reason: takeover ? "Took over after the previous rider could not continue" : null,
          },
        })
        if (!takeover) await issueDeliveryCode(orderId, tx)
        await tx.orderEvent.create({
          data: {
            orderId,
            from: order.status,
            to: takeover ? order.status : "assigned",
            actorType: "delivery_partner",
            actorId: fleetId,
            reason: takeover
              ? `${boy.name} (${boy.code}) took over the delivery`
              : `Assigned to ${boy.name} (${boy.code})`,
          },
        })
        await tx.deliveryBoyNotification.create({
          data: {
            boyId: input.boyId,
            title: takeover ? "Take over a delivery" : "New delivery assigned",
            body: takeover
              ? `Order ${order.code} is with another rider who couldn't continue. Collect it from them and deliver it to the customer.`
              : `Order ${order.code} from ${order.vendor.name} is ready for delivery.`,
          },
        })
        await audit(
          tx,
          actor,
          "order.delivery_boy_assigned",
          { type: "order", id: orderId },
          { code: order.code, fleetId, boyId: input.boyId, assignmentId: assignment.id },
        )
        await tx.outboxEvent.create({
          data: {
            topic: "order.delivery_boy_assigned",
            payload: { orderId, code: order.code, fleetId, boyId: input.boyId },
          },
        })
        return tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: {
            zone: { select: { city: true, location: true } },
            vendor: { select: { name: true } },
          },
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    return fleetOrderDto(assigned)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("The order or rider already has an active assignment.")
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw conflict("The order or rider changed at the same time. Reload and try again.")
    throw error
  }
}

export async function changeFleetOrderStatus(
  fleetId: string,
  orderId: string,
  input: DeliveryBoyOrderStatusInput,
  actor: Actor,
) {
  const updated = await prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, deliveryFleetId: fleetId, deliveryBoyId: { not: null } },
        include: {
          deliveryBoy: { select: { id: true, name: true, maxActiveOrders: true } },
          vendor: { select: { name: true } },
          zone: { select: { city: true, location: true } },
        },
      })
      if (!order || !order.deliveryBoy) throw notFound("Assigned order")
      const assignment = await tx.deliveryAssignment.findFirst({
        where: { orderId, fleetId, boyId: order.deliveryBoy.id, endedAt: null },
      })
      if (!assignment) throw conflict("This order has no active delivery assignment.")
      if (input.to === "delivered" && order.deliveryOtpHash && !order.otpVerifiedAt)
        throw conflict("Ask the customer for the delivery code before you mark this delivered.")
      if (!canTransition(order.business, order.status, input.to))
        throw badRequest(`An order in ${order.status} cannot move to ${input.to}.`)
      const count = await tx.order.updateMany({
        where: {
          id: orderId,
          deliveryFleetId: fleetId,
          version: input.version,
          status: order.status,
        },
        data: { status: input.to, version: { increment: 1 } },
      })
      if (!count.count) throw conflict("This order changed. Reload to see the latest status.")
      if (input.to === "picked_up") {
        await tx.deliveryAssignment.update({
          where: { id: assignment.id },
          data: { status: "accepted" },
        })
      } else if (input.to === "delivered") {
        await tx.deliveryAssignment.update({
          where: { id: assignment.id },
          data: { status: "completed", endedAt: new Date() },
        })
        const remaining = await tx.deliveryAssignment.count({
          where: { boyId: order.deliveryBoy.id, endedAt: null },
        })
        await tx.deliveryBoy.updateMany({
          where: { id: order.deliveryBoy.id, status: "active" },
          data: {
            availability:
              remaining < order.deliveryBoy.maxActiveOrders ? "available" : "on_delivery",
            version: { increment: 1 },
          },
        })
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          from: order.status,
          to: input.to,
          actorType: "delivery_partner",
          actorId: fleetId,
          reason: null,
        },
      })
      await audit(
        tx,
        actor,
        "order.delivery_boy_status_changed",
        { type: "order", id: orderId },
        { code: order.code, from: order.status, to: input.to, boyId: order.deliveryBoy.id },
      )
      await tx.outboxEvent.create({
        data: {
          topic: "order.status_changed",
          payload: { orderId, code: order.code, from: order.status, to: input.to },
        },
      })
      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          zone: { select: { city: true, location: true } },
          vendor: { select: { name: true } },
        },
      })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
  return fleetOrderDto(updated)
}

export async function listBoyNotifications(fleetId: string, id: string) {
  const boy = await prisma.deliveryBoy.findFirst({ where: { id, fleetId }, select: { id: true } })
  if (!boy) throw notFound("Delivery boy")
  const rows = await prisma.deliveryBoyNotification.findMany({
    where: { boyId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function readBoyNotification(fleetId: string, id: string, notificationId: string) {
  const done = await prisma.deliveryBoyNotification.updateMany({
    where: { id: notificationId, boyId: id, boy: { fleetId } },
    data: { readAt: new Date() },
  })
  if (!done.count) throw notFound("Delivery boy notification")
}

export async function getBoy(id: string, member: MemberContext) {
  return boyDto(await loadBoy(id, member))
}

export async function reviewBoy(
  id: string,
  input: z.infer<typeof DeliveryBoyReviewRequest>,
  member: MemberContext,
  actor: Actor,
) {
  const decision = input.decision
  if (
    (decision === "rejected" || decision === "corrections_requested") &&
    (input.reason?.trim().length ?? 0) < 3
  )
    throw badRequest("Provide a reason for rejecting or requesting corrections.")

  const boy = await prisma.$transaction(
    async (tx) => {
      const current = await tx.deliveryBoy.findUnique({
        where: { id },
        include: { documents: true, fleet: { select: { status: true } } },
      })
      if (!current || (member.role !== "super_admin" && !member.zoneIds.includes(current.zoneId)))
        throw notFound("Delivery boy")
      const next = nextDeliveryBoyStatus(
        member,
        {
          status: current.status,
          zoneId: current.zoneId,
          reviewAdminId: current.reviewAdminId,
          fleetStatus: current.fleet.status,
          verifiedDocumentKinds: current.documents
            .filter((document) => document.verifiedAt)
            .map((document) => document.kind),
        },
        decision,
      )
      const updated = await tx.deliveryBoy.updateMany({
        where: { id, version: input.version, status: current.status },
        data: {
          status: next,
          availability: next === "active" ? "offline" : current.availability,
          version: { increment: 1 },
        },
      })
      if (!updated.count) throw conflict("This application changed. Reload and try again.")
      await tx.deliveryBoyReview.create({
        data: {
          boyId: id,
          actorId: actor.id,
          actorName: actor.name,
          actorRole: member.role,
          decision: decision as "forwarded" | "corrections_requested" | "rejected" | "approved",
          from: current.status,
          to: next,
          reason: input.reason?.trim() || null,
        },
      })
      await recordHistory(
        tx,
        { boyId: id, fleetId: current.fleetId },
        {
          action: `boy.${decision}`,
          actor,
          reason: input.reason.trim(),
          changes: { status: { from: current.status, to: next } },
        },
      )
      await tx.deliveryBoyNotification.create({
        data: {
          boyId: id,
          title: "Application status updated",
          body: input.reason?.trim() || `Your application is now ${next.replaceAll("_", " ")}.`,
        },
      })
      await audit(
        tx,
        actor,
        `delivery_boy.${decision}`,
        { type: "delivery_boy", id },
        {
          code: current.code,
          from: current.status,
          to: next,
          reason: input.reason?.trim() || null,
        },
      )
      const recipients = await tx.member.findMany({
        where:
          next === "pending_super"
            ? { status: "active", role: "super_admin" }
            : {
                status: "active",
                role: "admin",
                // An empty id matches nobody, so an unassigned application never notifies every Admin.
                id: current.reviewAdminId ?? "",
              },
        select: { id: true, role: true },
      })
      for (const recipient of recipients)
        await notify(
          tx,
          [recipient.id],
          {
            title: `Delivery boy application ${decision.replaceAll("_", " ")}`,
            body: `${current.name} (${current.code}) — ${input.reason?.trim() || next}.`,
            link: linkFor(recipient.role, "food", "partners", `boy=${id}`),
          },
          actor.id,
        )
      await tx.outboxEvent.create({
        data: {
          topic: `delivery_boy.${decision}`,
          payload: { deliveryBoyId: id, from: current.status, to: next },
        },
      })
      return tx.deliveryBoy.findUniqueOrThrow({ where: { id }, include: boyInclude })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
  return boyDto(boy)
}

export async function verifyBoyDocument(
  id: string,
  documentId: string,
  input: { verified: boolean; reason: string },
  member: MemberContext,
  actor: Actor,
) {
  const { verified, reason } = input
  const updated = await prisma.$transaction(
    async (tx) => {
      const boy = await tx.deliveryBoy.findUnique({ where: { id } })
      if (!boy || (member.role !== "super_admin" && !member.zoneIds.includes(boy.zoneId)))
        throw notFound("Delivery boy")
      if (member.role !== "super_admin" && boy.reviewAdminId !== member.id)
        throw forbidden("Only the responsible Admin can verify this application.")
      if (boy.status === "active" || boy.status === "rejected")
        throw conflict("Documents can only be verified while an application is under review.")
      const document = await tx.deliveryBoyDocument.findFirst({
        where: { id: documentId, boyId: id },
      })
      if (!document) throw notFound("Document")
      const row = await tx.deliveryBoyDocument.update({
        where: { id: documentId },
        data: { verifiedAt: verified ? new Date() : null },
      })
      await audit(
        tx,
        actor,
        verified ? "delivery_boy.document_verified" : "delivery_boy.document_unverified",
        { type: "delivery_boy", id },
        { documentId, kind: document.kind, reason },
      )
      await recordHistory(
        tx,
        { boyId: id, fleetId: boy.fleetId },
        {
          action: verified ? "boy.document_verified" : "boy.document_unverified",
          actor,
          reason,
          changes: { [document.kind]: { from: document.verifiedAt !== null, to: verified } },
        },
      )
      return row
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
  return toStoredDocument(updated)
}

export async function uploadBoyDocument(
  fleetId: string,
  id: string,
  kind: string,
  upload: { body: unknown; contentType: string | undefined; fileName: string | undefined },
  actor: Actor,
) {
  const documentKind = DeliveryBoyDocumentKind.parse(kind)
  const boy = await prisma.deliveryBoy.findFirst({
    where: { id, fleetId },
    select: { code: true },
  })
  if (!boy) throw notFound("Delivery boy")
  const file = checkUpload(upload.body, upload.contentType, upload.fileName, documentKind)
  const key = `delivery-boys/${boy.code}/${documentKind}-${Date.now()}-${randomBytes(4).toString("hex")}.${file.ext}`
  await putObject(key, file.buffer, file.contentType)
  let result: {
    document: Awaited<ReturnType<typeof prisma.deliveryBoyDocument.upsert>>
    previousKey: string | undefined
  }
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const currentBoy = await tx.deliveryBoy.findFirst({
          where: { id, fleetId },
          select: { status: true },
        })
        if (!currentBoy) throw notFound("Delivery boy")
        if (
          !["pending_admin", "pending_super", "corrections_requested"].includes(currentBoy.status)
        )
          throw conflict("Documents cannot be changed after the application has been decided.")
        const previous = await tx.deliveryBoyDocument.findUnique({
          where: { boyId_kind: { boyId: id, kind: documentKind } },
        })
        const document = await tx.deliveryBoyDocument.upsert({
          where: { boyId_kind: { boyId: id, kind: documentKind } },
          create: {
            boyId: id,
            kind: documentKind,
            s3Key: key,
            fileName: file.fileName,
            contentType: file.contentType,
            sizeBytes: file.buffer.length,
          },
          update: {
            s3Key: key,
            fileName: file.fileName,
            contentType: file.contentType,
            sizeBytes: file.buffer.length,
            verifiedAt: null,
            uploadedAt: new Date(),
          },
        })
        await audit(
          tx,
          actor,
          "delivery_boy.document_uploaded",
          { type: "delivery_boy", id },
          {
            kind: documentKind,
          },
        )
        return { document, previousKey: previous?.s3Key }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (error) {
    try {
      await deleteObject(key)
    } catch (cleanupError) {
      console.error("Failed to remove an uncommitted delivery boy document upload", cleanupError)
    }
    throw error
  }
  if (result.previousKey) {
    try {
      await deleteObject(result.previousKey)
    } catch (cleanupError) {
      console.error("Failed to remove a replaced delivery boy document", cleanupError)
    }
  }
  return toStoredDocument(result.document)
}

export async function boyDocumentFile(id: string, documentId: string, member: MemberContext) {
  await loadBoy(id, member)
  const document = await prisma.deliveryBoyDocument.findFirst({
    where: { id: documentId, boyId: id },
  })
  if (!document) throw notFound("Document")
  const body = await getObject(document.s3Key)
  if (!body) throw notFound("Stored file")
  return {
    body,
    fileName: document.fileName,
    contentType: document.contentType ?? "application/octet-stream",
  }
}

async function historyRows(where: Prisma.DeliveryHistoryWhereInput) {
  const rows = await prisma.deliveryHistory.findMany({
    where,
    orderBy: { at: "desc" },
    take: 200,
  })
  return rows.map((row) =>
    DeliveryHistoryEntry.parse({
      id: row.id,
      action: row.action,
      actorName: row.actorName,
      actorRole: row.actorRole,
      reason: row.reason,
      changes: row.changes as Record<string, { from: unknown; to: unknown }> | null,
      at: row.at.toISOString(),
    }),
  )
}

/** Who changed the partner, why, and what changed. Admins see only partners they requested. */
export async function fleetHistory(id: string, member: MemberContext) {
  const fleet = await prisma.deliveryFleet.findUnique({
    where: { id },
    select: { requestedById: true },
  })
  if (!fleet || (member.role !== "super_admin" && fleet.requestedById !== member.id))
    throw notFound("Delivery partner")
  return historyRows({ fleetId: id })
}

/** A partner sees its own riders' history, never another partner's. */
export async function fleetBoyHistory(fleetId: string, id: string) {
  const boy = await prisma.deliveryBoy.findFirst({ where: { id, fleetId }, select: { id: true } })
  if (!boy) throw notFound("Delivery boy")
  return historyRows({ boyId: id })
}

export async function boyHistory(id: string, member: MemberContext) {
  await loadBoy(id, member)
  return historyRows({ boyId: id })
}

/**
 * Riders who could take this order now, least busy first: active and available, in the order's
 * zone, from an active partner that serves the business, with every required document verified.
 */
export async function suggestRiders(orderId: string, member: MemberContext) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      zoneId: true,
      business: true,
      status: true,
      deliveryBoyId: true,
      sosLat: true,
      sosLng: true,
    },
  })
  if (!order || (member.role !== "super_admin" && !member.zoneIds.includes(order.zoneId)))
    throw notFound("Order")
  if (order.deliveryBoyId) return []
  // Riders are ranked by distance to the order's zone centre (the pickup area), or, when the
  // previous rider raised an SOS, to where they are stuck. A rider with no recent position is
  // still listed, after the riders we can place.
  const zoneRow = await prisma.zone.findUnique({
    where: { id: order.zoneId },
    select: { lat: true, lng: true },
  })
  const zone =
    order.sosLat !== null && order.sosLng !== null
      ? { lat: order.sosLat, lng: order.sosLng }
      : zoneRow
  const riders = await prisma.deliveryBoy.findMany({
    where: {
      OR: [
        { zoneId: order.zoneId },
        { serviceAreas: { some: { zoneId: order.zoneId, status: "approved" } } },
      ],
      status: "active",
      availability: "available",
      fleet: {
        status: "active",
        businesses: { some: { business: order.business } },
        zones: { some: { zoneId: order.zoneId, endedAt: null } },
      },
    },
    include: {
      fleet: { select: { name: true } },
      documents: { where: { verifiedAt: { not: null } }, select: { kind: true } },
      assignments: { where: { endedAt: null }, select: { id: true } },
    },
  })
  return riders
    .filter(
      (rider) =>
        ["photo_id", "driving_licence", "vehicle_registration"].every((kind) =>
          rider.documents.some((document) => document.kind === kind),
        ) && rider.assignments.length < rider.maxActiveOrders,
    )
    .map((rider) => {
      const placed =
        zone?.lat != null &&
        zone.lng != null &&
        rider.lastLat !== null &&
        rider.lastLng !== null &&
        rider.lastLocationAt !== null
          ? distanceKm({ lat: rider.lastLat, lng: rider.lastLng }, { lat: zone.lat, lng: zone.lng })
          : null
      return {
        id: rider.id,
        code: rider.code,
        name: rider.name,
        fleetName: rider.fleet.name,
        activeOrders: rider.assignments.length,
        maxActiveOrders: rider.maxActiveOrders,
        distanceKm: placed === null ? null : Math.round(placed * 10) / 10,
      }
    })
    .sort(
      (a, b) =>
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
        a.activeOrders - b.activeOrders ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 10)
}

export async function fleetActor(fleetId: string): Promise<Actor> {
  const fleet = await prisma.deliveryFleet.findUnique({
    where: { id: fleetId },
    select: { code: true, name: true },
  })
  if (!fleet) throw notFound("Delivery partner")
  return {
    id: null,
    name: `${fleet.name} (${fleet.code})`,
    role: "delivery_partner",
    source: "api",
  }
}

/** Super Admin adds a delivery boy to an existing partner, in one of the partner's zones. */
export async function addBoyToFleet(
  fleetId: string,
  input: DeliveryBoyApplicationInput,
  actor: Actor,
) {
  try {
    const boy = await prisma.$transaction(async (tx) => {
      const fleet = await tx.deliveryFleet.findUnique({ where: { id: fleetId } })
      if (!fleet || fleet.status !== "active")
        throw conflict("Only an active delivery partner can take new delivery boys.")
      const zone = await tx.zone.findFirst({
        where: {
          id: input.zoneId,
          active: true,
          districtId: fleet.districtId,
          fleetAssignments: { some: { fleetId, endedAt: null } },
        },
        select: { id: true },
      })
      if (!zone) throw badRequest("Choose a zone this partner is assigned to.")
      const riders = await tx.deliveryBoy.count({ where: { fleetId, status: { not: "rejected" } } })
      if (riders >= DELIVERY_BOYS_PER_PARTNER.max)
        throw conflict(
          `This delivery partner already has ${DELIVERY_BOYS_PER_PARTNER.max} delivery boys, the maximum.`,
        )
      const admins = await assignedReviewAdmins(tx, input.zoneId)
      if (!admins.length) throw conflict("No active Admin is assigned to this zone.")
      const created = await tx.deliveryBoy.create({
        data: {
          ...deliveryBoyData(input),
          fleetId,
          reviewAdminId: admins[0]!.id,
          code: `DB-${randomBytes(5).toString("hex").toUpperCase()}`,
        },
      })
      await tx.deliveryBoyReview.create({
        data: {
          boyId: created.id,
          fleetId,
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role ?? "super_admin",
          decision: "submitted",
          from: "pending_admin",
          to: "pending_admin",
        },
      })
      await audit(
        tx,
        actor,
        "delivery_boy.submitted",
        { type: "delivery_boy", id: created.id },
        {
          code: created.code,
          fleetId,
          zoneId: created.zoneId,
          reviewAdminId: admins[0]!.id,
          via: "super_admin",
        },
      )
      await recordHistory(tx, { boyId: created.id, fleetId }, { action: "boy.submitted", actor })
      return tx.deliveryBoy.findUniqueOrThrow({ where: { id: created.id }, include: boyInclude })
    })
    return boyDto(boy)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("A delivery boy with this phone number already exists.")
    throw error
  }
}

/** A rider's position, reported by the rider app with the partner's key. */
export async function reportBoyLocation(
  fleetId: string,
  id: string,
  input: { lat: number; lng: number },
) {
  const boy = await prisma.deliveryBoy.findFirst({ where: { id, fleetId }, select: { id: true } })
  if (!boy) throw notFound("Delivery boy")
  await prisma.deliveryBoy.update({
    where: { id },
    data: { lastLat: input.lat, lastLng: input.lng, lastLocationAt: new Date() },
  })
  return { ok: true as const }
}

/** How long a reported position counts as current for the live map. */
const POSITION_WINDOW_MS = 6 * 60 * 60 * 1000

/**
 * Every active rider in the member's zones. Riders who have not reported a position are included
 * with no location, so the list shows the whole workforce; the map only places riders with one.
 */
export async function liveRiders(member: MemberContext) {
  const rows = await prisma.deliveryBoy.findMany({
    where: {
      status: "active",
      ...(member.role !== "super_admin" && { zoneId: { in: member.zoneIds } }),
    },
    select: {
      id: true,
      code: true,
      name: true,
      availability: true,
      lastLat: true,
      lastLng: true,
      lastLocationAt: true,
      fleet: { select: { name: true } },
      zone: { select: { district: true, location: true, city: true } },
      reviewAdmin: { select: { name: true } },
      _count: { select: { assignments: { where: { endedAt: null } } } },
    },
    orderBy: [{ lastLocationAt: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    take: 1000,
  })
  const cutoff = Date.now() - POSITION_WINDOW_MS
  return rows.map((row) => {
    const hasPosition = row.lastLat !== null && row.lastLng !== null && row.lastLocationAt !== null
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      fleetName: row.fleet.name,
      district: row.zone.district,
      adminName: row.reviewAdmin?.name ?? null,
      zoneName: `${row.zone.location}, ${row.zone.city}`,
      availability: row.availability,
      activeOrders: row._count.assignments,
      lat: hasPosition ? row.lastLat : null,
      lng: hasPosition ? row.lastLng : null,
      lastSeenAt: hasPosition ? row.lastLocationAt!.toISOString() : null,
      /** True when the position was reported in the last six hours. */
      positionFresh: hasPosition && row.lastLocationAt!.getTime() >= cutoff,
    }
  })
}
