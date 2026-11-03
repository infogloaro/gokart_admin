"use client"

import { ApiError } from "@zoauro/api-client"
import type { Business } from "@zoauro/shared"
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Clock,
  IdCard,
  CreditCard,
  Search,
  ShieldAlert,
  Store,
  Timer,
  TrendingUp,
  X,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState, type ReactNode } from "react"
import { useAlerts, useResolveAlerts, type AlertKindFilter, type AlertStatus } from "@/lib/alerts"

type Kind = "delayed_order" | "payment_failed" | "vendor_issue" | "security" | "document_expiry"

const KIND_META: Record<Kind, { label: string; icon: typeof Timer; severity: "high" | "medium" }> =
  {
    delayed_order: { label: "Delayed order", icon: Timer, severity: "medium" },
    payment_failed: { label: "Payment failed", icon: CreditCard, severity: "high" },
    vendor_issue: { label: "Vendor issue", icon: Store, severity: "medium" },
    security: { label: "Security", icon: ShieldAlert, severity: "high" },
    document_expiry: { label: "Licence expiry", icon: IdCard, severity: "medium" },
  }

const KIND_ORDER: Kind[] = [
  "delayed_order",
  "payment_failed",
  "vendor_issue",
  "document_expiry",
  "security",
]
const OVERDUE_MS = 2 * 60 * 60 * 1000

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })

