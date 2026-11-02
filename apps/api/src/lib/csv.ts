// Minimal CSV reading and writing for bulk export and import. Handles quoted fields with commas,
// quotes and line breaks. Values are never evaluated as formulas: a leading = + - @ is prefixed.

const FORMULA_START = /^[=+\-@]/

function cell(value: unknown) {
  if (value === null || value === undefined) return ""
  let text = String(value)
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Rows to CSV text with a header line. */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T & string)[]) {
  const lines = [columns.join(",")]
  for (const row of rows) lines.push(columns.map((column) => cell(row[column])).join(","))
  return `${lines.join("\r\n")}\r\n`
}

/** CSV text to rows keyed by the header line. Blank lines are skipped. */
export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      records.push(row)
      row = []
      field = ""
    } else field += char
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    records.push(row)
  }
  const [header, ...body] = records.filter((line) => line.some((value) => value.trim() !== ""))
  if (!header) return []
  const keys = header.map((key) => key.trim())
  return body.map((line) =>
    Object.fromEntries(keys.map((key, index) => [key, (line[index] ?? "").trim()])),
  )
}
