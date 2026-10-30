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
        <div>
          <h2>Business comparison</h2>
          <p>{periodLabel} platform revenue</p>
          {hasChart ? (
            <RevenueTrendChart series={data.comparison.series} days={data.comparison.days} />
          ) : (
            <p>
              {loading
                ? "Loading…"
                : "Not enough data for this view. Try a wider date range or a shorter period."}
            </p>
          )}
        </div>
        <div>
          <h2>Top vendor performance</h2>
          <p>By gross order value</p>
          <ul className="reports-vendors">
            {(data?.topVendors ?? []).map((vendor) => (
              <li key={vendor.id}>
                <span className="admin-tx-icon" aria-hidden="true">
                  🧾
                </span>
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
            {data && data.topVendors.length === 0 && <li>No vendor orders in this date range.</li>}
            {!data && loading && <li>Loading…</li>}
          </ul>
        </div>
      </div>
    </>
  )
}
