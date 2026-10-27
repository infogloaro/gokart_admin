"use client"
// Confirmation for approve / reject / suspend / reactivate (prototype decision-dialog).
import { ShieldCheck, X } from "lucide-react"
import { useState } from "react"
import { Button, IconButton, Select } from "./ui"

export type Decision = "approve" | "reject" | "suspend" | "reactivate"

const copy: Record<Decision, { title: string; confirm: string; body: string }> = {
  approve: {
    title: "Confirm approval",
    confirm: "Confirm Approval",
    body: "The record becomes active and can receive orders once all required checks are complete.",
  },
  reject: {
    title: "Reject application",
    confirm: "Confirm Rejection",
    body: "",
  },
  suspend: {
    title: "Suspend account",
    confirm: "Suspend",
    body: "",
  },
  reactivate: {
    title: "Reactivate account",
    confirm: "Reactivate",
    body: "The account goes back to active and can receive new work.",
  },
}

/** Reject and suspend need a reason; the others only a confirmation. */
export function DecisionDialog({
  decision,
  subject,
  reasons,
  pending,
  error,
  close,
  confirm,
}: {
  decision: Decision
  subject: string
  reasons: readonly string[]
  pending: boolean
  error?: string | undefined
  close: () => void
  confirm: (reason?: string) => void
}) {
  const [reason, setReason] = useState("")
  const [comments, setComments] = useState("")
  const [missing, setMissing] = useState(false)
  const needsReason = decision === "reject" || decision === "suspend"
  const c = copy[decision]
  const submit = () => {
    if (!needsReason) return confirm()
    if (!reason) return setMissing(true)
    confirm(comments.trim() ? `${reason} — ${comments.trim()}` : reason)
  }

  return (
    <div className="decision-overlay" role="alertdialog" aria-label={c.title}>
      <section className="decision-dialog">
        <header>
          <div>
            <strong>{c.title}</strong>
            <small>{subject}</small>
          </div>
          <IconButton icon={X} label="Close confirmation" onClick={close} />
        </header>
        <main>
          {needsReason ? (
            <div className="rejection-form">
              <Select
                label={`${decision === "reject" ? "Rejection" : "Suspension"} Reason *`}
                value={reason}
                onChange={(v) => (setReason(v), setMissing(false))}
              >
                <option value="">Select a reason</option>
                {reasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
              {missing && <span className="rejection-error">A reason is required.</span>}
              <label className="field">
                <span>Additional Comments</span>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Add optional context for the submitting Admin."
                />
              </label>
            </div>
          ) : (
            <div className="confirm-message">
              <ShieldCheck size={25} />
              <span>
                <b>Are you sure?</b>
                {c.body}
              </span>
            </div>
          )}
          {error && (
            <p className="rejection-error" role="alert" style={{ marginTop: ".75rem" }}>
              {error}
            </p>
          )}
        </main>
        <footer>
          <Button onClick={close}>Cancel</Button>
          <Button
            success={decision === "approve"}
            danger={needsReason}
            primary={decision === "reactivate"}
            disabled={pending}
            onClick={submit}
          >
            {c.confirm}
          </Button>
        </footer>
      </section>
    </div>
  )
}
