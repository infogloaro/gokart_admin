"use client"

import { ApiError } from "@zoauro/api-client"
import type { Order } from "@zoauro/shared"
import { Bike, KeyRound, Siren, Wand2 } from "lucide-react"
import { useState } from "react"
import { useResendCode } from "@/lib/rider-ops"
import { useAssignRider, useReleaseRider, useRiderSuggestions } from "@/lib/orders"
import { AdminButton } from "./ui"

/** Rider assignment for one order: suggestions, a chosen rider, or the automatic choice. */
export function RiderAssignment({ order }: { order: Order }) {
  const suggestions = useRiderSuggestions(order.id)
  const assign = useAssignRider()
  const resend = useResendCode()
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  const release = useReleaseRider()
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState("")
  const onTheRoad = order.status === "picked_up" || order.status === "out_for_delivery"
  // An order on the road can be handed to another rider only after its rider raised an SOS.
  const assignable =
    order.status === "ready" || order.status === "assigned" || (onTheRoad && order.sos !== null)

  const run = async (boyId?: string) => {
    setError("")
    try {
      await assign.mutateAsync({ order, boyId })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The rider couldn't be assigned.")
    }
  }

  if (order.deliveryBoyName) {
    const open = order.status !== "delivered" && order.status !== "cancelled"
    return (
      <section className="rider-assignment">
        <h4>
          <Bike size={16} /> Rider
        </h4>
        <p>{order.deliveryBoyName}</p>
        {open && (
          <>
            <AdminButton
              kind="secondary"
              icon={KeyRound}
              disabled={resend.isPending}
              onClick={() => {
                setError("")
                setSent(false)
                resend
                  .mutateAsync(order.id)
                  .then(() => setSent(true))
                  .catch((cause) =>
                    setError(
                      cause instanceof ApiError ? cause.message : "The code couldn't be sent.",
                    ),
                  )
              }}
            >
              Resend delivery code
            </AdminButton>
            {sent && <p role="status">A new code was texted to the customer.</p>}
            {!asking ? (
              <AdminButton kind="danger" icon={Siren} onClick={() => setAsking(true)}>
                Rider can&apos;t continue
              </AdminButton>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  setError("")
                  release
                    .mutateAsync({ order, reason })
                    .then(() => (setAsking(false), setReason("")))
                    .catch((cause) =>
                      setError(
                        cause instanceof ApiError
                          ? cause.message
                          : "The order couldn't be moved to another rider.",
                      ),
                    )
                }}
              >
                <label>
                  What happened?
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Accident, flat tyre, vehicle breakdown…"
                    maxLength={300}
                    required
                    minLength={3}
                  />
                </label>
                <p>
                  {onTheRoad
                    ? "The nearest free rider will be asked to collect the order from them."
                    : "The order goes back to ready and the next free rider is asked."}
                </p>
                <AdminButton kind="danger" type="submit" disabled={release.isPending}>
                  Find another rider
                </AdminButton>
                <AdminButton kind="ghost" onClick={() => setAsking(false)}>
                  Cancel
                </AdminButton>
              </form>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="rider-assignment">
      <h4>
        <Bike size={16} /> Assign a rider
      </h4>
      {order.sos && (
        <p role="alert" className="form-error">
          <Siren size={14} /> SOS: the previous rider couldn&apos;t continue — {order.sos.reason}.
          {onTheRoad && " The order is with them; the new rider collects it from where they are."}
        </p>
      )}
      {!assignable && <p>Riders can be assigned once the order is ready.</p>}
      {assignable && (
        <>
          <AdminButton icon={Wand2} disabled={assign.isPending} onClick={() => void run()}>
            Assign automatically
          </AdminButton>
          {suggestions.isPending && <p>Finding riders…</p>}
          {suggestions.data && suggestions.data.length === 0 && (
            <p>No rider is free in this zone right now.</p>
          )}
          <ul>
            {suggestions.data?.map((rider, index) => (
              <li key={rider.id} className={index === 0 ? "best-match" : undefined}>
                <span>
                  {index === 0 && <b className="best-tag">Best match</b>} {rider.name} ·{" "}
                  {rider.fleetName} · {rider.activeOrders}/{rider.maxActiveOrders} active
                  {rider.distanceKm !== null && ` · ${rider.distanceKm} km away`}
                </span>
                <AdminButton
                  kind="secondary"
                  disabled={assign.isPending}
                  onClick={() => void run(rider.id)}
                >
                  Assign
                </AdminButton>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  )
}
