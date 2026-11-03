"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import { Bike } from "lucide-react"
import { useMemo, useState } from "react"
import { LiveRidersMap, type MapRider } from "./live-riders-map"

const PAGE_SIZE = 10

const when = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  return minutes < 1
    ? "just now"
    : minutes < 60
      ? `${minutes} min ago`
      : `${Math.round(minutes / 60)} hr ago`
}

type Rider = MapRider & {
  fleetName: string
  district: string
  activeOrders: number
  lastSeenAt: string
}

/** The page numbers to show: the first, the last, and a window around the current page. */
function pageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const items: (number | "…")[] = [1]
  if (current > 3) items.push("…")
  for (let page = Math.max(2, current - 1); page <= Math.min(total - 1, current + 1); page++)
    items.push(page)
  if (current < total - 2) items.push("…")
  items.push(total)
  return items
}

/** Delivery boys who reported a position recently: filter by district or rider, see them on the map, page through the list. */
export function LiveRiders() {
  const q = useQuery({
    queryKey: ["riders", "live"],
    queryFn: () => api("get", "/delivery/riders/live"),
    refetchInterval: 30_000,
  })
  const riders = useMemo<Rider[]>(() => q.data ?? [], [q.data])
  const [district, setDistrict] = useState("all")
  const [riderId, setRiderId] = useState("all")
  const [page, setPage] = useState(1)

  const districts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const rider of riders) counts.set(rider.district, (counts.get(rider.district) ?? 0) + 1)
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [riders])
  const sorted = useMemo(
    () =>
      [...riders].sort(
        (a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name),
      ),
    [riders],
  )
  const riderOptions = useMemo(
    () => (district === "all" ? sorted : sorted.filter((rider) => rider.district === district)),
    [sorted, district],
  )
  // A chosen rider narrows everything to that one rider; otherwise the district does.
  const chosen = riderId === "all" ? undefined : riders.find((rider) => rider.id === riderId)
  const filtered = useMemo(
    () =>
      chosen
        ? [chosen]
        : district === "all"
          ? sorted
          : sorted.filter((rider) => rider.district === district),
    [chosen, district, sorted],
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const pickDistrict = (name: string) => {
    setDistrict(name)
    setRiderId("all")
    setPage(1)
  }
  const pickRider = (id: string) => {
    setRiderId(id)
    setPage(1)
  }

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
        <>
          <div className="lr-filters">
            <label>
              <span>District</span>
              <select value={district} onChange={(e) => pickDistrict(e.target.value)}>
                <option value="all">All districts ({riders.length})</option>
                {districts.map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Rider</span>
              <select
                value={chosen ? chosen.id : "all"}
                onChange={(e) => pickRider(e.target.value)}
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
          <LiveRidersMap riders={filtered} />
          <div className="lr-table-wrap">
            <table className="lr-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>District</th>
                  <th>Partner</th>
                  <th>Zone</th>
                  <th>Status</th>
                  <th>Active orders</th>
                  <th>Last seen</th>
                  <th>Map</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((rider) => (
                  <tr key={rider.id}>
                    <td>
                      <strong>{rider.name}</strong>
                      <small>{rider.code}</small>
                    </td>
                    <td>{rider.district}</td>
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
          <nav className="lr-pager" aria-label="Riders pages">
            <p>
              {filtered.length} rider{filtered.length === 1 ? "" : "s"}
            </p>
            <div>
              <button
                type="button"
                aria-label="Previous page"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                &lt;
              </button>
              {pageItems(current, totalPages).map((item, index) =>
                item === "…" ? (
                  <span key={`gap-${index}`}>…</span>
                ) : (
                  <button
                    type="button"
                    key={item}
                    aria-current={item === current ? "page" : undefined}
                    className={item === current ? "active" : ""}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                aria-label="Next page"
                disabled={current === totalPages}
                onClick={() => setPage(current + 1)}
              >
                &gt;
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  )
}
