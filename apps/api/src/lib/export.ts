// One place for table exports: the same rows as CSV (opens in any spreadsheet app) or as a
// real Excel workbook. Cells are plain values, so nothing is evaluated as a formula in Excel.
import ExcelJS from "exceljs"
import type { Request, Response } from "express"
import { z } from "zod"
import { toCsv } from "./csv"
import { parse } from "./errors"

export type ExportFormat = "csv" | "xlsx"

const ExportFormatQuery = z.enum(["csv", "xlsx"]).default("csv")

/** Byte-order mark: tells Excel the CSV is UTF-8, so names keep their letters. */
const BOM = String.fromCharCode(0xfeff)

/** `?format=xlsx` asks for Excel; anything else is CSV. */
export function exportFormat(req: Request): ExportFormat {
  return parse(ExportFormatQuery, req.query.format ?? undefined)
}

const MIME = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const

/** Sends the rows as an attachment named `<name>.<format>`. */
export async function sendTable(
  res: Response,
  format: ExportFormat,
  name: string,
  columns: readonly string[],
  rows: Record<string, unknown>[],
) {
  res.setHeader("Content-Type", MIME[format])
  res.setHeader("Content-Disposition", `attachment; filename="${name}.${format}"`)
  if (format === "csv") {
    res.send(BOM + toCsv(rows, [...columns]))
    return
  }
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "GoKart Admin"
  workbook.created = new Date()
  const sheet = workbook.addWorksheet(name.slice(0, 31))
  sheet.columns = columns.map((column) => ({ header: column, key: column, width: 18 }))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  for (const row of rows) sheet.addRow(row)
  res.send(Buffer.from(await workbook.xlsx.writeBuffer()))
}
