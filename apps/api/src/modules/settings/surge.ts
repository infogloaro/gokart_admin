import {
  CreateSurgeRuleRequest,
  SetSurgeActiveRequest,
  SurgePreview,
  SurgePreviewRequest,
  SurgeRule,
  quoteDeliveryFee,
  type SurgeCandidate,
} from "@zoauro/shared"
import { Router, type Request, type Response } from "express"
import type { Prisma } from "../../generated/prisma/client"
import { audit } from "../../lib/audit"
import { badRequest, conflict, forbidden, notFound, parse } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { actorOf, currentMember } from "../../middleware/auth"
import { errors, json, registry } from "../../openapi/registry"
import { z } from "zod"

function assertSuperAdmin(req: Request) {
  if (currentMember(req).role !== "super_admin") throw forbidden()
}

const dateOnly = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)
const toDate = (value: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null)

type Row = Prisma.SurgeRuleGetPayload<{
  include: { zone: { select: { city: true; location: true } } }
}>

function surgeDto(row: Row) {
  return SurgeRule.parse({
    id: row.id,
    name: row.name,
    kind: row.kind,
    business: row.business,
    zoneId: row.zoneId,
    zoneName: row.zone ? `${row.zone.location}, ${row.zone.city}` : null,
    multiplierPercent: row.multiplierPercent,
    maxExtraPaise: row.maxExtraPaise,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    days: row.days,
    startsOn: dateOnly(row.startsOn),
    endsOn: dateOnly(row.endsOn),
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

async function assertZone(zoneId: string | null) {
  if (!zoneId) return
  const zone = await prisma.zone.findUnique({ where: { id: zoneId }, select: { active: true } })
  if (!zone?.active) throw notFound("Active service area")
}

const writeData = (input: CreateSurgeRuleRequest) => ({
  ...input,
  startsOn: toDate(input.startsOn),
  endsOn: toDate(input.endsOn),
})

async function list(req: Request, res: Response) {
  assertSuperAdmin(req)
  const rows = await prisma.surgeRule.findMany({
    include: { zone: { select: { city: true, location: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  })
  res.json(rows.map(surgeDto))
}

async function create(req: Request, res: Response) {
  assertSuperAdmin(req)
  const input = parse(CreateSurgeRuleRequest, req.body)
  await assertZone(input.zoneId)
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.surgeRule.create({
      data: { ...writeData(input), createdById: currentMember(req).id },
      include: { zone: { select: { city: true, location: true } } },
    })
    await audit(
      tx,
      actorOf(req),
      "fee_rule.surge_created",
      { type: "surge_rule", id: created.id },
      input,
    )
    return created
  })
  res.status(201).json(surgeDto(row))
}

async function update(req: Request<{ id: string }>, res: Response) {
  assertSuperAdmin(req)
  const input = parse(CreateSurgeRuleRequest, req.body)
  await assertZone(input.zoneId)
  const row = await prisma.$transaction(async (tx) => {
    const previous = await tx.surgeRule.findUnique({ where: { id: req.params.id } })
    if (!previous) throw notFound("Surge rule")
    const updated = await tx.surgeRule.update({
      where: { id: previous.id },
      data: writeData(input),
      include: { zone: { select: { city: true, location: true } } },
    })
    await audit(
      tx,
      actorOf(req),
      "fee_rule.surge_updated",
      { type: "surge_rule", id: previous.id },
      {
        before: {
          name: previous.name,
          multiplierPercent: previous.multiplierPercent,
          active: previous.active,
        },
        after: input,
      },
    )
    return updated
  })
  res.json(surgeDto(row))
}

async function setActive(req: Request<{ id: string }>, res: Response) {
  assertSuperAdmin(req)
  const { active } = parse(SetSurgeActiveRequest, req.body)
  const row = await prisma.$transaction(async (tx) => {
    const previous = await tx.surgeRule.findUnique({ where: { id: req.params.id } })
    if (!previous) throw notFound("Surge rule")
    const updated = await tx.surgeRule.update({
      where: { id: previous.id },
      data: { active },
      include: { zone: { select: { city: true, location: true } } },
    })
    await audit(
      tx,
      actorOf(req),
      active ? "fee_rule.surge_enabled" : "fee_rule.surge_disabled",
      { type: "surge_rule", id: previous.id },
      { name: previous.name },
    )
    return updated
  })
  res.json(surgeDto(row))
}

async function remove(req: Request<{ id: string }>, res: Response) {
  assertSuperAdmin(req)
  await prisma.$transaction(async (tx) => {
    const previous = await tx.surgeRule.findUnique({ where: { id: req.params.id } })
    if (!previous) throw notFound("Surge rule")
    await tx.surgeRule.delete({ where: { id: previous.id } })
    await audit(
      tx,
      actorOf(req),
      "fee_rule.surge_deleted",
      { type: "surge_rule", id: previous.id },
      {
        name: previous.name,
      },
    )
  })
  res.status(204).end()
}

/** Prices one delivery at `at`, with and without the rule being edited. */
async function preview(req: Request, res: Response) {
  assertSuperAdmin(req)
  const input = parse(SurgePreviewRequest, req.body)
  await assertZone(input.zoneId)
  const at = new Date(input.at)
  const feeWhere = { business: input.business, effectiveFrom: { lte: at } }
  const include = { zone: { select: { city: true, location: true } } }
  const order = [{ effectiveFrom: "desc" as const }, { createdAt: "desc" as const }]
  const feeRule =
    (input.zoneId
      ? await prisma.feeRule.findFirst({
          where: { ...feeWhere, zoneId: input.zoneId },
          orderBy: order,
          include,
        })
      : null) ??
    (await prisma.feeRule.findFirst({
      where: { ...feeWhere, zoneId: null },
      orderBy: order,
      include,
    }))
  if (!feeRule) throw conflict("No delivery fee rule is in effect for that business at that time.")

  const stored = await prisma.surgeRule.findMany({ where: { active: true } })
  const rules: SurgeCandidate[] = stored.map((row) => ({
    name: row.name,
    business: row.business,
    zoneId: row.zoneId,
    multiplierPercent: row.multiplierPercent,
    maxExtraPaise: row.maxExtraPaise,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    days: row.days,
    startsOn: dateOnly(row.startsOn),
    endsOn: dateOnly(row.endsOn),
    active: true,
  }))
  const priced = (surgeRules: SurgeCandidate[]) =>
    quoteDeliveryFee({
      fee: feeRule,
      distanceKm: input.distanceKm,
      cartPaise: input.cartPaise,
      surgeRules,
      business: input.business,
      zoneId: input.zoneId,
      at,
    })
  const without = priced(rules)
  const withDraft = input.draft
    ? priced([...rules, { ...input.draft, name: `${input.draft.name} (draft)`, active: true }])
    : without
  if (input.draft && input.draft.multiplierPercent < 101)
    throw badRequest("A surge multiplier must be above 100%.")

  res.json(
    SurgePreview.parse({
      feeRule: {
        id: feeRule.id,
        baseFeePaise: feeRule.baseFeePaise,
        perKmPaise: feeRule.perKmPaise,
        freeAbovePaise: feeRule.freeAbovePaise,
        effectiveFrom: feeRule.effectiveFrom.toISOString(),
        zoneName: feeRule.zone ? `${feeRule.zone.location}, ${feeRule.zone.city}` : null,
      },
      without: {
        subtotalPaise: without.subtotalPaise,
        totalPaise: without.totalPaise,
        freeDelivery: without.freeDelivery,
        matched: without.matched,
        surgeName: without.surge?.name ?? null,
        extraPaise: without.surge?.extraPaise ?? 0,
      },
      with: {
        baseFeePaise: withDraft.baseFeePaise,
        distanceFeePaise: withDraft.distanceFeePaise,
        subtotalPaise: withDraft.subtotalPaise,
        freeDelivery: withDraft.freeDelivery,
        matched: withDraft.matched,
        surgeName: withDraft.surge?.name ?? null,
        multiplierPercent: withDraft.surge?.multiplierPercent ?? null,
        extraPaise: withDraft.surge?.extraPaise ?? 0,
        capped: withDraft.surge?.capped ?? false,
        totalPaise: withDraft.totalPaise,
      },
    }),
  )
}

export const surgeRoutes = Router()
  .get("/", list)
  .post("/", create)
  .post("/preview", preview)
  .put("/:id", update)
  .patch("/:id/active", setActive)
  .delete("/:id", remove)

const idParams = z.object({ id: z.string() })
const tags = ["Settings"]
registry.registerPath({
  method: "get",
  path: "/settings/surge",
  tags,
  summary: "List surge pricing rules",
  responses: { 200: json(z.array(SurgeRule)), ...errors(401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/settings/surge",
  tags,
  summary: "Create a surge pricing rule",
  request: { body: json(CreateSurgeRuleRequest) },
  responses: { 201: json(SurgeRule), ...errors(400, 401, 403, 404) },
})
registry.registerPath({
  method: "post",
  path: "/settings/surge/preview",
  tags,
  summary: "Price a delivery with and without a draft surge rule",
  request: { body: json(SurgePreviewRequest) },
  responses: { 200: json(SurgePreview), ...errors(400, 401, 403, 404, 409) },
})
registry.registerPath({
  method: "put",
  path: "/settings/surge/{id}",
  tags,
  summary: "Replace a surge pricing rule",
  request: { params: idParams, body: json(CreateSurgeRuleRequest) },
  responses: { 200: json(SurgeRule), ...errors(400, 401, 403, 404) },
})
registry.registerPath({
  method: "patch",
  path: "/settings/surge/{id}/active",
  tags,
  summary: "Switch a surge pricing rule on or off",
  request: { params: idParams, body: json(SetSurgeActiveRequest) },
  responses: { 200: json(SurgeRule), ...errors(400, 401, 403, 404) },
})
registry.registerPath({
  method: "delete",
  path: "/settings/surge/{id}",
  tags,
  summary: "Delete a surge pricing rule",
  request: { params: idParams },
  responses: { 204: { description: "Deleted" }, ...errors(401, 403, 404) },
})
