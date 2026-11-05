"use client"
// Comparison charts for Reports & Analytics: horizontal bars ranked by a measure, with each
// row's share of the total, plus a stacked strip showing how the total splits. Used for
// districts, delivery partners and riders.
import { useState } from "react"

export type ChartRow = {
  key: string
  label: string
  sub?: string
  /** The measure the bars are drawn from. */
  value: number | null
  /** The measure as text, e.g. "₹1.2 L" or "38 min". */
  display: string
}

const PALETTE = [
  "#0b2a4a",
  "#1f6feb",
  "#0ea5a4",
  "#d4a017",
  "#7c3aed",
  "#db2777",
  "#16a34a",
  "#ea580c",
  "#64748b",
]

export function ComparisonChart({
  rows,
  unit,
  lowerIsBetter = false,
  emptyText,
}: {
  rows: ChartRow[]
  /** Describes the measure, e.g. "deliveries". */
  unit: string
  /** Rank the shortest first (for time measures). */
  lowerIsBetter?: boolean
  emptyText: string
}) {
  const [showAll, setShowAll] = useState(false)
  const ranked = rows
    .filter((r): r is ChartRow & { value: number } => r.value !== null)
    .sort(
      (a, b) =>
        (lowerIsBetter ? a.value - b.value : b.value - a.value) || a.label.localeCompare(b.label),
    )
  const unranked = rows.filter((r) => r.value === null)
  const top = ranked[0]
  if (!top) return <p className="empty-note">{emptyText}</p>

  const max = Math.max(...ranked.map((r) => r.value))
  const total = ranked.reduce((sum, r) => sum + r.value, 0)
  const visible = showAll ? ranked : ranked.slice(0, 10)
  // Shares for the strip: the largest nine rows, then everything else as "Others".
  const strip = ranked.slice(0, 9)
  const others = ranked.slice(9).reduce((sum, r) => sum + r.value, 0)

  return (
    <div className="cmp-chart">
      <div className="cmp-summary">
        <span>
          <b>{ranked.length}</b> ranked
        </span>
        <span>
          Top: <b>{top.label}</b> ({top.display})
        </span>
        <span>
          Total {unit}: <b>{total.toLocaleString("en-IN")}</b>
        </span>
      </div>

      {total > 0 && (
        <div
          className="cmp-strip"
          role="img"
          aria-label={`Share of ${unit} by ${ranked.length} groups`}
        >
          {strip.map((r, i) => (
            <span
              key={r.key}
              title={`${r.label}: ${Math.round((r.value / total) * 100)}%`}
              style={{
                width: `${(r.value / total) * 100}%`,
                background: PALETTE[i % PALETTE.length] ?? "#0b2a4a",
              }}
            />
          ))}
          {others > 0 && (
            <span
              title={`Others: ${Math.round((others / total) * 100)}%`}
              style={{ width: `${(others / total) * 100}%`, background: "#cbd5e1" }}
            />
          )}
        </div>
      )}

      <ol className="cmp-bars">
        {visible.map((r, i) => {
          const share = total > 0 ? Math.round((r.value / total) * 100) : 0
          const width = max > 0 ? Math.max(1.5, (r.value / max) * 100) : 0
          return (
            <li key={r.key}>
              <span className="cmp-rank">{i + 1}</span>
              <span className="cmp-name">
                <strong>{r.label}</strong>
                {r.sub && <small>{r.sub}</small>}
              </span>
              <span className="cmp-bar-track" aria-hidden="true">
                <span
                  className="cmp-bar-fill"
                  style={{
                    width: `${width}%`,
                    background: PALETTE[i % PALETTE.length] ?? "#0b2a4a",
                  }}
                />
              </span>
              <span className="cmp-value">
                <strong>{r.display}</strong>
                <small>{share}%</small>
              </span>
            </li>
          )
        })}
      </ol>

      {ranked.length > 10 && (
        <button type="button" className="cmp-more" onClick={() => setShowAll((open) => !open)}>
          {showAll ? "Show top 10" : `Show all ${ranked.length}`}
        </button>
      )}
      {unranked.length > 0 && (
        <p className="cmp-unranked">
          {unranked.length} without a figure for this measure:{" "}
          {unranked.map((r) => r.label).join(", ")}
        </p>
      )}
    </div>
  )
}
