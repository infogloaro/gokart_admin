"use client"
// Pieces shared by the Super Admin dashboards (vendors, delivery partners).
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useCountUp } from "@/lib/motion"

/** Renders children into the shell's page-head action slot once it exists. */
export function HeadActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(document.getElementById("page-head-actions")), [])
  return slot ? createPortal(children, slot) : null
}

/** A summary number that counts up when it first loads or changes. */
export function Count({ value }: { value: number | undefined }) {
  const n = useCountUp(value)
  return <b className="count-up">{n === undefined ? "—" : n.toLocaleString("en-IN")}</b>
}
