// GLOARO MART products and stock, scoped to the member's zones. Stock changes are
// version-checked and audited; going out of stock tells the zone's admins.
import {
  ProductListQuery,
  ProductStatusRequest,
  StockAdjustRequest,
  type InventorySummary,
  type Product,
} from "@zoauro/shared"
import { Router, type Request, type Response } from "express"
import { Prisma } from "../../generated/prisma/client"
import { audit } from "../../lib/audit"
import { conflict, forbidden, notFound, parse } from "../../lib/errors"
import { linkFor, membersFor, notify } from "../../lib/notify"
import { prisma } from "../../lib/prisma"
import { actorOf, requireAuth, requirePermission, scope } from "../../middleware/auth"

type Row = Prisma.ProductGetPayload<object>

/** Mart only; Food has no product catalogue here. */
function martScope(req: Request) {
  const s = scope(req, "mart")
  return s.zoneIds ? { zoneId: { in: s.zoneIds } } : {}
}

async function withVendors(rows: Row[]): Promise<Product[]> {
  const vendors = await prisma.vendor.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.vendorId))] } },
    select: { id: true, name: true },
  })
  const name = new Map(vendors.map((v) => [v.id, v.name]))
  return rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    vendorId: p.vendorId,
    vendorName: name.get(p.vendorId) ?? "—",
    zoneId: p.zoneId,
    name: p.name,
    category: p.category,
    pricePaise: p.pricePaise,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    status: p.status,
    version: p.version,
    updatedAt: p.updatedAt.toISOString(),
  }))
}

async function list(req: Request, res: Response) {
  const q = parse(ProductListQuery, req.query)
  const base = martScope(req)
  // "low" compares two columns, which Prisma can't express in a where; filter ids in SQL.
  let lowIds: string[] | undefined
  if (q.stock === "low") {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "products" WHERE "stock" > 0 AND "stock" <= "lowStockThreshold"`
    lowIds = rows.map((r) => r.id)
  }
  const where: Prisma.ProductWhereInput = {
    ...base,
    ...(q.status && { status: q.status }),
    ...(q.vendorId && { vendorId: q.vendorId }),
    ...(q.stock === "out" && { stock: { lte: 0 } }),
    ...(q.stock === "in" && { stock: { gt: 0 } }),
    ...(lowIds && { id: { in: lowIds } }),
    ...(q.search && {
      OR: [
        { name: { contains: q.search, mode: "insensitive" } },
        { sku: { contains: q.search, mode: "insensitive" } },
        { category: { contains: q.search, mode: "insensitive" } },
      ],
    }),
  }
  const [rows, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: [{ stock: "asc" }, { name: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.product.count({ where }),
  ])
  res.json({ items: await withVendors(rows), total, page: q.page })
}

async function summary(req: Request, res: Response) {
  const base = martScope(req)
  const zones = (base as { zoneId?: { in: string[] } }).zoneId?.in ?? null
  const [products, active, out, agg] = await Promise.all([
    prisma.product.count({ where: base }),
    prisma.product.count({ where: { ...base, status: "active" } }),
    prisma.product.count({ where: { ...base, stock: { lte: 0 } } }),
    prisma.$queryRaw<{ low: number; value: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE "stock" > 0 AND "stock" <= "lowStockThreshold")::int AS low,
        COALESCE(SUM(GREATEST("stock", 0)::bigint * "pricePaise"), 0)::bigint AS value
      FROM "products"
      WHERE ${zones ? Prisma.sql`"zoneId" = ANY(${zones}::text[])` : Prisma.sql`TRUE`}`,
  ])
  const body: InventorySummary = {
    products,
    active,
    lowStock: agg[0]?.low ?? 0,
    outOfStock: out,
    stockValuePaise: Number(agg[0]?.value ?? 0),
  }
  res.json(body)
}

async function load(req: Request<{ id: string }>) {
  const p = await prisma.product.findFirst({ where: { id: req.params.id, ...martScope(req) } })
  if (!p) throw notFound("Product")
  return p
}

const reasonText: Record<string, string> = {
  restock: "Restocked",
  sold_offline: "Sold offline",
  damaged: "Damaged or expired",
  count_correction: "Stock count corrected",
}

async function adjust(req: Request<{ id: string }>, res: Response) {
  const body = parse(StockAdjustRequest, req.body)
  const p = await load(req)
  if (p.stock + body.change < 0)
    throw conflict(`Only ${p.stock} in stock; you can remove at most ${p.stock}.`)
  const actor = actorOf(req)
  const updated = await prisma.$transaction(async (tx) => {
    const done = await tx.product.updateMany({
      where: { id: p.id, version: body.version },
      data: { stock: { increment: body.change }, version: { increment: 1 } },
    })
    if (!done.count) throw conflict("Stock changed while you were editing. Reload and try again.")
    await audit(
      tx,
      actor,
      "inventory.stock_adjusted",
      { type: "product", id: p.id },
      {
        sku: p.sku,
        from: p.stock,
        to: p.stock + body.change,
        reason: body.reason,
      },
    )
    if (p.stock > 0 && p.stock + body.change === 0) {
      const members = await membersFor(tx, "mart", p.zoneId, { adminsOnly: true })
      for (const m of members)
        await notify(
          tx,
          [m.id],
          {
            title: `${p.name} is out of stock`,
            body: `${p.sku} · ${reasonText[body.reason]}`,
            link: linkFor(m.role, "mart", "inventory", `search=${p.sku}`),
          },
          actor.id,
        )
    }
    return tx.product.findUniqueOrThrow({ where: { id: p.id } })
  })
  res.json((await withVendors([updated]))[0])
}

async function setStatus(req: Request<{ id: string }>, res: Response) {
  const body = parse(ProductStatusRequest, req.body)
  const p = await load(req)
  const actor = actorOf(req)
  const updated = await prisma.$transaction(async (tx) => {
    const done = await tx.product.updateMany({
      where: { id: p.id, version: body.version },
      data: { status: body.status, version: { increment: 1 } },
    })
    if (!done.count)
      throw conflict("This product changed while you were editing. Reload and try again.")
    await audit(
      tx,
      actor,
      "inventory.status_changed",
      { type: "product", id: p.id },
      {
        sku: p.sku,
        from: p.status,
        to: body.status,
      },
    )
    return tx.product.findUniqueOrThrow({ where: { id: p.id } })
  })
  res.json((await withVendors([updated]))[0])
}

const mart: (req: Request, res: Response, next: () => void) => void = (req, _res, next) => {
  if (!req.member?.businesses.includes("mart")) throw forbidden("Inventory is part of GLOARO MART.")
  next()
}

export const inventoryRoutes = Router()
  .use(requireAuth, mart)
  .get("/", requirePermission("inventory.view"), list)
  .get("/summary", requirePermission("inventory.view"), summary)
  .post("/:id/stock", requirePermission("inventory.manage"), adjust)
  .post("/:id/status", requirePermission("inventory.manage"), setStatus)
