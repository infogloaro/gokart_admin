"use client"
// State → district → zone drill-down with a switchable measure, so one panel answers where
// revenue is made, where it is lost, where service is slow and where riders are short.
import type { Business, DashboardRange, GeoRow } from "@zoauro/shared"
import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { compactINR, useGeoInsights } from "@/lib/dashboard"
import { Button, Panel } from "./ui"

export type GeoMeasure = "revenue" | "margin" | "onTime" | "cancelled" | "riders"

type Measure = {
  label: string
  note: string
  /** The number the bar and the ranking use; null when there is nothing to measure. */
  value: (row: GeoRow) => number | null
  text: (row: GeoRow) => string
  /** Whether a bigger number is the better one, which decides "best first". */
  higherIsBetter: boolean
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`)

const MEASURES: Record<GeoMeasure, Measure> = {
  revenue: {
    label: "Revenue",
    note: "Gross order value, excluding cancelled and refunded orders",
    value: (r) => r.grossPaise,
    text: (r) => compactINR(r.grossPaise),
    higherIsBetter: true,
  },
  margin: {
    label: "Margin",
    note: "Platform revenue (commission + delivery fees) less partner pay",
    value: (r) => r.marginPaise,
    text: (r) => compactINR(r.marginPaise),
    higherIsBetter: true,
  },
  onTime: {
    label: "On-time",
    note: "Delivered orders inside the time limit",
    value: (r) => r.onTimeRate,
    text: (r) => pct(r.onTimeRate),
    higherIsBetter: true,
  },
  cancelled: {
    label: "Cancellations",
    note: "Share of orders placed that were cancelled",
    value: (r) => r.cancellationRate,
    text: (r) => pct(r.cancellationRate),
    higherIsBetter: false,
  },
  riders: {
    label: "Rider supply",
    note: "Open orders beyond the riders free right now",
    value: (r) => r.riderShortage,
    text: (r) =>
      r.riderShortage ? `Short by ${r.riderShortage}` : `${r.ridersAvailable} free · covered`,
    higherIsBetter: false,
  },
}

const RED = "var(--red, #c0392b)"
const BAR = "var(--navy, #12305f)"

export function GeoInsights({
  business,
  range,
  initial = "revenue",
  title = "Where it happens",
}: {
  business: Business | undefined
  range: DashboardRange
  initial?: GeoMeasure
  title?: string
}) {
  const [measure, setMeasure] = useState<GeoMeasure>(initial)
  const [worstFirst, setWorstFirst] = useState(initial === "riders")
  const [state, setState] = useState<string | undefined>()
  const [districtId, setDistrictId] = useState<string | undefined>()
  const [showAll, setShowAll] = useState(false)
  const q = useGeoInsights(business, range, state, districtId)
  const def = MEASURES[measure]

  const rows = [...(q.data?.rows ?? [])]
    .filter(
      (r) => r.orders > 0 || r.openOrders > 0 || r.ridersAvailable > 0 || r.riderCostPaise > 0,
    )
    .sort((a, b) => {
      const x = def.value(a)
      const y = def.value(b)
      if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1
      const best = def.higherIsBetter ? y - x : x - y
      return worstFirst ? -best : best
    })
  const shown = showAll ? rows : rows.slice(0, 10)
  const max = Math.max(1, ...rows.map((r) => Math.abs(def.value(r) ?? 0)))
  const level = q.data?.level ?? "state"

  const open = (row: GeoRow) => {
    setShowAll(false)
    if (level === "state") setState(row.key)
    else if (level === "district") setDistrictId(row.key)
  }

  return (
    <Panel title={title} subtitle={def.note}>
      <div className="sys-toolbar">
        {(Object.keys(MEASURES) as GeoMeasure[]).map((key) => (
          <Button
            key={key}
            primary={key === measure}
            onClick={() => {
              setMeasure(key)
              setWorstFirst(key === "riders")
            }}
          >
            {MEASURES[key].label}
          </Button>
        ))}
        <Button onClick={() => setWorstFirst(!worstFirst)}>
          {worstFirst ? "Worst first" : "Best first"}
        </Button>
      </div>
      <nav className="sys-toolbar" aria-label="Geography level">
        <Button
          onClick={() => {
            setState(undefined)
            setDistrictId(undefined)
          }}
        >
          All India
        </Button>
        {state && (
          <>
            <ChevronRight size={14} />
            <Button onClick={() => setDistrictId(undefined)}>{state}</Button>
          </>
        )}
        {districtId && q.data?.districtName && (
          <>
            <ChevronRight size={14} />
            <strong>{q.data.districtName}</strong>
          </>
        )}
      </nav>
      {q.isError ? (
        <p className="sys-state error" role="alert">
          Could not load this view. {q.error.message}
        </p>
      ) : q.isPending ? (
        <p className="sys-state">Loading…</p>
      ) : rows.length ? (
        <div className="sys-table-scroll">
          <table className="sys-table">
            <thead>
              <tr>
                <th>
                  {level === "state" ? "State / UT" : level === "district" ? "District" : "Zone"}
                </th>
                <th>{def.label}</th>
                <th>Orders</th>
                <th>Revenue</th>
                <th>Margin</th>
                <th>On-time</th>
                <th>Cancelled</th>
                <th>Open / riders free</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const value = def.value(row)
                const bad =
                  measure === "riders" ? (value ?? 0) > 0 : measure === "margin" && (value ?? 0) < 0
                return (
                  <tr key={row.key}>
                    <td>
                      {level === "zone" ? (
                        <strong>{row.label}</strong>
                      ) : (
                        <Button onClick={() => open(row)}>{row.label}</Button>
                      )}
                      <small>
                        {row.zones} zone{row.zones === 1 ? "" : "s"}
                      </small>
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <div
                        style={{
                          height: 8,
                          width: `${value === null ? 0 : Math.max(2, (Math.abs(value) / max) * 100)}%`,
                          background: bad ? RED : BAR,
                          borderRadius: 4,
                        }}
                      />
                      <small>{def.text(row)}</small>
                    </td>
                    <td>{row.orders}</td>
                    <td>{compactINR(row.grossPaise)}</td>
                    <td style={{ color: row.marginPaise < 0 ? RED : undefined }}>
                      {compactINR(row.marginPaise)}
                    </td>
                    <td>{pct(row.onTimeRate)}</td>
                    <td>{pct(row.cancellationRate)}</td>
                    <td>
                      {row.openOrders} / {row.ridersAvailable}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length > 10 && (
            <Button onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show all ${rows.length}`}
            </Button>
          )}
        </div>
      ) : (
        <p className="sys-state">No orders, riders or pay in this period for this area.</p>
      )}
    </Panel>
  )
}
