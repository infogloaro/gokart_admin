"use client"

import { Download, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { AdminButton } from "./ui"

type ImportResult = { created: number; skipped: { line: number; sku: string; reason: string }[] }

/** Export the product list as CSV, or import products from a CSV file. */
export function BulkProducts({ onImported }: { onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState("")

  const importFile = async (file: File) => {
    setBusy(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/v1/bulk/products/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: await file.text(),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? "The import couldn't be completed.")
      setResult(data as ImportResult)
      onImported()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import couldn't be completed.")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="bulk-products">
      <a className="btn" href="/api/v1/bulk/products.csv" download>
        <Download size={16} /> Export CSV
      </a>
      <AdminButton
        kind="secondary"
        icon={Upload}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Importing…" : "Import CSV"}
      </AdminButton>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importFile(file)
        }}
      />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {result && (
        <div role="status">
          <p>
            Imported {result.created} product{result.created === 1 ? "" : "s"}.
            {result.skipped.length > 0 && ` ${result.skipped.length} row(s) skipped:`}
          </p>
          {result.skipped.length > 0 && (
            <ul>
              {result.skipped.slice(0, 20).map((row) => (
                <li key={`${row.line}-${row.sku}`}>
                  Line {row.line} {row.sku && `(${row.sku})`}: {row.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
