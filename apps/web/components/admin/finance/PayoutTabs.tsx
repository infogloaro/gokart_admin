"use client"
import { useState } from "react"
import { financeGet, financePost, financePut } from "@/lib/finance-api"
import { inr } from "@/lib/format"
import type {
  AdminPayoutRow,
  AdminPayoutsData,
  PartnerPayoutRow,
  PartnerPayoutsData,
} from "@/types/finance"
import {
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

type Target =
  | { mode: "details" | "plan" | "adjust"; kind: "partner"; row: PartnerPayoutRow }
  | { mode: "details" | "plan" | "adjust"; kind: "admin"; row: AdminPayoutRow }

function RowActions({ onPick }: { onPick: (mode: "details" | "plan" | "adjust") => void }) {
  return (
    <div className="fin-row-actions">
      <button
        type="button"
        aria-label="View breakdown"
        title="View breakdown"
        onClick={() => onPick("details")}
      >
        ⓘ
      </button>
      <button
        type="button"
        aria-label="Edit pay plan"
        title="Edit pay plan"
        onClick={() => onPick("plan")}
      >
        ✎
      </button>
      <button
        type="button"
        aria-label="Add bonus or deduction"
        title="Add bonus or deduction"
        onClick={() => onPick("adjust")}
      >
        ＋
      </button>
    </div>
  )
}

function BreakdownModal({ target, onClose }: { target: Target; onClose: () => void }) {
  const lines: Array<[string, string]> =
    target.kind === "partner"
      ? [
          ["Pay plan", target.row.planLabel],
          ["Deliveries", String(target.row.deliveries)],
          ["Salary", inr(target.row.salary)],
          ["Fixed", inr(target.row.fixed)],
          ["Per-delivery", inr(target.row.perDelivery)],
          ["Commission", inr(target.row.commission)],
          ["Bonus", inr(target.row.bonus)],
          ["Deductions", inr(-target.row.deductions)],
          ["Earnings", inr(target.row.earnings)],
        ]
      : [
          ["Pay plan", target.row.planLabel],
          ["Partners managed", String(target.row.partners)],
          ["On-time delivery", `${target.row.onTimePercent}%`],
          ["Salary", inr(target.row.salary)],
          ["Commission", inr(target.row.commission)],
          ["Incentive", target.row.incentive === null ? "At close" : inr(target.row.incentive)],
          ["Bonus", inr(target.row.bonus)],
          ["Deductions", inr(-target.row.deductions)],
          ["Earnings", inr(target.row.earnings)],
        ]
  return (
    <Modal title={`${target.row.name} · earnings breakdown`} onClose={onClose}>
      <ul className="fin-lines">
        {lines.map(([label, value]) => (
          <li key={label} className={label === "Earnings" ? "fin-line-total" : ""}>
            <span>{label}</span>
            <b>{value}</b>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function PlanModal({
  target,
  workspaceId,
  onClose,
  onChanged,
}: {
  target: Target
  workspaceId: string
  onClose: () => void
  onChanged: () => void
}) {
  const initial: Record<string, number> =
    target.kind === "partner" ? { ...target.row.plan } : { ...target.row.plan }
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, String(value)])),
  )
  const action = useAction(onChanged)

  const fields: Array<[string, string]> =
    target.kind === "partner"
      ? [
          ["monthlySalary", "Monthly salary (₹)"],
          ["fixedPay", "Fixed pay per month (₹)"],
          ["perDeliveryRate", "Per-delivery rate (₹)"],
          ["feeSharePercent", "Share of delivery fees (%)"],
        ]
      : [
          ["monthlySalary", "Monthly salary (₹)"],
          ["commissionPercent", "Commission on managed partners (%)"],
          ["incentiveAmount", "Incentive amount (₹)"],
          ["onTimeThreshold", "On-time target for incentive (%)"],
        ]

  async function submit() {
    const body = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, Number(value)]),
    )
    const path =
      target.kind === "partner"
        ? `partners/${target.row.partnerId}/pay-plan`
        : `admins/${target.row.adminId}/pay-plan`
    const ok = await action.run(() => financePut(workspaceId, path, body))
    if (ok) onClose()
  }

  return (
    <Modal title={`Edit pay plan · ${target.row.name}`} onClose={onClose}>
      <p className="fin-modal-hint">
        Changes apply from now on and are written to the audit trail.
      </p>
      <ErrorNote message={action.error} />
      {fields.map(([key, label]) => (
        <Field key={key} label={label}>
          <input
            type="number"
            min="0"
            value={values[key] ?? ""}
            onChange={(event) =>
              setValues((current) => ({ ...current, [key]: event.target.value }))
            }
          />
        </Field>
      ))}
      <div className="fin-modal-actions">
        <button type="button" className="admin-action-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="admin-action-btn admin-action-primary"
          disabled={action.busy}
          onClick={() => void submit()}
        >
          {action.busy ? "Saving…" : "Save pay plan"}
        </button>
      </div>
    </Modal>
  )
}

