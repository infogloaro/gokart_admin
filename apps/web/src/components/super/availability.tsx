"use client"
// Manual availability override (Super Admin portal markup). "On delivery" follows the
// partner's orders, so only Online ↔ Offline can be set by hand, always with a reason.
import { ApiError } from "@zoauro/api-client"
import type { PartnerAvailability } from "@zoauro/shared"
import { Power, X } from "lucide-react"
import { useState } from "react"
import { useAvailabilityOverride } from "@/lib/tracking"
import { Button, IconButton, Select } from "./ui"

const REASONS = {
  offline: [
    "Phone switched off or unreachable",
    "Vehicle breakdown",
    "Partner asked to end the shift",
    "Safety or conduct concern",
  ],
  available: [
    "Partner is back on shift",
    "App connection issue resolved",
    "Covering a busy period",
  ],
}

export function AvailabilityButton({
  partner,
  onDone,
}: {
  partner: { id: string; name: string; code: string; availability: PartnerAvailability }
  onDone?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (partner.availability === "on_delivery")
    return (
      <Button icon={Power} disabled title="Finish or reassign the current order first">
        Set offline
      </Button>
    )
  const to = partner.availability === "offline" ? "available" : "offline"
  return (
    <>
      <Button icon={Power} danger={to === "offline"} onClick={() => setOpen(true)}>
        {to === "offline" ? "Set offline" : "Set online"}
      </Button>
      {open && (
        <AvailabilityDialog
          partner={partner}
          to={to}
          close={() => setOpen(false)}
          done={() => {
            setOpen(false)
            onDone?.(to === "offline" ? `${partner.name} is offline` : `${partner.name} is online`)
          }}
        />
      )}
    </>
  )
}

function AvailabilityDialog({
  partner,
  to,
  close,
  done,
}: {
  partner: { id: string; name: string; code: string }
  to: "available" | "offline"
  close: () => void
  done: () => void
}) {
  const override = useAvailabilityOverride()
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [missing, setMissing] = useState(false)
  const submit = () => {
    if (!reason) return setMissing(true)
    override.mutate(
      {
        id: partner.id,
        availability: to,
        reason: notes.trim() ? `${reason} — ${notes.trim()}` : reason,
      },
      { onSuccess: done },
    )
  }
  return (
    <div className="decision-overlay" role="alertdialog" aria-label="Change availability">
      <section className="decision-dialog">
        <header>
          <div>
            <strong>{to === "offline" ? "Take partner offline" : "Bring partner online"}</strong>
            <small>
              {partner.name} · {partner.code}
            </small>
          </div>
          <IconButton icon={X} label="Close" onClick={close} />
        </header>
        <main>
          <div className="rejection-form">
            <Select
              label="Reason *"
              value={reason}
              onChange={(v) => (setReason(v), setMissing(false))}
            >
              <option value="">Select a reason</option>
              {REASONS[to].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            {missing && <span className="rejection-error">A reason is required.</span>}
            <label className="field">
              <span>Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional context for the audit log."
              />
            </label>
            <p style={{ margin: 0, fontSize: ".75rem", color: "var(--muted)" }}>
              {to === "offline"
                ? "The partner stops receiving new orders until they start a shift or someone brings them back online."
                : "The partner can receive new orders again. If they're carrying one, they show as on delivery."}
            </p>
          </div>
          {override.isError && (
            <p className="rejection-error" role="alert" style={{ marginTop: ".75rem" }}>
              {override.error instanceof ApiError
                ? override.error.message
                : "Couldn't change availability."}
            </p>
          )}
        </main>
        <footer>
          <Button onClick={close}>Cancel</Button>
          <Button
            danger={to === "offline"}
            success={to === "available"}
            disabled={override.isPending}
            onClick={submit}
          >
            {to === "offline" ? "Set offline" : "Set online"}
          </Button>
        </footer>
      </section>
    </div>
  )
}
