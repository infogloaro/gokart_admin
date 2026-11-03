"use client"
// Rider performance for the last 30 days (or the chosen dates): deliveries, on-time rate,
// declined jobs and a 0-100 score. Shown in the Admin and Super Admin portals.
import { useQuery } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import { Trophy } from "lucide-react"
import { useState } from "react"
import "./live-riders-map.css"

const pct = (value: number | null) => (value === null ? "–" : `${value}%`)

export function RiderPerformance() {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const q = useQuery({
    queryKey: ["riders", "performance", from, to],
    queryFn: () =>
      api("get", "/delivery/performance", {
        query: { from: from || undefined, to: to || undefined },
      }),
  })
  const rows = q.data ?? []

  return (
    <section className="live-riders" aria-label="Rider performance">
      <header>
        <h3>
          <Trophy size={16} /> Rider performance
        </h3>
        <p>
          Score: 60% on time, 40% finished jobs. {from || to ? "Chosen dates." : "Last 30 days."}
        </p>
      </header>
      <div className="lr-filters">
        <label>
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {q.isPending && <p className="lr-empty">Loading performance…</p>}
      {q.isError && (
        <p className="lr-error" role="alert">
          Performance couldn’t be loaded.
        </p>
      )}
      {q.data && rows.length === 0 && (
        <p className="lr-empty">No finished deliveries in this period.</p>
      )}
      {rows.length > 0 && (
        <div className="lr-table-wrap">
          <table className="lr-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Partner</th>
                <th>Delivered</th>
                <th>On time</th>
                <th>Declined</th>
                <th>Avg minutes</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.boyId}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.code}</small>
                  </td>
                  <td>{row.fleetName}</td>
                  <td>{row.deliveries}</td>
                  <td>{pct(row.onTimeRate)}</td>
                  <td>{row.declined}</td>
                  <td>{row.avgMinutes ?? "–"}</td>
                  <td>
                    <strong>{row.score ?? "–"}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
