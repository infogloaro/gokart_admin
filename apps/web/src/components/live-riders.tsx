"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import { Bike } from "lucide-react"

const when = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  return minutes < 1
    ? "just now"
    : minutes < 60
      ? `${minutes} min ago`
      : `${Math.round(minutes / 60)} hr ago`
}

/** Delivery boys who reported a position recently, with a map link for each. */
export function LiveRiders() {
  const q = useQuery({
    queryKey: ["riders", "live"],
    queryFn: () => api("get", "/delivery/riders/live"),
    refetchInterval: 30_000,
  })
  const riders = q.data ?? []
  return (
    <section className="live-riders" aria-label="Live riders">
      <header>
        <h3>
          <Bike size={16} /> Riders live
        </h3>
        <p>
          {riders.length} rider{riders.length === 1 ? "" : "s"} reported a position in the last six
          hours (latest 200).
        </p>
      </header>
      {q.isPending && <p className="lr-empty">Loading riders…</p>}
      {q.isError && (
        <p className="lr-error" role="alert">
          Riders couldn’t be loaded.
        </p>
      )}
      {!q.isPending && riders.length === 0 && (
        <p className="lr-empty">No rider has reported a position yet.</p>
      )}
      {riders.length > 0 && (
        <div className="lr-table-wrap">
          <table className="lr-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Partner</th>
                <th>Zone</th>
                <th>Status</th>
                <th>Active orders</th>
                <th>Last seen</th>
                <th>Map</th>
              </tr>
            </thead>
            <tbody>
              {riders.map((rider) => (
                <tr key={rider.id}>
                  <td>
                    <strong>{rider.name}</strong>
                    <small>{rider.code}</small>
                  </td>
                  <td>{rider.fleetName}</td>
                  <td>{rider.zoneName}</td>
                  <td>
                    <span className={`lr-status ${rider.availability}`}>
                      {rider.availability.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>{rider.activeOrders}</td>
                  <td>{when(rider.lastSeenAt)}</td>
                  <td>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${rider.lat}&mlon=${rider.lng}#map=16/${rider.lat}/${rider.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open map
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
