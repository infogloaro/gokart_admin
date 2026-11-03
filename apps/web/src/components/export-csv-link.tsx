"use client"

import { Download } from "lucide-react"

/** Downloads a CSV export from the API. The file is scoped to what the signed-in member can see. */
export function ExportCsvLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="btn" href={href} download>
      <Download size={15} /> {label}
    </a>
  )
}
