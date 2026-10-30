"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { fetchRevenue } from "@/lib/dashboard-api"
import type { DateRangeInput, RevenueData } from "@/types/dashboard"
import { RevenueTrendChart } from "./TrendChart"

const TABLE_COLUMNS = ["Order / Shipment", "Business", "Vendor", "Partner", "Payment", "Status"]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")
}

function statusPill(status: string) {
  const normalized = status.toLowerCase()
  if (normalized.includes("delivered")) return "delivered"
  if (normalized.includes("cancel") || normalized.includes("refund")) return "cancelled"
  return "progress"
}

export default function RevenuePage({
  workspaceId,
  businessSlug,
  dateRange,
  refreshKey,
}: {
  workspaceId: string
  businessSlug: string
  dateRange: DateRangeInput
  refreshKey: string | null
}) {
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchRevenue(workspaceId, businessSlug, dateRange)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load revenue.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, businessSlug, dateRange, refreshKey])

  const ledgerHref = `/admin/${workspaceId}/transaction-ledger`

  return (
    <>
      {error && <div className="revenue-error">⚠ {error}</div>}

      <div className="admin-stats revenue-stats">
        {(data?.metrics ?? []).map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>
              {metric.change} <em>this period</em>
            </small>
          </article>
        ))}
        {!data && loading && (
          <article>
            <span>Loading revenue…</span>
          </article>
        )}
      </div>

      <div className="admin-panels">
        <div>
          <h2>Daily marketplace sales</h2>
          <p>Gross value and platform revenue are shown separately</p>
          {data && data.sales.series.length > 0 && data.sales.days.length > 1 ? (
            <RevenueTrendChart series={data.sales.series} days={data.sales.days} />
          ) : (
            <p>{loading ? "Loading…" : "No sales in this date range."}</p>
          )}
        </div>
        <div>
          <h2>Revenue composition</h2>
          <p>Platform revenue only</p>
          <ul className="revenue-composition">
            {(data?.composition ?? []).map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <div className="admin-bar-track">
                  <div className="admin-bar-fill" style={{ width: `${row.value}%` }} />
                </div>
                <b>{row.value}%</b>
              </li>
            ))}
          </ul>
          <div className="revenue-note">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 2 20h20Zm0 6v5m0 3h.01" />
            </svg>
            Net platform revenue excludes vendor sales, settlements and refunds.
          </div>
        </div>
      </div>

      <div className="ledger-panel">
        <div className="ledger-panel-head">
          <h2>Recent marketplace transactions</h2>
          <p>All amounts shown in INR</p>
        </div>
        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                {TABLE_COLUMNS.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th>Amount</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={8} className="ledger-table-empty">
                    Loading transactions…
                  </td>
                </tr>
              ) : (data?.transactions.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={8} className="ledger-table-empty">
                    No orders in this date range.
                  </td>
                </tr>
              ) : (
                data!.transactions.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="revenue-order">
                        <span className="revenue-avatar">{initials(row.customer)}</span>
                        <div>
                          <b>{row.customer}</b>
                          <small>{row.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`admin-tag admin-tag-${businessSlug === "zoauro-food" ? "food" : "mart"}`}
                      >
                        {row.business}
                      </span>
                    </td>
                    <td>{row.vendor}</td>
                    <td>{row.partner}</td>
                    <td>
                      <span className={`revenue-pill revenue-pill-${row.payment.toLowerCase()}`}>
                        {row.payment}
                      </span>
                    </td>
                    <td>
                      <span className={`revenue-pill revenue-pill-${statusPill(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <b>{row.amount}</b>
                    </td>
                    <td className="ledger-table-actions">
                      <Link
                        href={ledgerHref}
                        className="ledger-row-menu"
                        aria-label={`Open transaction ledger for ${row.id}`}
                      >
                        ⋯
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
