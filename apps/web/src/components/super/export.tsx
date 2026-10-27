"use client"
// CSV export with the prototype's notification ("Done · Your CSV export is being prepared."),
// shared by the vendor and partner screens.
import { ApiError } from "@zoauro/api-client"
import { useEffect, useState } from "react"
import { download } from "@/lib/motion"
import type { ToastMessage } from "./ui"

export function useCsvExport() {
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  // Notices close themselves after a few seconds; errors stay until dismissed.
  useEffect(() => {
    if (!toast || toast.tone === "error") return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  /** `build` returns the whole file; an empty result shows a warning instead of a download. */
  async function run(name: string, build: () => Promise<{ csv: string; count: number }>) {
    setExporting(true)
    try {
      const { csv, count } = await build()
      if (count === 0)
        return setToast({
          tone: "warning",
          title: "Nothing to export",
          message: "No records match the current filters.",
        })
      download(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, csv)
      setToast({ tone: "success", title: "Done", message: "Your CSV export is being prepared." })
    } catch (e) {
      setToast({
        tone: "error",
        title: "Export failed",
        message: e instanceof ApiError ? e.message : "Couldn't prepare the export. Try again.",
      })
    } finally {
      setExporting(false)
    }
  }

  return { exporting, toast, dismiss: () => setToast(null), run }
}
