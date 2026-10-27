"use client"
// Live tracking for the Admin portal (prototype "Food live tracking" / "Shipment
// tracking"): a real OpenStreetMap of the admin's zones with the selected partner's
// order progress beside it, updated over Socket.IO.
import {
  availabilityLabel,
  orderStatusLabel,
  vehicleLabel,
  type Business,
  type OrderStatus,
  type TrackedPartner,
} from "@zoauro/shared"
import { Check, Clock, MapPin, Search, ShieldCheck } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import {
  ago,
  availabilityTone,
  useNow,
  useTrackedPartners,
  useTrackingSocket,
  useTrackingZones,
  useTrail,
  type Connection,
} from "@/lib/tracking"
import { AvailabilityControl } from "./availability"
import { AdminBadge, PageHeader } from "./ui"

const LiveMap = dynamic(() => import("@/components/tracking/live-map").then((m) => m.LiveMap), {
  ssr: false,
  loading: () => <div className="gk-map" style={{ height: 620 }} />,
})

/** The delivery steps the timeline shows, in order, for each business. */
const STAGES: Record<Business, OrderStatus[]> = {
  food: [
    "accepted",
    "preparing",
    "ready",
    "assigned",
    "picked_up",
    "out_for_delivery",
    "delivered",
  ],
  mart: ["accepted", "packed", "ready", "assigned", "picked_up", "out_for_delivery", "delivered"],
}

export function AdminTracking({ business }: { business: Business }) {
  const food = business === "food"
  const connection = useTrackingSocket()
  const now = useNow()
  const zones = useTrackingZones()
  const partners = useTrackedPartners(business)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const trail = useTrail(selected)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (partners.data ?? []).filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.currentOrder?.code.toLowerCase().includes(q),
    )
  }, [partners.data, search])
  // Default to whoever is carrying an order, then anyone on the map.
  const current =
    partners.data?.find((p) => p.id === selected) ??
    list.find((p) => p.currentOrder && p.location) ??
    list.find((p) => p.location) ??
    list[0] ??
    null
  const onMap = list.filter((p) => p.location).length

  return (
    <>
      <PageHeader
        title={food ? "Food live tracking" : "Shipment tracking"}
        subtitle={`Monitor ${food ? "active deliveries" : "parcel movement"} and partner availability in your zones.`}
        note={<LiveNote state={connection} />}
      />
      <div className="tracking-layout">
        <section className="panel map-panel">
          <div className="map-toolbar">
            <div className="search-field">
              <Search className="icon" size={17} />
              <input
                placeholder={`Search partner or ${food ? "order" : "shipment"}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search partners"
              />
            </div>
            <AdminBadge tone={onMap ? "success" : "warning"}>
              {onMap} of {list.length} on the map
            </AdminBadge>
          </div>
          <div className="live-map-wrap">
            <LiveMap
              zones={zones.data ?? []}
              partners={list}
              selectedId={current?.id ?? null}
              onSelect={setSelected}
              trail={trail.data}
              height={620}
            />
            {partners.data && onMap === 0 && (
              <div className="map-empty">
                <MapPin size={18} />
                <span>
                  <b>No live locations yet</b>
                  Pins appear when partners start a shift in the partner app.
                </span>
              </div>
            )}
          </div>
          <div className="partner-strip" role="group" aria-label="Partners in your zones">
            {list.map((p) => (
              <button
                type="button"
                key={p.id}
                aria-pressed={current?.id === p.id}
                className={current?.id === p.id ? "active" : ""}
                onClick={() => setSelected(p.id)}
              >
                <i className={`dot ${p.availability}`} />
                <strong>{p.name}</strong>
                <small>{p.location ? ago(p.location.at, now) : "No location"}</small>
              </button>
            ))}
          </div>
        </section>
        <aside className="panel tracking-detail">
          {!current ? (
            <p>No partners in your zones yet.</p>
          ) : (
            <Detail p={current} now={now} food={food} done={setToast} />
          )}
          {toast && (
            <p className="availability-toast" role="status">
              <Check className="icon" size={14} /> {toast}
            </p>
          )}
        </aside>
      </div>
    </>
  )
}

function Detail({
  p,
  now,
  food,
  done,
}: {
  p: TrackedPartner
  now: number
  food: boolean
  done: (m: string) => void
}) {
  const order = p.currentOrder
  const stages = order ? STAGES[order.business] : []
  const at = order ? stages.indexOf(order.status) : -1
  return (
    <>
      <div className="track-head">
        <div>
          <small>{food ? "ORDER" : "SHIPMENT"}</small>
          <h2>{order ? `#${order.code}` : "No active order"}</h2>
        </div>
        <AdminBadge tone={availabilityTone(p.availability)}>
          {availabilityLabel[p.availability]}
        </AdminBadge>
      </div>
      <div className="eta">
        <div>
          <small>LAST LOCATION UPDATE</small>
          <strong>{p.location ? ago(p.location.at, now) : "Not reported"}</strong>
          <span>
            {p.location?.speedKmh != null
              ? `${Math.round(p.location.speedKmh)} km/h`
              : p.availability === "offline"
                ? "Not on shift"
                : "Waiting for GPS"}
          </span>
        </div>
        <Clock className="icon" size={26} />
      </div>
      <div className="partner-mini">
        <span>{p.name.slice(0, 2).toUpperCase()}</span>
        <div>
          <strong>
            {p.name} · {p.code}
          </strong>
          <small>
            {vehicleLabel[p.vehicleType]} · {p.vehicleNumber}
          </small>
        </div>
      </div>
      <div className="location-update">
        <MapPin className="icon" size={16} />
        <span>{p.zoneName}</span>
        <b>{p.phone}</b>
      </div>
      <div className="availability-box">
        <AvailabilityControl partner={p} onDone={done} />
      </div>
      {order && (
        <>
          <h3>Delivery progress</h3>
          <div className="vertical-timeline">
            {stages.map((s, i) => (
              <div key={s} className={i < at ? "done" : i === at ? "current" : ""}>
                <span>{i < at ? <Check className="icon" size={12} /> : ""}</span>
                <div>
                  <strong>{orderStatusLabel(order.business, s)}</strong>
                  <small>{i < at ? "Done" : i === at ? "Current status" : "Pending"}</small>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="safe-notice">
        <ShieldCheck className="icon" size={17} />
        <span>
          Locations come from the partner app while the partner is on shift. Availability changes
          are recorded in the audit log.
        </span>
      </div>
    </>
  )
}

function LiveNote({ state }: { state: Connection }) {
  return (
    <span className={`live-note ${state === "live" ? "" : "pending"}`}>
      ● {state === "live" ? "Live" : state === "connecting" ? "Connecting…" : "Reconnecting…"}
    </span>
  )
}
