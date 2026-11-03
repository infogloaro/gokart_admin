"use client"

import { ApiError } from "@zoauro/api-client"
import type { Order } from "@zoauro/shared"
import { Bike, Wand2 } from "lucide-react"
import { useState } from "react"
import { useAssignRider, useRiderSuggestions } from "@/lib/orders"
import { AdminButton } from "./ui"

/** Rider assignment for one order: suggestions, a chosen rider, or the automatic choice. */
export function RiderAssignment({ order }: { order: Order }) {
  const suggestions = useRiderSuggestions(order.id)
  const assign = useAssignRider()
  const [error, setError] = useState("")
  const assignable = order.status === "ready" || order.status === "assigned"

  const run = async (boyId?: string) => {
    setError("")
    try {
      await assign.mutateAsync({ order, boyId })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The rider couldn't be assigned.")
    }
  }

  if (order.deliveryBoyName)
    return (
      <section className="rider-assignment">
        <h4>
          <Bike size={16} /> Rider
        </h4>
        <p>{order.deliveryBoyName}</p>
      </section>
    )

  return (
    <section className="rider-assignment">
      <h4>
        <Bike size={16} /> Assign a rider
      </h4>
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
