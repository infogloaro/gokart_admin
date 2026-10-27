"use client"
// Live partner tracking for the Super Admin portal: the prototype's partner list beside
// a real OpenStreetMap, updated over Socket.IO as the partner app reports locations.
import {
  availabilityLabel,
  orderStatusLabel,
  vehicleLabel,
  type TrackedPartner,
} from "@zoauro/shared"
import { CheckCircle2, ExternalLink, Gauge, LocateFixed, MapPin, Radio, Search } from "lucide-react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
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
import { servicesLabel } from "@/lib/partners"
import { AvailabilityButton } from "./availability"
import { PartnerDrawer } from "./partners"
import { useBusinessFilter } from "./shell"
import { Badge, Button, Input, Panel, Select } from "./ui"

const LiveMap = dynamic(() => import("@/components/tracking/live-map").then((m) => m.LiveMap), {
  ssr: false,
  loading: () => <div className="gk-map" />,
})

type Show = "active" | "all" | "available" | "on_delivery" | "offline"

export function SuperTracking() {
  const business = useBusinessFilter()
  const params = useSearchParams()
  const connection = useTrackingSocket()
  const now = useNow()
  const zones = useTrackingZones()
  const partners = useTrackedPartners(business === "all" ? undefined : business)
  const [zoneId, setZoneId] = useState("")
  const [search, setSearch] = useState("")
  const [show, setShow] = useState<Show>("active")
  const [selected, setSelected] = useState<string | null>(params.get("partner"))
  const [profile, setProfile] = useState<string | null>(null)
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
        (!zoneId || p.zoneId === zoneId) &&
        (show === "all" ||
          (show === "active" ? p.availability !== "offline" : p.availability === show)) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.currentOrder?.code.toLowerCase().includes(q)),
    )
  }, [partners.data, zoneId, show, search])
  const current = partners.data?.find((p) => p.id === selected) ?? null
  const counts = (partners.data ?? []).reduce(
    (c, p) => ({ ...c, [p.availability]: c[p.availability] + 1 }),
    { available: 0, on_delivery: 0, offline: 0 },
  )
  const onMap = list.filter((p) => p.location).length

  return (
    <>
      <div className="filters track-filters">
        <Input
          icon={Search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search partner, ID or order…"
          aria-label="Search partners or orders"
        />
        <Select value={zoneId} onChange={setZoneId}>
          <option value="">All service areas</option>
          {zones.data?.map((z) => (
            <option value={z.id} key={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
        <Select value={show} onChange={(v) => setShow(v as Show)}>
          <option value="active">Active only ({counts.available + counts.on_delivery})</option>
          <option value="available">Online ({counts.available})</option>
          <option value="on_delivery">On delivery ({counts.on_delivery})</option>
          <option value="offline">Offline ({counts.offline})</option>
          <option value="all">Everyone</option>
        </Select>
        <ConnectionBadge state={connection} />
      </div>
      <div className="tracking">
        <aside className="partner-track-list">
          <Panel
            title={show === "offline" ? "Offline partners" : "Active partners"}
            subtitle={`${list.length} listed · ${onMap} on the map`}
          >
            {list.map((p) => (
              <button
                type="button"
                className={selected === p.id ? "active" : ""}
                onClick={() => setSelected(p.id)}
                key={p.id}
              >
                <b>{p.name.slice(0, 2).toUpperCase()}</b>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.code} · {p.location ? ago(p.location.at, now) : "No location yet"}
                  </small>
                </span>
                <Badge tone={availabilityTone(p.availability)}>
                  {availabilityLabel[p.availability]}
                </Badge>
              </button>
            ))}
            {partners.data && list.length === 0 && (
              <p className="track-empty">No partners match these filters.</p>
            )}
          </Panel>
        </aside>
        <div className="map live-map">
          <LiveMap
            zones={zones.data ?? []}
            partners={list}
            selectedId={selected}
            onSelect={setSelected}
            trail={trail.data}
            focusZoneId={zoneId || undefined}
            cardOffset={current ? 150 : 0}
          />
          {partners.data && onMap === 0 && (
            <div className="map-empty">
              <Radio size={20} />
              <span>
                <b>No live locations yet</b>
                Pins appear when the partner app starts a shift and sends GPS updates.
              </span>
            </div>
          )}
          {current && (
            <TrackCard
              p={current}
              now={now}
              openProfile={() => setProfile(current.id)}
              done={setToast}
            />
          )}
          {toast && (
            <div className="drawer-toast map-toast" role="status">
              <CheckCircle2 size={16} /> {toast}
            </div>
          )}
        </div>
      </div>
      {profile && <PartnerDrawer id={profile} close={() => setProfile(null)} />}
    </>
  )
}

function TrackCard({
  p,
  now,
  openProfile,
  done,
}: {
  p: TrackedPartner
  now: number
  openProfile: () => void
  done: (m: string) => void
}) {
  return (
    <div className="track-card">
      <div className="tracked-person">
        <b>{p.name.slice(0, 2).toUpperCase()}</b>
        <span>
          <strong>{p.name}</strong>
          <small>
            {p.code} · {servicesLabel(p.businesses)}
          </small>
        </span>
      </div>
      <Badge tone={availabilityTone(p.availability)}>{availabilityLabel[p.availability]}</Badge>
      <div>
        <small>CURRENT ORDER</small>
        <b>{p.currentOrder ? p.currentOrder.code : "None"}</b>
        <span>
          {p.currentOrder
            ? orderStatusLabel(p.currentOrder.business, p.currentOrder.status)
            : p.availability === "offline"
              ? "Not on shift"
              : "Waiting for an order"}
        </span>
      </div>
      <ul className="track-facts">
        <li>
          <LocateFixed size={14} />
          {p.location ? `Location updated ${ago(p.location.at, now)}` : "No location reported"}
        </li>
        <li>
          <Gauge size={14} />
          {p.location?.speedKmh != null
            ? `${Math.round(p.location.speedKmh)} km/h`
            : "Speed unknown"}
        </li>
        <li>
          <MapPin size={14} />
          {p.zoneName} · {vehicleLabel[p.vehicleType]} {p.vehicleNumber}
        </li>
      </ul>
      <div className="track-actions">
        <AvailabilityButton partner={p} onDone={done} />
        <Button primary icon={ExternalLink} onClick={openProfile}>
          Open profile
        </Button>
      </div>
    </div>
  )
}

export function ConnectionBadge({ state }: { state: Connection }) {
  return (
    <span className={`live-badge ${state}`} aria-live="polite">
      <i />
      {state === "live" ? "Live" : state === "connecting" ? "Connecting…" : "Reconnecting…"}
    </span>
  )
}
