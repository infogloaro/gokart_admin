"use client"
import { useEffect, useRef, useState, type ReactNode } from "react"

export interface FinanceTabProps {
  workspaceId: string
  cycle: string | undefined
  version: number
  onChanged: () => void
}

export function useFinanceData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load data.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, deps)

  return { data, loading, error }
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? <div className="revenue-error">⚠ {message}</div> : null
}

export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="fin-panel">
      <header className="fin-panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action ?? <i aria-hidden="true">⋯</i>}
      </header>
      {children}
    </section>
  )
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fin-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="fin-modal" role="dialog" aria-label={title}>
        <header>
          <h3>{title}</h3>
          <button type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="fin-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Paid" || status === "Settled"
      ? "good"
      : status === "Overdue" || status === "Rejected"
        ? "bad"
        : status === "Approved"
          ? "info"
          : "warn"
  return <span className={`fin-pill fin-pill-${tone}`}>{status}</span>
}

export function BusinessTag({ tag }: { tag: string }) {
  return <span className={`admin-tag admin-tag-${tag.toLowerCase()}`}>{tag}</span>
}

export function Kpi({
  label,
  value,
  caption,
  tone,
}: {
  label: string
  value: string
  caption: string
  tone?: "warn" | "good"
}) {
  return (
    <article className={`fin-kpi${tone ? ` fin-kpi-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  )
}

export function Loading({ loading, empty }: { loading: boolean; empty: string }) {
  return <p className="fin-empty">{loading ? "Loading…" : empty}</p>
}

export function useAction(onChanged: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(task: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    setError(null)
    try {
      await task()
      onChanged()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, run, clearError: () => setError(null) }
}
