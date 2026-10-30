import { AuditLogEntry, AuditLogQuery } from "@zoauro/shared"
import { Router, type Request, type Response } from "express"
import { prisma } from "../../lib/prisma"
import { currentMember, requireAuth, requirePermission } from "../../middleware/auth"
import { errors, json, registry } from "../../openapi/registry"
import { forbidden, parse } from "../../lib/errors"
import { z } from "zod"
import type { Prisma } from "../../generated/prisma/client"

async function list(req: Request, res: Response) {
  if (currentMember(req).role !== "super_admin") throw forbidden()
  const query = parse(AuditLogQuery, req.query)
  const search = query.search
  const actionFilter = query.module
    ? query.module === "zone"
      ? { startsWith: "zone." }
      : query.module === "fee_rule"
        ? { startsWith: "fee_rule." }
        : { startsWith: `${query.module}.` }
    : undefined
  const and: Prisma.AuditLogWhereInput[] = []
  if (query.actor) {
    and.push({
      OR: [
        { actorName: { contains: query.actor, mode: "insensitive" } },
        { actorId: { contains: query.actor, mode: "insensitive" } },
      ],
    })
  }
  if (query.action) and.push({ action: { contains: query.action, mode: "insensitive" } })
  if (search) {
    and.push({
      OR: [
        { actorName: { contains: search, mode: "insensitive" } },
        { actorId: { contains: search, mode: "insensitive" } },
        { actorRole: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
        { entityType: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
        { source: { contains: search, mode: "insensitive" } },
        { ip: { contains: search, mode: "insensitive" } },
      ],
    })
  }
  const where: Prisma.AuditLogWhereInput = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(query.role ? { actorRole: query.role } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.ip ? { ip: { contains: query.ip, mode: "insensitive" as const } } : {}),
    ...(query.from || query.to
      ? {
          at: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to
              ? { lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000) }
              : {}),
          },
        }
      : {}),
    ...(and.length ? { AND: and } : {}),
  }
  const [total, successfulSignIns, administrativeChanges, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { AND: [where, { action: "auth.signed_in" }] } }),
    prisma.auditLog.count({
      where: { AND: [where, { NOT: { action: { startsWith: "auth." } } }] },
    }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])
  res.json({
    items: rows.map((row) =>
      AuditLogEntry.parse({
        ...row,
        at: row.at.toISOString(),
        detail: redactAuditDetail(row.detail),
      }),
    ),
    total,
    successfulSignIns,
    administrativeChanges,
    page: query.page,
    pageSize: query.pageSize,
  })
}

const sensitiveKey =
  /(password|token|secret|authorization|cookie|recovery.?code|code.?hash|credential|private.?key)/i

export function redactAuditDetail(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value
  if (typeof value === "string") return value.slice(0, 4000)
  if (depth >= 6) return "[truncated]"
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => redactAuditDetail(item, depth + 1))
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          sensitiveKey.test(key) ? "[redacted]" : redactAuditDetail(item, depth + 1),
        ]),
    )
  }
  return null
}

const AuditLogPage = z.object({
  items: z.array(AuditLogEntry),
  total: z.number().int(),
  successfulSignIns: z.number().int(),
  administrativeChanges: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export const auditRoutes = Router().use(requireAuth, requirePermission("audit.view")).get("/", list)

registry.registerPath({
  method: "get",
  path: "/audit",
  tags: ["Audit"],
  summary: "Search the administrative audit log",
  request: { query: AuditLogQuery },
  responses: { 200: json(AuditLogPage), ...errors(400, 401, 403) },
})
