import {
  CreateFeeRuleRequest,
  CreateZoneRequest,
  FeeRule,
  ManagedZone,
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

function assertSuperAdmin(req: Request) {
  if (currentMember(req).role !== "super_admin") throw forbidden()
}

function zoneDto(zone: {
  id: string
  district: string
  city: string
  location: string
  lat: number | null
  lng: number | null
  active: boolean
  createdAt: Date
}) {
  return ManagedZone.parse({ ...zone, createdAt: zone.createdAt.toISOString() })
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
    orderBy: [{ district: "asc" }, { city: "asc" }, { location: "asc" }],
  })
  res.json(rows.map(zoneDto))
}

async function createZone(req: Request, res: Response) {
  assertSuperAdmin(req)
  const input = parse(CreateZoneRequest, req.body)
  try {
    const zone = await prisma.$transaction(async (tx) => {
      const created = await tx.zone.create({ data: input })
      await audit(tx, actorOf(req), "zone.created", { type: "zone", id: created.id }, input)
      return created
    })
    res.status(201).json(zoneDto(zone))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("That service area already exists.")
    throw error
  }
}

async function updateZone(req: Request<{ id: string }>, res: Response) {
  assertSuperAdmin(req)
  const input = parse(UpdateZoneRequest, req.body)
  const previous = await prisma.zone.findUnique({ where: { id: req.params.id } })
  if (!previous) throw notFound("Service area")
  try {
    const zone = await prisma.$transaction(async (tx) => {
      const updated = await tx.zone.update({ where: { id: previous.id }, data: input })
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
    })
    res.json(zoneDto(zone))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("That service area already exists.")
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
  .get("/zones", zones)
  .post("/zones", createZone)
  .patch("/zones/:id", updateZone)
  .get("/fees", fees)
  .post("/fees", createFee)

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
