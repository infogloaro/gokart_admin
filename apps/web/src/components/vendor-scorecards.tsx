"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import { AlertTriangle, CheckCircle2, Gauge } from "lucide-react"
import { useState } from "react"

/** Last 30 days per vendor. Vendors needing attention are listed first, with the reasons. */
export function VendorScorecards() {
  const [only, setOnly] = useState(false)
  const q = useQuery({
    queryKey: ["vendors", "scorecards"],
    queryFn: () => api("get", "/vendors/scorecards"),
    refetchInterval: 120_000,
  })
  const rows = (q.data?.items ?? []).filter((row) => !only || row.needsAttention)
  const attention = (q.data?.items ?? []).filter((row) => row.needsAttention).length
  return (
    <section className="vendor-scorecards" aria-label="Vendor scorecards">
      <header>
        <div>
          <h3>
            <Gauge size={16} /> Vendor scorecards · last {q.data?.windowDays ?? 30} days
          </h3>
          <p>
            {attention > 0 ? (
              <>
                <AlertTriangle size={14} /> {attention} vendor{attention === 1 ? "" : "s"} need
                attention
              </>
            ) : (
              <>
                <CheckCircle2 size={14} /> No vendor needs attention right now
              </>
            )}
          </p>
        </div>
        <label className="vs-toggle">
          <input
            type="checkbox"
            checked={only}
            onChange={(event) => setOnly(event.target.checked)}
          />
          Only vendors needing attention
        </label>
      </header>
      {q.isPending && <p className="vs-empty">Loading scorecards…</p>}
      {q.isError && (
        <p className="vs-error" role="alert">
          The scorecards couldn’t be loaded.
        </p>
      )}
      {!q.isPending && rows.length === 0 && <p className="vs-empty">No vendors match.</p>}
      {rows.length > 0 && (
        <div className="vs-table-wrap">
          <table className="vs-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Orders</th>
                <th>On time</th>
                <th>Cancelled</th>
                <th>Complaints</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.vendorId} className={row.needsAttention ? "attn" : undefined}>
                  <td>
                    <strong>{row.vendorName}</strong>
                    <small>{row.business === "food" ? "Food" : "Mart"}</small>
                  </td>
                  <td>{row.orders}</td>
                  <td>{row.onTimePct === null ? "—" : `${row.onTimePct}%`}</td>
                  <td>{row.cancelPct === null ? "—" : `${row.cancelPct}%`}</td>
                  <td>{row.complaints}</td>
                  <td>
                    {row.needsAttention ? (
                      <span className="vs-flag" title={row.reasons.join(" ")}>
                        Needs attention
                      </span>
                    ) : (
                      <span className="vs-ok">On track</span>
                    )}
                    {row.reasons.length > 0 && <small>{row.reasons.join(" ")}</small>}
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
