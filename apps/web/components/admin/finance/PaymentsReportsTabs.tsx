"use client"
import { useState } from "react"
import { downloadCsv } from "@/lib/csv"
import { financeGet, financePost } from "@/lib/finance-api"
import { formatDate, inr } from "@/lib/format"
import type { FinanceReportsData, PaymentsData } from "@/types/finance"
import {
  ErrorNote,
  Loading,
  Panel,
  StatusPill,
  useAction,
  useFinanceData,
  type FinanceTabProps,
} from "./shared"

const STATUS_OPTIONS = ["Pending approval", "Approved", "Paid", "Overdue", "Settled", "Rejected"]

export function PaymentTrackingTab({ workspaceId, version, onChanged }: FinanceTabProps) {
  const [account, setAccount] = useState("")
  const [status, setStatus] = useState("")
  const [cycle, setCycle] = useState("")
  const { data, loading, error } = useFinanceData(
    () =>
      financeGet<PaymentsData>(workspaceId, "payments", {
        account: account || undefined,
        status: status || undefined,
        cycle: cycle || undefined,
      }),
    [workspaceId, account, status, cycle, version],
  )
  const action = useAction(onChanged)

  const cards: Array<[string, keyof PaymentsData["summary"], string]> = [
    ["Paid", "paid", "good"],
    ["Pending approval", "pending", "warn"],
    ["Approved", "approved", "info"],
    ["Overdue", "overdue", "bad"],
    ["Settled", "settled", "good"],
  ]

  return (
    <>
      <ErrorNote message={error ?? action.error} />
      <div className="fin-kpis fin-kpis-five">
        {cards.map(([label, key, tone]) => (
          <article key={key} className="fin-kpi">
            <span className={`fin-pill fin-pill-${tone}`}>{label}</span>
            <strong>{inr(data?.summary[key].amount ?? 0)}</strong>
            <small>{data?.summary[key].count ?? 0} payouts · all cycles</small>
          </article>
        ))}
      </div>
      <Panel
        title="Payout records"
        subtitle="Partner payouts (PPO) and admin payouts (APO) are kept in separate ledgers"
      >
        <div className="fin-filters">
          <select
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            aria-label="Account"
          >
            <option value="">All accounts</option>
            {(data?.accounts ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={cycle}
            onChange={(event) => setCycle(event.target.value)}
            aria-label="Cycle"
          >
            <option value="">All cycles</option>
            {(data?.cycles ?? []).map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Payout</th>
                <th>Account</th>
                <th>Cycle</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Status</th>
                <th>Approved</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.code}</b>
                    <br />
                    <small>
                      Generated {formatDate(row.generatedAt)} · {row.note}
                    </small>
                  </td>
                  <td>
                    {row.accountName}
                    <br />
                    <small>{row.accountRef}</small>
                  </td>
                  <td>{row.cycleLabel}</td>
                  <td>
                    <b>{inr(row.amount)}</b>
                  </td>
                  <td>{formatDate(row.dueDate)}</td>
                  <td>
                    <StatusPill status={row.status} />
                  </td>
                  <td>
                    {row.approvedAt ? (
                      <>
                        {formatDate(row.approvedAt)}
                        <br />
                        <small>{row.approvedBy}</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="fin-row-actions">
                      {row.rawStatus === "PENDING_APPROVAL" && (
                        <button
                          type="button"
                          className="admin-action-btn fin-approve"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(() =>
                              financePost(workspaceId, `payouts/${row.id}/approve`),
                            )
                          }
                        >
                          Approve
                        </button>
                      )}
                      {row.rawStatus === "APPROVED" && (
                        <button
                          type="button"
                          className="admin-action-btn admin-action-primary"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(() => financePost(workspaceId, `payouts/${row.id}/pay`))
                          }
                        >
                          Mark paid
                        </button>
                      )}
                      {(row.rawStatus === "PENDING_APPROVAL" || row.rawStatus === "APPROVED") && (
                        <button
                          type="button"
                          className="admin-action-btn fin-reject"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(() =>
                              financePost(workspaceId, `payouts/${row.id}/reject`),
                            )
                          }
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.rows.length === 0 && (
            <Loading
              loading={false}
              empty="No payouts match these filters. Generate payouts from Settlements."
            />
          )}
          {!data && <Loading loading={loading} empty="No data." />}
        </div>
      </Panel>
    </>
  )
}

const PERIODS: Array<{ key: "daily" | "weekly" | "monthly"; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
]

export function FinanceReportsTab({ workspaceId, version }: FinanceTabProps) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly")
  const { data, loading, error } = useFinanceData(
    () => financeGet<FinanceReportsData>(workspaceId, "reports", { period }),
    [workspaceId, period, version],
  )

  function exportCsv() {
    if (!data) return
    downloadCsv(
      `finance-report-${period}`,
      [
        "Period",
        "Customer collections",
        "Platform revenue",
        "Partner payouts",
        "Admin salaries",
        "GloAro net profit",
      ],
      [
        ...data.rows.map((row) => [
          row.label,
          String(row.collections),
          String(row.platformRevenue),
          String(row.partnerPayouts),
          String(row.adminSalaries),
          String(row.netProfit),
        ]),
        [
          "Total",
          String(data.total.collections),
          String(data.total.platformRevenue),
          String(data.total.partnerPayouts),
          String(data.total.adminSalaries),
          String(data.total.netProfit),
        ],
      ],
    )
  }

  return (
    <Panel
      title={`${PERIODS.find((item) => item.key === period)!.label} financial report`}
      subtitle="Accrual basis · every figure is summed from the same daily calculations used for payouts"
    >
      <ErrorNote message={error} />
      <div className="reports-toolbar fin-report-toolbar">
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
        <button type="button" className="admin-action-btn" onClick={exportCsv} disabled={!data}>
          ⭳ Export CSV
        </button>
      </div>
      <div className="ledger-table-wrap">
        <table className="ledger-table fin-numeric">
          <thead>
            <tr>
              <th>Period</th>
              <th>Customer collections</th>
              <th>Platform revenue</th>
              <th>Partner payouts</th>
              <th>Admin salaries</th>
              <th>GloAro net profit</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row) => (
              <tr key={row.label}>
                <td>
                  <b>{row.label}</b>
                </td>
                <td>{inr(row.collections)}</td>
                <td>{inr(row.platformRevenue)}</td>
                <td>{inr(-row.partnerPayouts)}</td>
                <td>{inr(-row.adminSalaries)}</td>
                <td className={row.netProfit >= 0 ? "fin-pos" : "fin-neg"}>
                  <b>{inr(row.netProfit)}</b>
                </td>
              </tr>
            ))}
            {data && data.rows.length > 0 && (
              <tr className="fin-total-row">
                <td>
                  <b>Total</b>
                </td>
                <td>{inr(data.total.collections)}</td>
                <td>{inr(data.total.platformRevenue)}</td>
                <td>{inr(-data.total.partnerPayouts)}</td>
                <td>{inr(-data.total.adminSalaries)}</td>
                <td>
                  <b>{inr(data.total.netProfit)}</b>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!data && <Loading loading={loading} empty="No data." />}
      </div>
      <p className="fin-footnote">
        Net profit = platform revenue (delivery fees + order commission) − partner payouts − admin
        salaries. Salaries and fixed pay accrue daily; admin performance incentives are booked on
        the last day of a closed cycle. Customer collections are cash held for GloAro and are not
        counted as profit.
      </p>
    </Panel>
  )
}
