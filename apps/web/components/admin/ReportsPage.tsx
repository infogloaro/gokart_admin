"use client"
import { useEffect, useState } from "react"
import { fetchReports } from "@/lib/dashboard-api"
import { downloadCsv } from "@/lib/csv"
import type { DateRangeInput, ReportPeriod, ReportsData } from "@/types/dashboard"
import { RevenueTrendChart } from "./TrendChart"

const PERIODS: Array<{ key: ReportPeriod; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
]

export default function ReportsPage({
  workspaceId,
  dateRange,
  refreshKey,
}: {
  workspaceId: string
  dateRange: DateRangeInput
  refreshKey: string | null
}) {
  const [period, setPeriod] = useState<ReportPeriod>("monthly")
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchReports(workspaceId, period, dateRange)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load reports.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, period, dateRange, refreshKey])

  function exportReport() {
    if (!data) return
    const rows: string[][] = [
      ...data.metrics.map((metric) => ["Summary", metric.label, metric.value, metric.change]),
      ...data.comparison.series.flatMap((series) =>
        data.comparison.days.map((day, index) => [
          `Platform revenue (${period})`,
          `${series.label} · ${day}`,
          series.values[index] ?? "",
          "",
        ]),
      ),
      ...data.topVendors.map((vendor) => [
        "Top vendor",
        vendor.name,
        vendor.amount,
        `${vendor.tag} · ${vendor.orders} orders · ${vendor.status}`,
      ]),
    ]
    downloadCsv(
      `reports-${period}-${dateRange.start}-to-${dateRange.end}`,
      ["Section", "Item", "Value", "Detail"],
      rows,
    )
  }

  const periodLabel = PERIODS.find((item) => item.key === period)!.label
  const hasChart = data && data.comparison.series.length > 0 && data.comparison.days.length > 1

  return (
    <>
      {error && <div className="revenue-error">⚠ {error}</div>}

      <div className="reports-toolbar">
        <div className="reports-tabs" role="tablist">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === period}
              className={item.key === period ? "active" : ""}
              onClick={() => setPeriod(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="admin-action-btn" onClick={exportReport} disabled={!data}>
          ⭳ Export report
        </button>
      </div>

      <div className="admin-stats reports-stats">
        {(data?.metrics ?? []).map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>
              {metric.change} <em>vs previous period</em>
            </small>
          </article>
        ))}
        {!data && loading && (
          <article>
            <span>Loading reports…</span>
          </article>
        )}
      </div>

      <div className="admin-panels">
        <section className="reports-card">
          <header className="reports-card-head">
            <div>
              <h2>Business comparison</h2>
              <p>{periodLabel} platform revenue</p>
            </div>
            <span aria-hidden="true">⋯</span>
          </header>
          <div className="reports-card-body">
            {hasChart ? (
              <RevenueTrendChart
                series={data.comparison.series}
                days={data.comparison.days}
                zeroBased
              />
            ) : (
              <p className="reports-empty">
                {loading ? "Loading…" : "No orders in this date range to chart."}
              </p>
            )}
          </div>
        </section>
        <section className="reports-card">
          <header className="reports-card-head">
            <div>
              <h2>Top vendor performance</h2>
              <p>By gross order value</p>
            </div>
            <span aria-hidden="true">⋯</span>
          </header>
          <ul className="reports-vendors">
            {(data?.topVendors ?? []).map((vendor) => (
              <li key={vendor.id}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="reports-vendor-icon">
                  <path
                    d="M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 8h6M9 12h6M9 16h3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="admin-tx-info">
                  <b>{vendor.name}</b>
                  <small>
                    {vendor.orders} orders · {vendor.status}
                  </small>
                </div>
                <span className={`admin-tag admin-tag-${vendor.tag.toLowerCase()}`}>
                  {vendor.tag}
                </span>
                <strong>{vendor.amount}</strong>
              </li>
            ))}
            {data && data.topVendors.length === 0 && (
              <li className="reports-empty">No vendor orders in this date range.</li>
            )}
            {!data && loading && <li className="reports-empty">Loading…</li>}
          </ul>
        </section>
      </div>
    </>
  )
}
