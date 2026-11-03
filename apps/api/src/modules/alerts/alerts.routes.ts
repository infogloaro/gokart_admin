// Alerts page API: list open or resolved alerts for the member, with today's unusual order
// volume, and mark an alert resolved. GET /alerts, POST /alerts/:id/resolve (dashboard.view).
import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { notFound, parse } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { currentMember, requireAuth, requirePermission, scope } from "../../middleware/auth"
import { zoneInsights } from "../reports/insights"
import { visibleTo } from "./alerts"

const KIND = z.enum([
  "delayed_order",
  "payment_failed",
  "vendor_issue",
  "security",
  "document_expiry",
])

const ListQuery = z.object({
  status: z.enum(["open", "resolved"]).default("open"),
  kind: KIND.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})

async function list(req: Request, res: Response) {
  const q = parse(ListQuery, req.query)
  const s = scope(req)
  const where = { ...visibleTo(s, q.status), ...(q.kind && { kind: q.kind }) }
  const [rows, total, openCount, byKind] = await Promise.all([
    prisma.operationalAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.operationalAlert.count({ where }),
    prisma.operationalAlert.count({ where: visibleTo(s, "open") }),
    Promise.all(
      KIND.options.map((kind) =>
        prisma.operationalAlert.count({ where: { ...visibleTo(s, "open"), kind } }),
      ),
    ),
  ])
  const counts = Object.fromEntries(KIND.options.map((kind, i) => [kind, byKind[i] ?? 0]))
  const volume = (await zoneInsights(s)).filter((zone) => zone.flagged)
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      business: row.business,
      zoneId: row.zoneId,
      title: row.title,
      body: row.body,
      link: row.link,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    openCount,
    counts,
    volume,
  })
}

const ResolveMany = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) })

async function resolveMany(req: Request, res: Response) {
  const { ids } = parse(ResolveMany, req.body)
  const result = await prisma.operationalAlert.updateMany({
    where: { id: { in: ids }, resolvedAt: null, ...visibleTo(scope(req), "open") },
    data: { resolvedAt: new Date(), resolvedById: currentMember(req).id },
  })
  res.json({ resolved: result.count })
}

async function resolve(req: Request<{ id: string }>, res: Response) {
  const s = scope(req)
  const row = await prisma.operationalAlert.findFirst({
    where: { id: req.params.id, ...visibleTo(s, "open") },
    select: { id: true, resolvedAt: true },
  })
  if (!row) throw notFound("Alert")
  if (!row.resolvedAt)
    await prisma.operationalAlert.update({
      where: { id: row.id },
      data: { resolvedAt: new Date(), resolvedById: currentMember(req).id },
    })
  res.status(204).end()
}

export const alertRoutes = Router()
  .use(requireAuth, requirePermission("dashboard.view"))
  .get("/", list)
  .post("/resolve-many", resolveMany)
  .post("/:id/resolve", resolve)
