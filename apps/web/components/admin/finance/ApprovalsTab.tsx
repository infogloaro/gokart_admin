"use client"
import { useState } from "react"
import { financeGet, financePost } from "@/lib/finance-api"
import { formatDate, formatDateTime, inr } from "@/lib/format"
import type { ApprovalsData, PayoutRecord } from "@/types/finance"
import {
  ErrorNote,
  Loading,
  Modal,
  Panel,
  StatusPill,
  useAction,
  useFinanceData,
  type FinanceTabProps,
} from "./shared"

function ReviewModal({ payout, onClose }: { payout: PayoutRecord; onClose: () => void }) {
  const lines: Array<[string, string]> = [
    ["Payout", payout.code],
    ["Account", `${payout.accountName} · ${payout.accountRef}`],
    ["Type", payout.kind === "PARTNER" ? "Delivery partner" : "Admin"],
    ["Cycle", payout.cycleLabel],
    ["Amount", inr(payout.amount)],
    ["Due date", formatDate(payout.dueDate)],
    ["Generated", `${formatDate(payout.generatedAt)} · ${payout.note}`],
  ]
  return (
    <Modal title="Review payout" onClose={onClose}>
      <ul className="fin-lines">
        {lines.map(([label, value]) => (
          <li key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </li>
        ))}
      </ul>
      <p className="fin-modal-hint">
        The amount was frozen when payouts were generated. Use the account's pay plan or adjustments
        before generating if it needs to change.
      </p>
    </Modal>
  )
}

export default function ApprovalsTab({ workspaceId, version, onChanged }: FinanceTabProps) {
  const { data, loading, error } = useFinanceData(
    () => financeGet<ApprovalsData>(workspaceId, "approvals"),
    [workspaceId, version],
  )
  const action = useAction(onChanged)
  const [review, setReview] = useState<PayoutRecord | null>(null)

  if (!data) {
    return (
      <>
        <ErrorNote message={error} />
        <Loading loading={loading} empty="No data." />
      </>
    )
  }

  const pendingRequests = data.requests.filter((request) => request.status === "PENDING")

  return (
    <>
      <ErrorNote message={error ?? action.error} />

      <Panel
        title="Payouts awaiting approval"
        subtitle={`${data.payouts.length} payouts · ${inr(data.payoutsTotal)}`}
      >
        {data.payouts.length === 0 ? (
          <Loading loading={false} empty="Nothing is waiting for approval." />
        ) : (
          <ul className="fin-approval-list">
            {data.payouts.map((payout) => (
              <li key={payout.id}>
                <span
                  className={`admin-tag admin-tag-${payout.kind === "PARTNER" ? "mart" : "food"}`}
                >
                  {payout.kind}
                </span>
                <div>
                  <b>{payout.accountName}</b>
                  <small>
                    {payout.code} · {payout.cycleLabel} · due {formatDate(payout.dueDate)}
                  </small>
                </div>
                <strong>{inr(payout.amount)}</strong>
                <button
                  type="button"
                  className="admin-action-btn"
                  onClick={() => setReview(payout)}
                >
                  Review
                </button>
                <button
                  type="button"
                  className="admin-action-btn fin-reject"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() => financePost(workspaceId, `payouts/${payout.id}/reject`))
                  }
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="admin-action-btn fin-approve"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() => financePost(workspaceId, `payouts/${payout.id}/approve`))
                  }
                >
                  ✓ Approve
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Pay setting change requests"
        subtitle="Admins can propose pay changes for their partners; only a Super Admin can apply them"
      >
        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Account</th>
                <th>Current plan</th>
                <th>Proposed plan</th>
                <th>Reason</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <b>{request.code}</b>
                    <br />
                    <small>
                      {request.requestedBy} · Admin · {request.requestedByLocation} ·{" "}
                      {formatDateTime(request.createdAt)}
                    </small>
                  </td>
                  <td>{request.partnerName}</td>
                  <td>{request.currentPlan}</td>
                  <td>
                    <b>{request.proposedPlan}</b>
                  </td>
                  <td>{request.reason}</td>
                  <td>
                    <StatusPill
                      status={
                        request.status === "PENDING"
                          ? "Pending approval"
                          : request.status === "APPROVED"
                            ? "Approved"
                            : "Rejected"
                      }
                    />
                  </td>
                  <td>
                    {request.status === "PENDING" && (
                      <div className="fin-row-actions">
                        <button
                          type="button"
                          className="admin-action-btn fin-reject"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(() =>
                              financePost(workspaceId, `requests/${request.id}/reject`),
                            )
                          }
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="admin-action-btn fin-approve"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(() =>
                              financePost(workspaceId, `requests/${request.id}/approve`),
                            )
                          }
                        >
                          ✓ Approve
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.requests.length === 0 && <Loading loading={false} empty="No change requests." />}
          {pendingRequests.length === 0 && data.requests.length > 0 && (
            <p className="fin-empty">All requests have been decided.</p>
          )}
        </div>
      </Panel>

      <Panel title="Audit trail" subtitle="Every finance action is recorded here">
        <ul className="fin-audit">
          {data.audit.map((entry) => (
            <li key={entry.id}>
              <b>{entry.action}</b>
              <span>{entry.detail}</span>
              <small>
                {entry.actor} · {formatDateTime(entry.at)}
              </small>
            </li>
          ))}
          {data.audit.length === 0 && <li className="fin-empty">No activity yet.</li>}
        </ul>
      </Panel>

      {review && <ReviewModal payout={review} onClose={() => setReview(null)} />}
    </>
  )
}
