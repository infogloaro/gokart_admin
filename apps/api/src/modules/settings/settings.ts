import {
  CreateFeeRuleRequest,
  CreateDistrictRequest,
  CreateZoneRequest,
  District,
  DistrictQuery,
  FeeRule,
  ManagedZone,
  UpdateDistrictRequest,
  UpdateZoneRequest,
} from "@zoauro/shared"
import { Router, type Request, type Response } from "express"
import { Prisma } from "../../generated/prisma/client"
import { audit } from "../../lib/audit"
import { badRequest, conflict, forbidden, notFound, parse } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { actorOf, currentMember, requireAuth, requirePermission } from "../../middleware/auth"
import { errors, json, registry } from "../../openapi/registry"
import { z } from "zod"
import { surgeRoutes } from "./surge"

function assertSuperAdmin(req: Request) {
  if (currentMember(req).role !== "super_admin") throw forbidden()
}

function zoneDto(zone: {
  id: string
  district: string
  districtId: string
  city: string
  location: string
  lat: number | null
  lng: number | null
  active: boolean
  createdAt: Date
  partnerNames?: string[]
  partnerCount?: number
  availablePartnerCount?: number
  activeOrderCount?: number
}) {
  return ManagedZone.parse({
    ...zone,
    districtId: zone.districtId,
    partnerNames: zone.partnerNames ?? [],
    partnerCount: zone.partnerCount ?? 0,
    availablePartnerCount: zone.availablePartnerCount ?? 0,
    activeOrderCount: zone.activeOrderCount ?? 0,
    createdAt: zone.createdAt.toISOString(),
  })
}

function districtDto(district: {
  id: string
  code: string
  name: string
  state: string
  description: string | null
  active: boolean
  createdAt: Date
  updatedAt: Date
  _count?: { zones: number }
}) {
  return District.parse({
    ...district,
    zoneCount: district._count?.zones ?? 0,
    createdAt: district.createdAt.toISOString(),
    updatedAt: district.updatedAt.toISOString(),
  })
}

function feeDto(rule: {
  id: string
  business: "food" | "mart"
  zoneId: string | null
  baseFeePaise: number
  perKmPaise: number
  freeAbovePaise: number | null
  effectiveFrom: Date
  createdAt: Date
  zone: { city: string; location: string } | null
}) {
  return FeeRule.parse({
    id: rule.id,
    business: rule.business,
    zoneId: rule.zoneId,
    zoneName: rule.zone ? `${rule.zone.location}, ${rule.zone.city}` : null,
    baseFeePaise: rule.baseFeePaise,
    perKmPaise: rule.perKmPaise,
    freeAbovePaise: rule.freeAbovePaise,
    effectiveFrom: rule.effectiveFrom.toISOString(),
    createdAt: rule.createdAt.toISOString(),
  })
}

async function zones(req: Request, res: Response) {
  assertSuperAdmin(req)
  const rows = await prisma.zone.findMany({
    include: {
      partners: { select: { name: true, status: true, availability: true } },
      orders: {
        where: {
          status: {
            in: [
              "placed",
              "accepted",
              "preparing",
              "packed",
              "ready",
              "assigned",
              "picked_up",
              "out_for_delivery",
              "refund_requested",
            ],
          },
        },
        select: { id: true },
      },
    },
    orderBy: [{ district: "asc" }, { city: "asc" }, { location: "asc" }],
  })
  res.json(
    rows.map((zone) =>
      zoneDto({
        ...zone,
        partnerNames: zone.partners.map((partner) => partner.name),
        partnerCount: zone.partners.length,
        availablePartnerCount: zone.partners.filter(
          (partner) => partner.status === "active" && partner.availability === "available",
        ).length,
        activeOrderCount: zone.orders.length,
      }),
    ),
  )
}

async function districts(req: Request, res: Response) {
  assertSuperAdmin(req)
  const query = parse(DistrictQuery, req.query)
  const rows = await prisma.district.findMany({
    where: {
      ...(query.status && { active: query.status === "active" }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { code: { contains: query.search, mode: "insensitive" } },
          { state: { contains: query.search, mode: "insensitive" } },
        ],
      }),
    },
    include: { _count: { select: { zones: true } } },
    orderBy: [{ state: "asc" }, { name: "asc" }],
  })
  res.json(rows.map(districtDto))
}

