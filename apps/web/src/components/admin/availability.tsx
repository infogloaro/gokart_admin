"use client"
// Manual availability override for Admins, inline in a drawer or side panel. Admins can
// take partners in their zones offline or bring them back; "on delivery" follows orders.
import { ApiError } from "@zoauro/api-client"
import type { PartnerAvailability } from "@zoauro/shared"
import { Power } from "lucide-react"
import { useState } from "react"
import { useAvailabilityOverride } from "@/lib/tracking"
import { AdminButton } from "./ui"

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

export function AvailabilityControl({
  partner,
  onDone,
}: {
  partner: { id: string; name: string; availability: PartnerAvailability }
  onDone?: (message: string) => void
}) {
  const override = useAvailabilityOverride()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [missing, setMissing] = useState(false)
  const to = partner.availability === "offline" ? "available" : "offline"

  if (partner.availability === "on_delivery")
    return (
      <p className="availability-note">
        <Power className="icon" size={15} /> On delivery. Finish or reassign the order before taking
        this partner offline.
      </p>
    )
  if (!open)
    return (
      <AdminButton
        kind={to === "offline" ? "danger" : "primary"}
        icon={Power}
        onClick={() => (override.reset(), setOpen(true))}
      >
        {to === "offline" ? "Set offline" : "Set online"}
      </AdminButton>
    )

  const submit = () => {
    if (!reason) return setMissing(true)
    override.mutate(
      {
        id: partner.id,
        availability: to,
        reason: notes.trim() ? `${reason} — ${notes.trim()}` : reason,
      },
      {
        onSuccess: () => {
          setOpen(false)
          setReason("")
          setNotes("")
          onDone?.(to === "offline" ? `${partner.name} is offline` : `${partner.name} is online`)
        },
      },
    )
  }

  return (
    <div className="availability-form">
      <strong>{to === "offline" ? "Take partner offline" : "Bring partner online"}</strong>
      <label className="form-field">
        <span>Reason *</span>
        <select value={reason} onChange={(e) => (setReason(e.target.value), setMissing(false))}>
          <option value="">Select a reason</option>
          {REASONS[to].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        {missing && <small>A reason is required</small>}
      </label>
      <label className="form-field">
        <span>Notes</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional context for the audit log"
        />
      </label>
      {override.isError && (
        <p role="alert" className="availability-error">
          {override.error instanceof ApiError
            ? override.error.message
            : "Couldn't change availability."}
        </p>
      )}
      <div>
        <AdminButton kind="ghost" onClick={() => setOpen(false)}>
          Cancel
        </AdminButton>
        <AdminButton
          kind={to === "offline" ? "danger" : "primary"}
          disabled={override.isPending}
          onClick={submit}
        >
          {to === "offline" ? "Set offline" : "Set online"}
        </AdminButton>
      </div>
    </div>
  )
}
