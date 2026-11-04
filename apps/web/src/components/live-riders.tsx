"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import { Bike, ChevronDown } from "lucide-react"
import { useMemo, useState } from "react"
import { LiveRidersMap, type MapRider } from "./live-riders-map"
import "./live-partners.css"

const when = (iso: string | null) => {
  if (!iso) return "No position yet"
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  return minutes < 1
    ? "just now"
    : minutes < 60
      ? `${minutes} min ago`
      : `${Math.round(minutes / 60)} hr ago`
}

type Rider = {
  id: string
  code: string
  name: string
  fleetName: string
  district: string
  adminName: string | null
  zoneName: string
  availability: string
  activeOrders: number
  lat: number | null
  lng: number | null
  lastSeenAt: string | null
  positionFresh: boolean
}

type LocatedRider = Rider & { lat: number; lng: number }
const hasPosition = (rider: Rider): rider is LocatedRider =>
  rider.lat !== null && rider.lng !== null

/** Riders who are not offline or suspended are counted as on shift. */
const onShift = (rider: Rider) =>
  rider.availability !== "offline" && rider.availability !== "suspended"

/**
 * Every active rider in the member's zones. The map places riders with a known position; the
 * partner groups below the map list every rider under the delivery company they work for.
 */
export function LiveRiders() {
  const q = useQuery({
    queryKey: ["riders", "live"],
    queryFn: () => api("get", "/delivery/riders/live"),
    refetchInterval: 30_000,
  })
  const riders = useMemo<Rider[]>(() => q.data ?? [], [q.data])
  const [district, setDistrict] = useState("all")
  const [riderId, setRiderId] = useState("all")

  const districts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const rider of riders) counts.set(rider.district, (counts.get(rider.district) ?? 0) + 1)
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [riders])
  const byName = useMemo(
    () =>
      [...riders].sort(
        (a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name),
      ),
    [riders],
  )
  const riderOptions = useMemo(
    () => (district === "all" ? byName : byName.filter((rider) => rider.district === district)),
    [byName, district],
  )
  // A chosen rider narrows everything to that one rider; otherwise the district does.
  const chosen = riderId === "all" ? undefined : riders.find((rider) => rider.id === riderId)
  const filtered = useMemo(
    () =>
      chosen
        ? [chosen]
        : district === "all"
          ? byName
          : byName.filter((rider) => rider.district === district),
    [chosen, district, byName],
  )
  const located = useMemo(() => filtered.filter(hasPosition), [filtered])
  const partners = useMemo(() => {
    const groups = new Map<string, Rider[]>()
    for (const rider of filtered)
      groups.set(rider.fleetName, [...(groups.get(rider.fleetName) ?? []), rider])
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])
  const freshCount = riders.filter((rider) => rider.positionFresh).length

  const pickDistrict = (name: string) => {
    setDistrict(name)
    setRiderId("all")
  }

  return (
    <section className="live-riders" aria-label="Live riders">
      <header>
        <h3>
          <Bike size={16} /> Riders live
        </h3>
        <p>
          {riders.length} active rider{riders.length === 1 ? "" : "s"} · {freshCount} reported a
          position in the last six hours
        </p>
      </header>
      {q.isPending && <p className="lr-empty">Loading riders…</p>}
      {q.isError && (
        <p className="lr-error" role="alert">
          Riders couldn’t be loaded.
        </p>
      )}
      {!q.isPending && riders.length === 0 && (
        <p className="lr-empty">No active riders in your zones yet.</p>
      )}
      {riders.length > 0 && (
        <>
          <div className="lr-filters">
            <label>
              <span>District</span>
              <select value={district} onChange={(e) => pickDistrict(e.target.value)}>
                <option value="all">All districts</option>
                {districts.map(([name]) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Rider</span>
              <select
                value={chosen ? chosen.id : "all"}
                onChange={(e) => setRiderId(e.target.value)}
              >
                <option value="all">All riders ({riderOptions.length})</option>
                {riderOptions.map((rider) => (
                  <option key={rider.id} value={rider.id}>
                    {rider.name} · {rider.code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <LiveRidersMap riders={located as MapRider[]} />
          <p className="lr-map-note">
            {located.length} of {filtered.length} riders have a position on the map.
          </p>

          <section className="lr-partners" aria-label="Delivery partners and their riders">
            <h4>Delivery partners and their riders</h4>
            {partners.length === 0 && <p className="lr-empty">No riders match these filters.</p>}
            {partners.map(([partnerName, list]) => (
              <details key={partnerName} className="lr-partner" open={partners.length <= 3}>
                <summary>
                  <ChevronDown size={16} aria-hidden="true" />
                  <strong>{partnerName}</strong>
                  <span>
                    {list.length} rider{list.length === 1 ? "" : "s"} ·{" "}
                    {list.filter(onShift).length} on shift · {list.filter(hasPosition).length} on
                    the map
                  </span>
                </summary>
                <div className="lr-table-wrap">
                  <table className="lr-table">
                    <thead>
                      <tr>
                        <th>Rider</th>
                        <th>District</th>
                        <th>Admin</th>
                        <th>Zone</th>
                        <th>Status</th>
                        <th>Active orders</th>
                        <th>Last seen</th>
                        <th>Map</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((rider) => (
                        <tr key={rider.id}>
                          <td>
                            <strong>{rider.name}</strong>
                            <small>{rider.code}</small>
                          </td>
                          <td>{rider.district}</td>
                          <td>{rider.adminName ?? "Not assigned"}</td>
                          <td>{rider.zoneName}</td>
                          <td>
                            <span className={`lr-status ${rider.availability}`}>
                              {rider.availability.replaceAll("_", " ")}
                            </span>
                          </td>
                          <td>{rider.activeOrders}</td>
                          <td>{when(rider.lastSeenAt)}</td>
                          <td>
                            {hasPosition(rider) ? (
                              <a
                                href={`https://www.openstreetmap.org/?mlat=${rider.lat}&mlon=${rider.lng}#map=16/${rider.lat}/${rider.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Open map
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </section>
        </>
      )}
    </section>
  )
}
