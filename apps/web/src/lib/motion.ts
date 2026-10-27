"use client"
// Small motion helpers for dashboards. Everything respects prefers-reduced-motion.
import { useEffect, useRef, useState } from "react"

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/** Animates a number from its previous value to `target` (ease-out, ~600 ms). */
export function useCountUp(target: number | undefined, duration = 600) {
  const [value, setValue] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (target === undefined) return
    if (prefersReducedMotion()) {
      from.current = target
      setValue(target)
      return
    }
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(begin + (target - begin) * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
      else from.current = target
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return target === undefined ? undefined : value
}

/** "just now", "12s ago", "3 min ago" — re-rendered every few seconds. */
export function useSince(ms: number | undefined) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])
  if (!ms) return "—"
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}

/** Downloads text as a file in the browser. */
export function download(fileName: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName })
  a.click()
  URL.revokeObjectURL(url)
}