function AdjustModal({
  target,
  workspaceId,
  onClose,
  onChanged,
}: {
  target: Target
  workspaceId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [kind, setKind] = useState("BONUS")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const action = useAction(onChanged)

  async function submit() {
    const ok = await action.run(() =>
      financePost(workspaceId, "adjustments", {
        kind,
        amount: Number(amount),
        note,
        ...(target.kind === "partner"
          ? { partnerId: target.row.partnerId }
          : { adminId: target.row.adminId }),
      }),
    )
    if (ok) onClose()
  }

  return (
    <Modal title={`Add bonus or deduction · ${target.row.name}`} onClose={onClose}>
      <ErrorNote message={action.error} />
      <Field label="Type">
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="BONUS">Bonus</option>
          <option value="DEDUCTION">Deduction</option>
        </select>
      </Field>
      <Field label="Amount (₹)">
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <Field label="Reason">
        <input value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div className="fin-modal-actions">
        <button type="button" className="admin-action-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="admin-action-btn admin-action-primary"
          disabled={action.busy || !(Number(amount) > 0) || note.trim().length === 0}
          onClick={() => void submit()}
        >
          {action.busy ? "Saving…" : "Add to this cycle"}
        </button>
      </div>
    </Modal>
  )
}

function Modals({
  target,
  workspaceId,
  onClose,
  onChanged,
}: {
  target: Target | null
  workspaceId: string
  onClose: () => void
  onChanged: () => void
}) {
  if (!target) return null
  if (target.mode === "details") return <BreakdownModal target={target} onClose={onClose} />
  if (target.mode === "plan")
    return (
      <PlanModal
        target={target}
        workspaceId={workspaceId}
        onClose={onClose}
        onChanged={onChanged}
      />
    )
  return (
    <AdjustModal
      target={target}
      workspaceId={workspaceId}
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}

export function PartnerPayoutsTab({ workspaceId, cycle, version, onChanged }: FinanceTabProps) {
  const { data, loading, error } = useFinanceData(
    () => financeGet<PartnerPayoutsData>(workspaceId, "partner-payouts", { cycle }),
    [workspaceId, cycle, version],
  )
  const [target, setTarget] = useState<Target | null>(null)

  return (
    <Panel
      title={`Delivery partner earnings · ${data?.cycle.label ?? ""}`}
      subtitle="Separate partner ledger · earnings are recalculated from daily activity and the pay plan in effect each day"
    >
      <ErrorNote message={error} />
      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Partner account</th>
              <th>Pay plan</th>
              <th>Deliveries</th>
              <th>Salary</th>
              <th>Fixed</th>
              <th>Per-delivery</th>
              <th>Commission</th>
              <th>Bonus</th>
              <th>Deductions</th>
              <th>Earnings</th>
              <th>Payout</th>
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
                <td>{row.planLabel}</td>
                <td>{row.deliveries}</td>
                <td>{inr(row.salary)}</td>
                <td>{inr(row.fixed)}</td>
                <td>{inr(row.perDelivery)}</td>
                <td>{inr(row.commission)}</td>
                <td>{inr(row.bonus)}</td>
                <td>{inr(-row.deductions)}</td>
                <td>
                  <b>{inr(row.earnings)}</b>
                </td>
                <td>
                  {row.payoutStatus === "Not generated" ? (
                    <span className="fin-pill fin-pill-muted">Not generated</span>
                  ) : (
                    <StatusPill status={row.payoutStatus} />
                  )}
                </td>
                <td>
                  <RowActions onPick={(mode) => setTarget({ mode, kind: "partner", row })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 && (
          <Loading loading={false} empty="No partner activity in this cycle." />
        )}
        {!data && <Loading loading={loading} empty="No data." />}
      </div>
      <Modals
        target={target}
        workspaceId={workspaceId}
        onClose={() => setTarget(null)}
        onChanged={onChanged}
      />
    </Panel>
  )
}

export function AdminPayoutsTab({ workspaceId, cycle, version, onChanged }: FinanceTabProps) {
  const { data, loading, error } = useFinanceData(
    () => financeGet<AdminPayoutsData>(workspaceId, "admin-payouts", { cycle }),
    [workspaceId, cycle, version],
  )
  const [target, setTarget] = useState<Target | null>(null)
  const rows = data?.rows ?? []
  const sum = (pick: (row: AdminPayoutRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0)

  return (
    <Panel
      title={`Admin salaries & incentives · ${data?.cycle.label ?? ""}`}
      subtitle="Separate admin ledger · pay for the Admins who manage and monitor delivery partners"
    >
      <ErrorNote message={error} />
      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Admin account</th>
              <th>Pay plan</th>
              <th>Partners</th>
              <th>On-time</th>
              <th>Salary</th>
              <th>Commission</th>
              <th>Incentive</th>
              <th>Bonus</th>
              <th>Deductions</th>
              <th>Earnings</th>
              <th>Payout</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.adminId}>
                <td>
                  <b>{row.name}</b>
                  <br />
                  <small>
                    {row.location} · {row.accountCode}
                  </small>
                </td>
                <td>{row.planLabel}</td>
                <td>{row.partners}</td>
                <td>{row.onTimePercent}%</td>
                <td>{inr(row.salary)}</td>
                <td>{inr(row.commission)}</td>
                <td>{row.incentive === null ? "At close" : inr(row.incentive)}</td>
                <td>{inr(row.bonus)}</td>
                <td>{inr(-row.deductions)}</td>
                <td>
                  <b>{inr(row.earnings)}</b>
                </td>
                <td>
                  {row.payoutStatus === "Not generated" ? (
                    <span className="fin-pill fin-pill-muted">Not generated</span>
                  ) : (
                    <StatusPill status={row.payoutStatus} />
                  )}
                </td>
                <td>
                  <RowActions onPick={(mode) => setTarget({ mode, kind: "admin", row })} />
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="fin-total-row">
                <td>
                  <b>Total · admin ledger</b>
                </td>
                <td />
                <td />
                <td />
                <td>{inr(sum((row) => row.salary))}</td>
                <td>{inr(sum((row) => row.commission))}</td>
                <td>{inr(sum((row) => row.incentive ?? 0))}</td>
                <td>{inr(sum((row) => row.bonus))}</td>
                <td>{inr(-sum((row) => row.deductions))}</td>
                <td>
                  <b>{inr(sum((row) => row.earnings))}</b>
                </td>
                <td />
                <td />
              </tr>
            )}
          </tbody>
        </table>
        {data && rows.length === 0 && (
          <Loading loading={false} empty="No admin accounts in this scope." />
        )}
        {!data && <Loading loading={loading} empty="No data." />}
      </div>
      <Modals
        target={target}
        workspaceId={workspaceId}
        onClose={() => setTarget(null)}
        onChanged={onChanged}
      />
    </Panel>
  )
}
