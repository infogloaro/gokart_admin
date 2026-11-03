"use client"
// Reconciliation: every payout checked against its lines, its payment record and the ledger.
// Read-only. Rows with issues come first so they are the first thing finance sees.
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { formatINR } from "@zoauro/shared"
import { useReconciliation } from "@/lib/finance"
import { ErrorBox, Tabs } from "./ui"

export function Reconciliation() {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [view, setView] = useState<"All" | "Issues only">("All")
  const report = useReconciliation({ from: from || undefined, to: to || undefined })
  const rows = (report.data?.rows ?? []).filter((row) => view === "All" || row.issues.length > 0)
  const summary = report.data?.summary

  return (
    <>
      <div className="filters">
        <label className="field">
          <span>From due date</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>To due date</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Tabs items={["All", "Issues only"] as const} value={view} onChange={setView} />
      </div>
      {report.isError && (
        <ErrorBox icon={AlertTriangle}>Couldn’t load the reconciliation.</ErrorBox>
      )}
      {summary && (
        <div className="fp-kpis">
          <div className="metric">
            <span>Payouts checked</span>
            <strong>{summary.payouts}</strong>
          </div>
          <div className="metric">
            <span>Clean</span>
            <strong>{summary.clean}</strong>
          </div>
          <div className={`metric ${summary.withIssues ? "warn" : ""}`}>
            <span>Need attention</span>
            <strong>{summary.withIssues}</strong>
          </div>
          <div className="metric">
            <span>Total payouts</span>
            <strong>{formatINR(summary.payoutPaise)}</strong>
          </div>
          <div className="metric">
            <span>Posted to ledger</span>
            <strong>{formatINR(summary.postedPaise)}</strong>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="fp-table">
          <thead>
            <tr>
              <th>Payout</th>
              <th>Payee</th>
              <th>Cycle</th>
              <th>Status</th>
              <th>Due</th>
              <th>Payout</th>
              <th>Lines</th>
              <th>Ledger</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.code}</td>
                <td>{row.payee}</td>
                <td>{row.cycle}</td>
                <td>{row.status.replaceAll("_", " ")}</td>
                <td>{row.dueDate}</td>
                <td>{formatINR(row.payoutPaise)}</td>
                <td>{formatINR(row.linesPaise)}</td>
                <td>{row.ledgerPaise === null ? "Not posted" : formatINR(row.ledgerPaise)}</td>
                <td>
                  {row.issues.length === 0 ? (
                    <span className="status-ok">
                      <CheckCircle2 size={14} /> Clean
                    </span>
                  ) : (
                    <ul className="recon-issues">
                      {row.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
            {report.data && rows.length === 0 && (
              <tr>
                <td colSpan={9}>No payouts match this view.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
