// Bulk export of vendors and GLOARO MART products as CSV, and bulk import of products from CSV.
// Everything is scoped to the member's businesses and zones, and an import is audited once.
import { Router, type Request, type Response } from "express"
import express from "express"
import { z } from "zod"
import { audit } from "../../lib/audit"
import { badRequest, forbidden } from "../../lib/errors"
import { parseCsv } from "../../lib/csv"
import { sendTable, type ExportFormat } from "../../lib/export"
import { prisma } from "../../lib/prisma"
import { actorOf, requireAuth, requirePermission, scope } from "../../middleware/auth"

const MAX_IMPORT_ROWS = 500

const VENDOR_COLUMNS = ["code", "name", "business", "status", "verification"] as const
const PRODUCT_COLUMNS = [
  "sku",
  "name",
  "category",
  "vendorId",
  "zoneId",
  "pricePaise",
  "stock",
  "lowStockThreshold",
  "status",
] as const

const martOnly = (req: Request, _res: Response, next: () => void) => {
  if (!req.member?.businesses.includes("mart")) throw forbidden("Products are part of GLOARO MART.")
  next()
}

/** Vendors in the member's scope, as CSV or Excel. */
async function vendorsExport(req: Request, res: Response, format: ExportFormat) {
  const s = scope(req)
  const vendors = await prisma.vendor.findMany({
    where: {
      business: { in: s.businesses },
      ...(s.zoneIds && { zoneId: { in: s.zoneIds } }),
    },
    select: { code: true, name: true, business: true, status: true, verification: true },
    orderBy: { code: "asc" },
    take: 10_000,
  })
  await sendTable(res, format, "vendors", VENDOR_COLUMNS, vendors)
}

/** GLOARO MART products in the member's zones, as CSV or Excel. */
async function productsExport(req: Request, res: Response, format: ExportFormat) {
  const s = scope(req, "mart")
  const products = await prisma.product.findMany({
    where: s.zoneIds ? { zoneId: { in: s.zoneIds } } : {},
    select: {
      sku: true,
      name: true,
      category: true,
      vendorId: true,
      zoneId: true,
      pricePaise: true,
      stock: true,
      lowStockThreshold: true,
      status: true,
    },
    orderBy: { sku: "asc" },
    take: 10_000,
  })
  await sendTable(res, format, "products", PRODUCT_COLUMNS, products)
}

/** One row of a product import. Price is given in rupees, e.g. 49.50. */
const ProductRow = z.object({
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(1).max(60),
  vendorId: z.string().trim().min(1),
  zoneId: z.string().trim().min(1),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/),
  stock: z.string().regex(/^\d+$/),
  lowStockThreshold: z.string().regex(/^\d+$/).optional().default("10"),
})

async function importProducts(req: Request, res: Response) {
  const s = scope(req, "mart")
  const text = typeof req.body === "string" ? req.body : ""
  const lines = parseCsv(text)
  if (lines.length === 0) throw badRequest("The file has no product rows.")
  if (lines.length > MAX_IMPORT_ROWS)
    throw badRequest(`Import at most ${MAX_IMPORT_ROWS} products at a time.`)

  const skipped: { line: number; sku: string; reason: string }[] = []
  const valid: (z.infer<typeof ProductRow> & { line: number })[] = []
  const seen = new Set<string>()
  lines.forEach((raw, index) => {
    const line = index + 2 // header is line 1
    const parsed = ProductRow.safeParse(raw)
    if (!parsed.success) {
      skipped.push({
        line,
        sku: raw.sku ?? "",
        reason: parsed.error.issues[0]?.message ?? "Invalid row",
      })
      return
    }
    const row = parsed.data
    if (seen.has(row.sku))
      return skipped.push({ line, sku: row.sku, reason: "Duplicate SKU in this file" })
    seen.add(row.sku)
    if (s.zoneIds && !s.zoneIds.includes(row.zoneId))
      return skipped.push({ line, sku: row.sku, reason: "Zone is not one you manage" })
    valid.push({ ...row, line })
  })

  const [existing, vendors] = await Promise.all([
    prisma.product.findMany({
      where: { sku: { in: valid.map((row) => row.sku) } },
      select: { sku: true },
    }),
    prisma.vendor.findMany({
      where: { id: { in: valid.map((row) => row.vendorId) }, business: "mart" },
      select: { id: true },
    }),
  ])
  const taken = new Set(existing.map((row) => row.sku))
  const vendorIds = new Set(vendors.map((vendor) => vendor.id))
  const toCreate = valid.filter((row) => {
    if (taken.has(row.sku)) {
      skipped.push({ line: row.line, sku: row.sku, reason: "SKU already exists" })
      return false
    }
    if (!vendorIds.has(row.vendorId)) {
      skipped.push({ line: row.line, sku: row.sku, reason: "Vendor is not a GLOARO MART vendor" })
      return false
    }
    return true
  })

  await prisma.$transaction(async (tx) => {
    if (toCreate.length)
      await tx.product.createMany({
        data: toCreate.map((row) => ({
          sku: row.sku,
          name: row.name,
          category: row.category,
          vendorId: row.vendorId,
          zoneId: row.zoneId,
          pricePaise: Math.round(Number(row.price) * 100),
          stock: Number(row.stock),
          lowStockThreshold: Number(row.lowStockThreshold),
        })),
      })
    await audit(
      tx,
      actorOf(req),
      "product.imported",
      { type: "product", id: "bulk" },
      { created: toCreate.length, skipped: skipped.length },
    )
  })
  res.json({ created: toCreate.length, skipped })
}

export const bulkRoutes = Router()
  .use(requireAuth)
  .get("/vendors.csv", requirePermission("vendors.view"), (req, res) =>
    vendorsExport(req, res, "csv"),
  )
  .get("/vendors.xlsx", requirePermission("vendors.view"), (req, res) =>
    vendorsExport(req, res, "xlsx"),
  )
  .get("/products.csv", requirePermission("inventory.view"), martOnly, (req, res) =>
    productsExport(req, res, "csv"),
  )
  .get("/products.xlsx", requirePermission("inventory.view"), martOnly, (req, res) =>
    productsExport(req, res, "xlsx"),
  )
  .post(
    "/products/import",
    requirePermission("inventory.manage"),
    martOnly,
    express.text({ type: ["text/csv", "text/plain"], limit: "1mb" }),
    importProducts,
  )
