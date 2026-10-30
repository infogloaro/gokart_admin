import { Permission, rolePermissions, type Permission as PermissionKey } from "@zoauro/shared"
import {
  AdminMember,
  AdminMemberListQuery,
  CreateAdminRequest,
  UpdateAdminRequest,
} from "@zoauro/shared"
import { hash } from "@node-rs/argon2"
import { Router, type Request, type Response } from "express"
import { Prisma } from "../../generated/prisma/client"
import { audit } from "../../lib/audit"
import { conflict, forbidden, notFound, parse } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { actorOf, currentMember, requireAuth, requirePermission } from "../../middleware/auth"
import { errors, json, registry } from "../../openapi/registry"
import { z } from "zod"

const memberInclude = {
  businesses: true,
  zones: {
    include: { zone: { select: { id: true, district: true, city: true, location: true } } },
  },
  permissions: true,
} satisfies Prisma.MemberInclude

type MemberRow = Prisma.MemberGetPayload<{ include: typeof memberInclude }>

function assertSuperAdmin(req: Request) {
  if (currentMember(req).role !== "super_admin") throw forbidden()
}

function assertAdminPermissions(permissions: PermissionKey[]) {
  if (permissions.some((permission) => !rolePermissions.admin.includes(permission)))
    throw forbidden("Admin accounts cannot be granted Super Admin-only permissions.")
}

function toAdmin(member: MemberRow) {
  return AdminMember.parse({
    id: member.id,
    name: member.name,
    email: member.email,
    status: member.status,
    businesses: member.businesses.map((entry) => entry.business),
    zones: member.zones.map((entry) => entry.zone),
    permissions: member.permissions
      .map((entry) => entry.permission)
      .filter(
        (permission): permission is PermissionKey => Permission.safeParse(permission).success,
      ),
    createdAt: member.createdAt.toISOString(),
    lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
    authenticatorEnabled: member.totpEnabled,
  })
}

async function validateZones(zoneIds: string[]) {
  const ids = [...new Set(zoneIds)]
  const zones = await prisma.zone.findMany({
    where: { id: { in: ids }, active: true },
    select: { id: true },
  })
  if (zones.length !== ids.length) throw notFound("One or more active service areas")
  return ids
}

async function list(req: Request, res: Response) {
  assertSuperAdmin(req)
  const query = parse(AdminMemberListQuery, req.query)
  const members = await prisma.member.findMany({
    where: {
      role: "admin",
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: memberInclude,
    orderBy: [{ status: "asc" }, { name: "asc" }],
  })
  res.json(members.map(toAdmin))
}

async function create(req: Request, res: Response) {
  assertSuperAdmin(req)
  const input = parse(CreateAdminRequest, req.body)
  assertAdminPermissions(input.permissions)
  const zoneIds = await validateZones(input.zoneIds)
  if (await prisma.member.findUnique({ where: { email: input.email }, select: { id: true } }))
    throw conflict("An account already uses this email address.")
  const passwordHash = await hash(input.password)
  try {
    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.member.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: "admin",
          businesses: { createMany: { data: input.businesses.map((business) => ({ business })) } },
          zones: { createMany: { data: zoneIds.map((zoneId) => ({ zoneId })) } },
          permissions: {
            createMany: { data: input.permissions.map((permission) => ({ permission })) },
          },
        },
        include: memberInclude,
      })
      await audit(
        tx,
        actorOf(req),
        "member.created",
        { type: "member", id: created.id },
        {
          email: created.email,
          businesses: input.businesses,
          zoneIds,
          permissions: input.permissions,
        },
      )
      return created
    })
    res.status(201).json(toAdmin(member))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw conflict("An account already uses this email address.")
    throw error
  }
}

async function update(req: Request<{ id: string }>, res: Response) {
  assertSuperAdmin(req)
  const actor = actorOf(req)
  const input = parse(UpdateAdminRequest, req.body)
  assertAdminPermissions(input.permissions)
  if (req.params.id === actor.id && input.status === "disabled")
    throw forbidden("You can't disable your own account.")
  const zoneIds = await validateZones(input.zoneIds)
  const existing = await prisma.member.findUnique({
    where: { id: req.params.id },
    include: memberInclude,
  })
  if (!existing || existing.role !== "admin") throw notFound("Admin account")
  const member = await prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        status: input.status,
        businesses: {
          deleteMany: {},
          createMany: { data: input.businesses.map((business) => ({ business })) },
        },
        zones: {
          deleteMany: {},
          createMany: { data: zoneIds.map((zoneId) => ({ zoneId })) },
        },
        permissions: {
          deleteMany: {},
          createMany: { data: input.permissions.map((permission) => ({ permission })) },
        },
      },
      include: memberInclude,
    })
    await audit(
      tx,
      actor,
      "member.updated",
      { type: "member", id: updated.id },
      {
        before: {
          name: existing.name,
          status: existing.status,
          businesses: existing.businesses.map((entry) => entry.business),
          zoneIds: existing.zones.map((entry) => entry.zoneId),
          permissions: existing.permissions.map((entry) => entry.permission),
        },
        after: {
          name: input.name,
          status: input.status,
          businesses: input.businesses,
          zoneIds,
          permissions: input.permissions,
        },
      },
    )
    return updated
  })
  res.json(toAdmin(member))
}

const AdminMemberRef = registry.register("AdminMember", AdminMember)
const idParam = { params: z.object({ id: z.string() }) }
const tags = ["Members"]

export const memberRoutes = Router()
  .use(requireAuth, requirePermission("members.manage"))
  .get("/", list)
  .post("/", create)
  .patch("/:id", update)

registry.registerPath({
  method: "get",
  path: "/members",
  tags,
  summary: "List Admin accounts for Super Admin management",
  request: { query: AdminMemberListQuery },
  responses: { 200: json(z.array(AdminMemberRef)), ...errors(401, 403) },
})
registry.registerPath({
  method: "post",
  path: "/members",
  tags,
  summary: "Create a scoped Admin account",
  request: { body: json(CreateAdminRequest) },
  responses: { 201: json(AdminMemberRef), ...errors(400, 401, 403, 409) },
})
registry.registerPath({
  method: "patch",
  path: "/members/{id}",
  tags,
  summary: "Update an Admin account's access and status",
  request: { ...idParam, body: json(UpdateAdminRequest) },
  responses: { 200: json(AdminMemberRef), ...errors(400, 401, 403, 404) },
})
