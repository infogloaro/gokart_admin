"use client"
// An Admin asks the Super Admin to create a delivery partner for their zones. The partner stays
// pending until Super Admin approves it; its delivery boys are added after that.
import * as Dialog from "@radix-ui/react-dialog"
import { ApiError } from "@zoauro/api-client"
import { RequestDeliveryFleetRequest, businessName, type Business } from "@zoauro/shared"
import { Check, X } from "lucide-react"
import { useState } from "react"
import { FleetHistory } from "@/components/super/history-list"
import { useDeliveryFleets, useRequestDeliveryFleet } from "@/lib/delivery"
import { useZones } from "@/lib/session"
import { AdminBadge, AdminButton } from "./ui"

const REQUEST_LABEL: Record<string, string> = {
  pending_approval: "Awaiting Super Admin",
  active: "Approved",
  suspended: "Suspended",
  rejected: "Rejected",
}

/** The partners this Admin has asked for, with their status and the history behind each decision. */
export function AdminPartnerRequests({ business }: { business: Business }) {
  const fleets = useDeliveryFleets({ page: 1, pageSize: 50 })
  const mine = (fleets.data?.items ?? []).filter((fleet) => fleet.businesses.includes(business))
  if (fleets.isPending || mine.length === 0) return null
  return (
    <section className="partner-requests" aria-label="Partner requests">
      <h3>Partner requests</h3>
      {mine.map((fleet) => (
        <details key={fleet.id} className="partner-request">
          <summary>
            <strong>{fleet.name}</strong>
            <small>
              {fleet.code} · {fleet.zones.map((zone) => zone.name).join(", ") || "No zones yet"}
            </small>
            <AdminBadge
              tone={
                fleet.status === "active"
                  ? "success"
                  : fleet.status === "pending_approval"
                    ? "info"
                    : "danger"
              }
            >
              {REQUEST_LABEL[fleet.status] ?? fleet.status}
            </AdminBadge>
          </summary>
          <FleetHistory fleetId={fleet.id} />
        </details>
      ))}
    </section>
  )
}

const EMPTY = {
  name: "",
  companyName: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
}

export function PartnerRequestDialog({
  business,
  close,
}: {
  business: Business
  close: () => void
}) {
  const zones = useZones()
  const request = useRequestDeliveryFleet()
  const [form, setForm] = useState(EMPTY)
  const [zoneIds, setZoneIds] = useState<string[]>([])
  const [error, setError] = useState("")
  const activeZones = zones.data ?? []
  const districtIds = new Set(
    activeZones.filter((zone) => zoneIds.includes(zone.id)).map((zone) => zone.districtId),
  )

  const toggleZone = (id: string) =>
    setZoneIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )

  const submit = async () => {
    setError("")
    if (districtIds.size !== 1) {
      setError("Choose one or more zones in the same district.")
      return
    }
    const parsed = RequestDeliveryFleetRequest.safeParse({
      ...form,
      companyName: form.companyName || undefined,
      email: form.email || undefined,
      districtId: [...districtIds][0],
      businesses: [business],
      zoneIds,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the partner details.")
      return
    }
    try {
      await request.mutateAsync(parsed.data)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The request couldn’t be sent.")
    }
  }

  const field = (key: keyof typeof EMPTY, label: string, type = "text") => (
    <label className="form-field">
      <span>{label}</span>
      <input
        type={type}
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      />
    </label>
  )

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Overlay className="drawer-backdrop">
        <Dialog.Content className="drawer" aria-describedby={undefined}>
          <div className="drawer-head">
            <div>
              <small>{businessName[business].toUpperCase()} · DELIVERY PARTNER</small>
              <Dialog.Title asChild>
                <h2>Request a delivery partner</h2>
              </Dialog.Title>
            </div>
            <Dialog.Close aria-label="Close">
              <X className="icon" size={20} />
            </Dialog.Close>
          </div>
          {request.isSuccess ? (
            <div className="confirm-details">
              <AdminBadge tone="success">
                <Check className="icon" size={14} /> Sent
              </AdminBadge>
              <p>
                {request.data.name} ({request.data.code}) is waiting for Super Admin approval. Its
                delivery boys can be added after approval.
              </p>
              <AdminButton onClick={close}>Done</AdminButton>
            </div>
          ) : (
            <>
              <div className="form-grid">
                {field("name", "Partner name *")}
                {field("companyName", "Company name")}
                {field("contactPerson", "Contact person *")}
                {field("phone", "Mobile *", "tel")}
                {field("email", "Email", "email")}
                {field("address", "Address *")}
              </div>
              <fieldset className="form-field">
                <legend>Zones you manage *</legend>
                {activeZones.length === 0 && <p>No active zones are assigned to you.</p>}
                {activeZones.map((zone) => (
                  <label key={zone.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={zoneIds.includes(zone.id)}
                      onChange={() => toggleZone(zone.id)}
                    />
                    {zone.location}, {zone.city}
                  </label>
                ))}
              </fieldset>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="card-actions">
                <AdminButton kind="secondary" onClick={close}>
                  Cancel
                </AdminButton>
                <AdminButton disabled={request.isPending} onClick={() => void submit()}>
                  Send to Super Admin
                </AdminButton>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  )
}
