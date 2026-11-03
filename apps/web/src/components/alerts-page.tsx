"use client"

import { ApiError } from "@zoauro/api-client"
import type { Business } from "@zoauro/shared"
import { AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useAlerts, useResolveAlert, type AlertStatus } from "@/lib/alerts"

const KIND_LABEL: Record<string, string> = {
  delayed_order: "Delayed order",
  payment_failed: "Payment failed",
  vendor_issue: "Vendor issue",
  security: "Security",
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

/**
 * Alerts for the portal: problems that need action, with today's unusual order volume.
 * Super Admins see every business; an admin page shows only its business.
 */
export function AlertsPage({ business }: { business?: Business }) {
  const [status, setStatus] = useState<AlertStatus>("open")
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")
  const alerts = useAlerts(status, page)
  const resolve = useResolveAlert()
  const items = (alerts.data?.items ?? []).filter(
    (alert) => !business || alert.business === business,
  )
  const total = alerts.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 30))

  return (
    <div className="alerts-page">
      <header className="alerts-head">
        <div>
          <h2>Alerts</h2>
          <p>
            {alerts.data?.openCount ?? "—"} open. Alerts are recorded once a day per problem and
            stay here until someone marks them resolved.
          </p>
        </div>
      </header>

      <div className="alerts-tabs" role="tablist" aria-label="Alert status">
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
            }}
          >
            {value === "open" ? "Open" : "Resolved"}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {status === "open" && (alerts.data?.volume.length ?? 0) > 0 && (
        <section className="alerts-volume" aria-label="Unusual order volume">
          <h3>
            <TrendingUp size={16} /> Unusual order volume today
          </h3>
          <ul>
            {alerts.data?.volume.map((zone) => (
              <li key={zone.zoneId}>
                <strong>{zone.zoneName}</strong> {zone.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {alerts.isPending && <p>Loading alerts…</p>}
      {alerts.isError && (
        <p role="alert" className="form-error">
          {alerts.error instanceof ApiError
            ? alerts.error.message
            : "The alerts couldn’t be loaded."}
        </p>
      )}
      {!alerts.isPending && items.length === 0 && (
        <p className="alerts-empty">
          {status === "open"
            ? "No open alerts. Everything is on track."
            : "No resolved alerts yet."}
        </p>
      )}

      <ul className="alerts-list">
        {items.map((alert) => (
          <li key={alert.id} className={`alert-item ${alert.kind}`}>
            <span className="ops-alert-icon" aria-hidden="true">
              {alert.resolvedAt ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            </span>
            <div className="ops-alert-copy">
              <span className="ops-alert-kind">{KIND_LABEL[alert.kind] ?? alert.kind}</span>
              <strong>{alert.title}</strong>
              <p>{alert.body}</p>
              <small>
                {when(alert.createdAt)}
                {alert.resolvedAt && ` · resolved ${when(alert.resolvedAt)}`}
              </small>
            </div>
            <div className="ops-alert-actions">
              {alert.link && <Link href={alert.link}>Open</Link>}
              {!alert.resolvedAt && (
                <button
                  type="button"
                  disabled={resolve.isPending}
                  onClick={() => {
                    setError("")
                    resolve.mutate(alert.id, {
                      onError: (cause) =>
                        setError(
                          cause instanceof ApiError ? cause.message : "Couldn’t mark it resolved.",
                        ),
                    })
                  }}
                >
                  Mark resolved
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav className="alerts-pager" aria-label="Alert pages">
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
  )
}