function dayLabel(iso: string, now: number) {
  const key = dayKey(iso)
  if (key === dayKey(new Date(now).toISOString())) return "Today"
  if (key === dayKey(new Date(now - 86_400_000).toISOString())) return "Yesterday"
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function ago(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.round(hours / 24)} d ago`
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })

/**
 * Operational alerts for the portal. Super Admins see every business; an admin page shows its
 * business only. Filters, search, bulk resolve and unusual volume help the team triage quickly.
 */
export function AlertsPage({
  business,
  portal,
}: {
  business?: Business
  portal: "super" | "admin"
}) {
  const [status, setStatus] = useState<AlertStatus>("open")
  const [kind, setKind] = useState<AlertKindFilter | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState("")
  const alerts = useAlerts(status, page, kind)
  const resolve = useResolveAlerts()
  const now = Date.now()

  const items = useMemo(() => {
    const scoped = (alerts.data?.items ?? []).filter(
      (alert) => !business || alert.business === business,
    )
    const term = query.trim().toLowerCase()
    return term
      ? scoped.filter((alert) => `${alert.title} ${alert.body}`.toLowerCase().includes(term))
      : scoped
  }, [alerts.data, business, query])

  const groups = useMemo(() => {
    const map = new Map<string, typeof items>()
    for (const alert of items) {
      const label = dayLabel(alert.createdAt, now)
      map.set(label, [...(map.get(label) ?? []), alert])
    }
    return [...map.entries()]
  }, [items, now])

  const counts = alerts.data?.counts ?? {}
  const total = alerts.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 30))
  const openCount = alerts.data?.openCount ?? 0
  const volume = alerts.data?.volume ?? []
  const maxToday = Math.max(1, ...volume.map((zone) => zone.today))
  const openIds = items.filter((alert) => !alert.resolvedAt).map((alert) => alert.id)
  const allSelected = openIds.length > 0 && openIds.every((id) => selected.has(id))

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const resolveIds = (ids: string[]) => {
    setError("")
    resolve.mutate(ids, {
      onSuccess: () => setSelected(new Set()),
      onError: (cause) =>
        setError(
          cause instanceof ApiError ? cause.message : "Couldn’t mark them resolved. Try again.",
        ),
    })
  }

  const kindChip = (value: AlertKindFilter | undefined, label: string, count: number) => (
    <button
      key={label}
      type="button"
      className={`ops-chip${kind === value ? " active" : ""}`}
      aria-pressed={kind === value}
      onClick={() => {
        setKind(value)
        setPage(1)
      }}
    >
      {label}
      <b>{count}</b>
    </button>
  )

  return (
    <div className={`alerts-page ${portal}`}>
      <header className="ops-head">
        {/* The super admin shell already shows the page title; the admin page needs its own. */}
        {portal === "admin" ? (
          <div>
            <span className="ops-eyebrow">Your zones</span>
            <h1>Alerts</h1>
            <p>
              Problems that need action. Each is recorded once a day and stays until it is resolved.
            </p>
          </div>
        ) : (
          <p className="ops-lede">
            Each problem is recorded once a day and stays until someone resolves it.
          </p>
        )}
        <div className="ops-head-meta">
          <span className="ops-live" aria-live="polite">
            <i /> Live · updated {clock(new Date(now).toISOString())}
          </span>
          {selected.size > 0 && (
            <button
              type="button"
              className="ops-btn primary"
              disabled={resolve.isPending}
              onClick={() => resolveIds([...selected])}
            >
              <BadgeCheck size={15} /> Resolve {selected.size} selected
            </button>
          )}
        </div>
      </header>

      <section className="ops-tiles" aria-label="Open alerts by type">
        <Tile
          label="Open alerts"
          value={openCount}
          tone="navy"
          icon={<Bell size={18} />}
          active={!kind}
          onClick={() => setKind(undefined)}
        />
        {KIND_ORDER.filter((value) => portal === "super" || value !== "security").map((value) => (
          <Tile
            key={value}
            label={KIND_META[value].label}
            value={counts[value] ?? 0}
            tone={KIND_META[value].severity === "high" ? "red" : "amber"}
            icon={(() => {
              const Icon = KIND_META[value].icon
              return <Icon size={18} />
            })()}
            active={kind === value}
            onClick={() => {
              setKind(kind === value ? undefined : value)
              setPage(1)
            }}
          />
        ))}
      </section>

      <div className="ops-toolbar">
        <div className="ops-segment" role="tablist" aria-label="Alert status">
          {(["open", "resolved"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={status === value ? "active" : ""}
              onClick={() => {
                setStatus(value)
                setPage(1)
                setSelected(new Set())
              }}
            >
              {value === "open" ? "Open" : "Resolved"}
            </button>
          ))}
        </div>
        <label className="ops-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this page by order code, vendor or text"
            aria-label="Search alerts"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      <div className="ops-chips" role="group" aria-label="Filter by type">
        {kindChip(undefined, "All types", openCount)}
        {KIND_ORDER.filter((value) => portal === "super" || value !== "security").map((value) =>
          kindChip(value, KIND_META[value].label, counts[value] ?? 0),
        )}
      </div>

      {error && (
        <p role="alert" className="ops-error">
          <AlertTriangle size={15} /> {error}
        </p>
      )}

      <div className="ops-body">
        <div className="ops-main">
          {status === "open" && openIds.length > 0 && (
            <label className="ops-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(openIds))}
              />
              Select all open alerts on this page
            </label>
          )}

          {alerts.isPending && <p className="ops-empty">Loading alerts…</p>}
          {alerts.isError && (
            <p role="alert" className="ops-error">
              <AlertTriangle size={15} />{" "}
              {alerts.error instanceof ApiError
                ? alerts.error.message
                : "The alerts couldn’t be loaded."}
            </p>
          )}

          {!alerts.isPending && items.length === 0 && (
            <div className="ops-empty-card">
              <BadgeCheck size={28} />
              <strong>{status === "open" ? "All clear" : "Nothing resolved yet"}</strong>
              <span>
                {status === "open"
                  ? query || kind
                    ? "No open alerts match these filters."
                    : "No open alerts. Everything is on track."
                  : "Resolved alerts appear here."}
              </span>
            </div>
          )}

          {groups.map(([label, list]) => (
            <section key={label} className="ops-group" aria-label={label}>
              <h3>
                {label} <small>{list.length}</small>
              </h3>
              <ul className="ops-list">
                {list.map((alert) => {
                  const meta = KIND_META[alert.kind as Kind] ?? KIND_META.delayed_order
                  const Icon = meta.icon
                  const isOpen = !alert.resolvedAt
                  const overdue = isOpen && now - new Date(alert.createdAt).getTime() > OVERDUE_MS
                  return (
                    <li
                      key={alert.id}
                      className={`ops-card ${meta.severity}${isOpen ? "" : " done"}`}
                    >
                      {isOpen && (
                        <input
                          type="checkbox"
                          className="ops-check"
                          checked={selected.has(alert.id)}
                          onChange={() => toggle(alert.id)}
                          aria-label={`Select ${alert.title}`}
                        />
                      )}
                      <span className="ops-icon" aria-hidden="true">
                        <Icon size={17} />
                      </span>
                      <div className="ops-copy">
                        <div className="ops-tags">
                          <span className={`ops-tag ${meta.severity}`}>
                            {meta.severity === "high" ? "High" : "Medium"}
                          </span>
                          <span className="ops-tag muted">{meta.label}</span>
                          {alert.business && (
                            <span className="ops-tag muted">
                              {alert.business === "food" ? "Food" : "Mart"}
                            </span>
                          )}
                          {overdue && (
                            <span className="ops-tag overdue">
                              <Clock size={11} /> Over 2 hours
                            </span>
                          )}
                          {!isOpen && <span className="ops-tag ok">Resolved</span>}
                        </div>
                        <strong>{alert.title}</strong>
                        <p>{alert.body}</p>
                        <small>
                          {ago(alert.createdAt, now)} · {clock(alert.createdAt)}
                          {alert.resolvedAt && ` · resolved ${ago(alert.resolvedAt, now)}`}
                        </small>
                      </div>
                      <div className="ops-actions">
                        {alert.link && (
                          <Link className="ops-btn ghost" href={alert.link}>
                            Open
                          </Link>
                        )}
                        {isOpen && (
                          <button
                            type="button"
                            className="ops-btn"
                            disabled={resolve.isPending}
                            onClick={() => resolveIds([alert.id])}
                          >
                            Mark resolved
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {pages > 1 && (
            <nav className="ops-pager" aria-label="Alert pages">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page} of {pages}
              </span>
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </nav>
          )}
        </div>

        <aside className="ops-side" aria-label="Unusual order volume">
          <section className="ops-panel">
            <h3>
              <TrendingUp size={16} /> Unusual order volume
            </h3>
            <p className="ops-panel-note">
              Zones with clearly more orders today than their usual day.
            </p>
            {volume.length === 0 ? (
              <p className="ops-empty small">No zone is unusually busy today.</p>
            ) : (
              <ul className="ops-volume">
                {volume.map((zone) => (
                  <li key={zone.zoneId}>
                    <div>
                      <strong>{zone.zoneName}</strong>
                      <span>
                        {zone.today} today · usual {zone.usualPerDay}/day
                      </span>
                    </div>
                    <div className="ops-bar" aria-hidden="true">
                      <i style={{ width: `${Math.round((zone.today / maxToday) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="ops-panel quiet">
            <h3>How alerts work</h3>
            <ul className="ops-howto">
              <li>
                <AlertTriangle size={14} /> High: payment failures and security sign-ins.
              </li>
              <li>
                <Timer size={14} /> Medium: delayed orders and suspended vendors with open orders.
              </li>
              <li>
                <Clock size={14} /> Open alerts older than 2 hours are marked overdue.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
  icon,
  active,
  onClick,
}: {
  label: string
  value: number
  tone: "navy" | "red" | "amber"
  icon: ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`ops-tile ${tone}${active ? " active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="ops-tile-icon">{icon}</span>
      <span>
        <small>{label}</small>
        <b>{value.toLocaleString("en-IN")}</b>
      </span>
    </button>
  )
}