async function createDistrict(req: Request, res: Response) {
  assertSuperAdmin(req)
  const input = parse(CreateDistrictRequest, req.body)
  try {
    const district = await prisma.$transaction(async (tx) => {
      const created = await tx.district.create({ data: input })
      await audit(tx, actorOf(req), "district.created", { type: "district", id: created.id }, input)
      return created
    })
    res.status(201).json(districtDto(district))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("That district code or name already exists.")
    throw error
  }
}

async function updateDistrict(req: Request<{ id: string }>, res: Response) {
  assertSuperAdmin(req)
  const input = parse(UpdateDistrictRequest, req.body)
  try {
    const district = await prisma.$transaction(
      async (tx) => {
        const previous = await tx.district.findUnique({ where: { id: req.params.id } })
        if (!previous) throw notFound("District")
        if (previous.active && !input.active) {
          const [activeZones, activeOrders] = await Promise.all([
            tx.zone.count({ where: { districtId: previous.id, active: true } }),
            tx.order.count({
              where: {
                zone: { districtId: previous.id },
                status: { notIn: ["delivered", "cancelled", "refunded"] },
              },
            }),
          ])
          if (activeZones || activeOrders)
            throw conflict(
              "Deactivate the district's active zones and complete its active orders first.",
            )
        }
        const updated = await tx.district.update({ where: { id: previous.id }, data: input })
        if (previous.name !== updated.name)
          await tx.zone.updateMany({
            where: { districtId: updated.id },
            data: { district: updated.name },
          })
        await audit(
          tx,
          actorOf(req),
          "district.updated",
          { type: "district", id: updated.id },
          { before: previous, after: input },
        )
        return tx.district.findUniqueOrThrow({
          where: { id: updated.id },
          include: { _count: { select: { zones: true } } },
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    res.json(districtDto(district))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("That district code or name already exists.")
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw conflict("District operations changed at the same time. Reload and retry.")
    throw error
  }
}

/** The active district a zone belongs to, by id or by name; a name shared by two states is ambiguous. */
async function findZoneDistrict(
  tx: Prisma.TransactionClient,
  input: { districtId?: string; district?: string },
) {
  const matches = input.districtId
    ? await tx.district.findMany({ where: { id: input.districtId, active: true } })
    : await tx.district.findMany({
        where: { name: { equals: input.district, mode: "insensitive" }, active: true },
        take: 2,
      })
  if (matches.length !== 1)
    throw badRequest(
      matches.length
        ? "More than one state has that district. Choose it by id."
        : "Choose an existing active district.",
      { districtId: ["Required"] },
    )
  return matches[0]!
}

async function deleteDistrict(req: Request<{ id: string }>, res: Response) {
  assertSuperAdmin(req)
  await prisma.$transaction(async (tx) => {
    const district = await tx.district.findUnique({ where: { id: req.params.id } })
    if (!district) throw notFound("District")
    const [zones, fleets] = await Promise.all([
      tx.zone.count({ where: { districtId: district.id } }),
      tx.deliveryFleet.count({ where: { districtId: district.id } }),
    ])
    if (zones || fleets)
      throw conflict(
        "This district still has zones or delivery companies. Remove them first, or deactivate the district instead.",
      )
    await tx.district.delete({ where: { id: district.id } })
    await audit(
      tx,
      actorOf(req),
      "district.deleted",
      { type: "district", id: district.id },
      {
        code: district.code,
        name: district.name,
        state: district.state,
      },
    )
  })
  res.status(204).end()
}

async function deleteZone(req: Request<{ id: string }>, res: Response) {
  assertSuperAdmin(req)
  await prisma.$transaction(async (tx) => {
    const zone = await tx.zone.findUnique({ where: { id: req.params.id } })
    if (!zone) throw notFound("Service area")
    const inUse = await Promise.all([
      tx.order.count({ where: { zoneId: zone.id } }),
      tx.vendor.count({ where: { zoneId: zone.id } }),
      tx.partner.count({ where: { zoneId: zone.id } }),
      tx.deliveryBoy.count({ where: { zoneId: zone.id } }),
      tx.deliveryFleetZone.count({ where: { zoneId: zone.id } }),
      tx.feeRule.count({ where: { zoneId: zone.id } }),
      tx.surgeRule.count({ where: { zoneId: zone.id } }),
    ])
    if (inUse.some(Boolean))
      throw conflict(
        "This zone has orders, vendors, delivery partners, riders, fee rules or surge rules. Deactivate it instead of deleting.",
      )
    await tx.zone.delete({ where: { id: zone.id } })
    await audit(
      tx,
      actorOf(req),
      "zone.deleted",
      { type: "zone", id: zone.id },
      {
        district: zone.district,
        city: zone.city,
        location: zone.location,
      },
    )
  })
  res.status(204).end()
}

async function createZone(req: Request, res: Response) {
  assertSuperAdmin(req)
  const input = parse(CreateZoneRequest, req.body)
  try {
    const zone = await prisma.$transaction(
      async (tx) => {
        const district = await findZoneDistrict(tx, input)
        const created = await tx.zone.create({
          data: {
            district: district.name,
            districtRecord: { connect: { id: district.id } },
            city: input.city,
            location: input.location,
            lat: input.lat,
            lng: input.lng,
          },
        })
        await audit(tx, actorOf(req), "zone.created", { type: "zone", id: created.id }, input)
        return created
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    res.status(201).json(zoneDto(zone))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("That service area already exists.")
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw conflict("Zone operations changed at the same time. Reload and retry.")
    throw error
  }
}

async function updateZone(req: Request<{ id: string }>, res: Response) {
  assertSuperAdmin(req)
  const input = parse(UpdateZoneRequest, req.body)
  try {
    const zone = await prisma.$transaction(
      async (tx) => {
        const previous = await tx.zone.findUnique({ where: { id: req.params.id } })
        if (!previous) throw notFound("Service area")
        const district = await findZoneDistrict(tx, input)
        if (previous.active && !input.active) {
          const activeOrders = await tx.order.count({
            where: {
              zoneId: previous.id,
              status: { notIn: ["delivered", "cancelled", "refunded"] },
            },
          })
          if (activeOrders)
            throw conflict(
              "This zone has active orders. Complete them before deactivating the zone.",
            )
        }
        const updated = await tx.zone.update({
          where: { id: previous.id },
          data: {
            district: district.name,
            districtRecord: { connect: { id: district.id } },
            city: input.city,
            location: input.location,
            lat: input.lat,
            lng: input.lng,
            active: input.active,
          },
        })
        await audit(
          tx,
          actorOf(req),
          "zone.updated",
          { type: "zone", id: updated.id },
          {
            before: {
              district: previous.district,
              city: previous.city,
              location: previous.location,
              active: previous.active,
            },
            after: input,
          },
        )
        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    res.json(zoneDto(zone))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("That service area already exists.")
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw conflict("Zone operations changed at the same time. Reload and retry.")
    throw error
  }
}

const FeeQuery = z.object({
  business: z.enum(["food", "mart"]).optional(),
  zoneId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

async function fees(req: Request, res: Response) {
  assertSuperAdmin(req)
  const query = parse(FeeQuery, req.query)
  const where: Prisma.FeeRuleWhereInput = {
    ...(query.business ? { business: query.business } : {}),
    ...(query.zoneId ? { zoneId: query.zoneId } : {}),
  }
  const [total, items] = await Promise.all([
    prisma.feeRule.count({ where }),
    prisma.feeRule.findMany({
      where,
      include: { zone: { select: { city: true, location: true } } },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])
  res.json({ items: items.map(feeDto), total, page: query.page, pageSize: query.pageSize })
}

async function createFee(req: Request, res: Response) {
  assertSuperAdmin(req)
  const input = parse(CreateFeeRuleRequest, req.body)
  if (new Date(input.effectiveFrom).getTime() < Date.now() - 60_000)
    throw badRequest("A new fee rule cannot take effect in the past.", {
      effectiveFrom: ["Choose the current time or a future time."],
    })
  if (input.zoneId) {
    const zone = await prisma.zone.findUnique({
      where: { id: input.zoneId },
      select: { id: true, active: true },
    })
    if (!zone?.active) throw notFound("Active service area")
  }
  const rule = await prisma.$transaction(async (tx) => {
    const created = await tx.feeRule.create({
      data: {
        ...input,
        effectiveFrom: new Date(input.effectiveFrom),
        createdById: currentMember(req).id,
      },
      include: { zone: { select: { city: true, location: true } } },
    })
    await audit(
      tx,
      actorOf(req),
      "fee_rule.created",
      { type: "fee_rule", id: created.id },
      {
        business: input.business,
        zoneId: input.zoneId,
        baseFeePaise: input.baseFeePaise,
        perKmPaise: input.perKmPaise,
        freeAbovePaise: input.freeAbovePaise,
        effectiveFrom: input.effectiveFrom,
      },
    )
    return created
  })
  res.status(201).json(feeDto(rule))
}

const ManagedZoneRef = registry.register("ManagedZone", ManagedZone)
const DistrictRef = registry.register("District", District)
const FeeRuleRef = registry.register("FeeRule", FeeRule)
const idParams = z.object({ id: z.string() })
const FeeRulePage = z.object({
  items: z.array(FeeRuleRef),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export const settingsRoutes = Router()
  .use(requireAuth, requirePermission("settings.manage"))
  .get("/districts", districts)
  .post("/districts", createDistrict)
  .patch("/districts/:id", updateDistrict)
  .delete("/districts/:id", deleteDistrict)
  .get("/districts", districts)
  .post("/districts", createDistrict)
  .patch("/districts/:id", updateDistrict)
  .get("/zones", zones)
  .post("/zones", createZone)
  .patch("/zones/:id", updateZone)
  .delete("/zones/:id", deleteZone)
  .get("/fees", fees)
  .post("/fees", createFee)
  .use("/surge", surgeRoutes)

registry.registerPath({
  method: "get",
  path: "/settings/districts",
  tags: ["Settings"],
  summary: "List districts with current zone counts",
  request: { query: DistrictQuery },
  responses: { 200: json(z.array(DistrictRef)), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/settings/districts",
  tags: ["Settings"],
  summary: "Create a district",
  request: { body: json(CreateDistrictRequest) },
  responses: { 201: json(DistrictRef), ...errors(400, 401, 403, 409) },
})
registry.registerPath({
  method: "patch",
  path: "/settings/districts/{id}",
  tags: ["Settings"],
  summary: "Update or deactivate a district",
  request: { params: idParams, body: json(UpdateDistrictRequest) },
  responses: { 200: json(DistrictRef), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "delete",
  path: "/settings/districts/{id}",
  tags: ["Settings"],
  summary: "Delete a district that has no zones or delivery companies",
  request: { params: idParams },
  responses: { 204: { description: "Deleted" }, ...errors(401, 403, 404, 409) },
})
registry.registerPath({
  method: "get",
  path: "/settings/zones",
  tags: ["Settings"],
  summary: "List all service areas including inactive areas",
  responses: { 200: json(z.array(ManagedZoneRef)), ...errors(401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/settings/zones",
  tags: ["Settings"],
  summary: "Create a service area",
  request: { body: json(CreateZoneRequest) },
  responses: { 201: json(ManagedZoneRef), ...errors(400, 401, 403, 409) },
})
registry.registerPath({
  method: "patch",
  path: "/settings/zones/{id}",
  tags: ["Settings"],
  summary: "Update or deactivate a service area",
  request: { params: idParams, body: json(UpdateZoneRequest) },
  responses: { 200: json(ManagedZoneRef), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "delete",
  path: "/settings/zones/{id}",
  tags: ["Settings"],
  summary: "Delete a service area that nothing refers to",
  request: { params: idParams },
  responses: { 204: { description: "Deleted" }, ...errors(401, 403, 404, 409) },
})
registry.registerPath({
  method: "get",
  path: "/settings/fees",
  tags: ["Settings"],
  summary: "List versioned delivery fee rules",
  request: { query: FeeQuery },
  responses: { 200: json(FeeRulePage), ...errors(400, 401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/settings/fees",
  tags: ["Settings"],
  summary: "Create a versioned delivery fee rule",
  request: { body: json(CreateFeeRuleRequest) },
  responses: { 201: json(FeeRuleRef), ...errors(400, 401, 403, 404) },
})
