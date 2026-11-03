"use client"
// Live partner tracking for the Super Admin portal: the prototype's partner list beside
// a real OpenStreetMap, updated over Socket.IO as the partner app reports locations.
import { LiveRiders } from "@/components/live-riders"
import {
  availabilityLabel,
  orderStatusLabel,
  vehicleLabel,
  type TrackedPartner,
  type TrackingZone,
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
  hasValidLocation,
  isStaleLocation,
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
  const [show, setShow] = useState<Show>("all")
  const [selected, setSelected] = useState<string | null>(params.get("partner"))
  const [profile, setProfile] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const trail = useTrail(selected)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // Areas grouped under their zone for the filter (Chennai North, Ranipet, …).
  const byZone = useMemo(() => {
    const groups = new Map<string, TrackingZone[]>()
    for (const z of zones.data ?? []) groups.set(z.zone, [...(groups.get(z.zone) ?? []), z])
    return groups
  }, [zones.data])
  const scoped = useMemo(
    () => (partners.data ?? []).filter((p) => !zoneId || p.zoneId === zoneId),
    [partners.data, zoneId],
  )
  const counts = scoped.reduce(
    (c, p) => {
      c[p.availability] += 1
      return c
    },
    { available: 0, on_delivery: 0, offline: 0 },
  )
  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scoped.filter(
      (p) =>
        // The partner you opened (e.g. from "View live tracking") always stays listed.
        p.id === selected ||
        ((show === "all" ||
          (show === "active" ? p.availability !== "offline" : p.availability === show)) &&
          (!q ||
            p.name.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            p.currentOrder?.code.toLowerCase().includes(q))),
    )
  }, [scoped, show, search, selected])
  const current = list.find((p) => p.id === selected) ?? null
  const onMap = list.filter((p) => hasValidLocation(p.location)).length
  const stale = list.filter(
    (p) => hasValidLocation(p.location) && isStaleLocation(p.location, now),
  ).length

  return (
    <>
      <LiveRiders />
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
          {[...byZone.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([zone, areas]) => (
              <optgroup label={zone} key={zone}>
                {areas.map((z) => (
                  <option value={z.id} key={z.id}>
                    {z.name}
                  </option>
                ))}
              </optgroup>
            ))}
        </Select>
        <Select value={show} onChange={(v) => setShow(v as Show)}>
          <option value="active">Active only ({counts.available + counts.on_delivery})</option>
          <option value="available">Online ({counts.available})</option>
          <option value="on_delivery">On delivery ({counts.on_delivery})</option>
          <option value="offline">Offline ({counts.offline})</option>
          <option value="all">Everyone ({scoped.length})</option>
        </Select>
        <ConnectionBadge state={connection} />
      </div>
      <div className="tracking">
        <aside className="partner-track-list">
          <Panel
            title={
              show === "all"
                ? "All eligible partners"
                : show === "offline"
                  ? "Offline partners"
                  : show === "on_delivery"
                    ? "Partners on delivery"
                    : show === "available"
                      ? "Online partners"
                      : "Active partners"
            }
            subtitle={`${scoped.length} eligible · ${list.length} shown · ${onMap} located · ${list.length - onMap} unavailable · ${stale} stale`}
          >
            {partners.isPending && <p className="track-empty">Loading delivery partners…</p>}
            {partners.isError && (
              <p className="track-empty" role="alert">
                Could not load delivery partners. {partners.error.message}{" "}
                <button type="button" onClick={() => void partners.refetch()}>
                  Retry
                </button>
              </p>
            )}
            {partners.data &&
              list.map((p) => (
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
                      {p.code} ·{" "}
                      {!hasValidLocation(p.location)
                        ? "Location unavailable"
                        : `${isStaleLocation(p.location, now) ? "Stale · " : ""}${ago(p.location.at, now)}`}
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
          {partners.data && list.length > 0 && onMap === 0 && (
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
          {!hasValidLocation(p.location)
            ? "Location unavailable"
            : `${isStaleLocation(p.location, now) ? "Stale location · " : p.availability === "offline" ? "Last known · " : "Updated "}${ago(p.location.at, now)}`}
        </li>
        <li>
          <Gauge size={14} />
          {hasValidLocation(p.location) && p.location.speedKmh != null
            ? `${Math.round(p.location.speedKmh)} km/h${isStaleLocation(p.location, now) ? " (last reported)" : ""}`
            : "Speed unknown"}
        </li>
        <li>
          <MapPin size={14} />
          {p.zoneName} · {vehicleLabel[p.vehicleType]} {p.vehicleNumber}
          {hasValidLocation(p.location) &&
            ` · ${p.location.lat.toFixed(5)}, ${p.location.lng.toFixed(5)}`}
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
