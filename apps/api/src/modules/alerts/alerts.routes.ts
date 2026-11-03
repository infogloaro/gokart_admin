// Alerts page API: list open or resolved alerts for the member, with today's unusual order
// volume, and mark an alert resolved. GET /alerts, POST /alerts/:id/resolve (dashboard.view).
import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { notFound, parse } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { currentMember, requireAuth, requirePermission, scope } from "../../middleware/auth"
import { zoneInsights } from "../reports/insights"
import { visibleTo } from "./alerts"

const ListQuery = z.object({
  status: z.enum(["open", "resolved"]).default("open"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})

async function list(req: Request, res: Response) {
  const q = parse(ListQuery, req.query)
  const s = scope(req)
  const where = visibleTo(s, q.status)
  const [rows, total, openCount] = await prisma.$transaction([
    prisma.operationalAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.operationalAlert.count({ where }),
    prisma.operationalAlert.count({ where: visibleTo(s, "open") }),
  ])
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
    volume,
  })
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
  .post("/:id/resolve", resolve)
