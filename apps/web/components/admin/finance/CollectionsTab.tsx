"use client"
import { useState } from "react"
import { financeGet, financePost } from "@/lib/finance-api"
import { formatDate, inr } from "@/lib/format"
import type { CollectionRow, CollectionsData } from "@/types/finance"
import {
  BusinessTag,
  ErrorNote,
  Field,
  Loading,
  Modal,
  Panel,
  StatusPill,
  useAction,
  useFinanceData,
  type FinanceTabProps,
} from "./shared"

const METHODS = [
  { value: "CASH_DEPOSIT", label: "Cash deposit" },
  { value: "UPI", label: "UPI to GloAro" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
]

function methodLabel(method: string) {
  return METHODS.find((item) => item.value === method)?.label ?? method
}

function RemittanceModal({
  row,
  workspaceId,
  onClose,
  onChanged,
}: {
  row: CollectionRow
  workspaceId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [amount, setAmount] = useState(String(row.toRemit))
  const [method, setMethod] = useState("CASH_DEPOSIT")
  const [note, setNote] = useState("")
  const action = useAction(onChanged)

  async function submit() {
    const ok = await action.run(() =>
      financePost(workspaceId, "remittances", {
        partnerId: row.partnerId,
        amount: Number(amount),
        method,
        note,
      }),
    )
    if (ok) onClose()
  }

  return (
    <Modal title={`Record remittance · ${row.name}`} onClose={onClose}>
      <p className="fin-modal-hint">
        {row.name} still owes {inr(row.toRemit)} to GloAro this cycle.
      </p>
      <ErrorNote message={action.error} />
      <Field label="Amount received (₹)">
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <Field label="Method">
        <select value={method} onChange={(event) => setMethod(event.target.value)}>
          {METHODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div className="fin-modal-actions">
        <button type="button" className="admin-action-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="admin-action-btn admin-action-primary"
          disabled={action.busy || !(Number(amount) > 0)}
          onClick={() => void submit()}
        >
          {action.busy ? "Saving…" : "Record remittance"}
        </button>
      </div>
    </Modal>
  )
}

export default function CollectionsTab({
  workspaceId,
  cycle,
  version,
  onChanged,
}: FinanceTabProps) {
  const { data, loading, error } = useFinanceData(
    () => financeGet<CollectionsData>(workspaceId, "collections", { cycle }),
    [workspaceId, cycle, version],
  )
  const [selected, setSelected] = useState<CollectionRow | null>(null)

  return (
    <Panel
      title={`Customer collections · ${data?.cycle.label ?? ""}`}
      subtitle="Cash collected from customers by each delivery partner and the amount still to be remitted to GloAro"
    >
      <ErrorNote message={error} />
      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Partner account</th>
              <th>Business</th>
              <th>Managed by</th>
              <th>Deliveries</th>
              <th>Cash collected</th>
              <th>Remitted</th>
              <th>To remit to GloAro</th>
              <th>Last remittance</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row) => (
              <tr key={row.partnerId}>
                <td>
                  <b>{row.name}</b>
                  <br />
                  <small>
                    {row.code} · {row.accountCode}
                  </small>
                </td>
                <td>
                  <BusinessTag tag={row.business} />
                </td>
                <td>{row.managedBy}</td>
                <td>{row.deliveries}</td>
                <td>{inr(row.cashCollected)}</td>
                <td>{inr(row.remitted)}</td>
                <td>
                  <b className={row.toRemit > 0 ? "fin-warn" : ""}>{inr(row.toRemit)}</b>
                </td>
                <td>
                  {row.lastRemittance
                    ? `${formatDate(row.lastRemittance.at)} · ${methodLabel(row.lastRemittance.method)}`
                    : "—"}
                </td>
                <td>
                  <StatusPill status={row.status} />
                </td>
                <td>
                  <button
                    type="button"
                    className="admin-action-btn"
                    disabled={row.toRemit <= 0}
                    onClick={() => setSelected(row)}
                  >
                    Record remittance
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 && (
          <Loading loading={false} empty="No partner collections in this cycle." />
        )}
        {!data && <Loading loading={loading} empty="No data." />}
      </div>
      {selected && (
        <RemittanceModal
          row={selected}
          workspaceId={workspaceId}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
        />
      )}
    </Panel>
  )
}
