"use client"
// OpenStreetMap view shared by both portals. Leaflet needs `window`, so it loads in an
// effect; markers move by setLatLng and a CSS transition, so pins glide between pings.
import "leaflet/dist/leaflet.css"
import "./live-map.css"
import type { TrackedPartner, TrackingZone } from "@zoauro/shared"
import type * as Leaflet from "leaflet"
import { useEffect, useRef, useState } from "react"
import { hasValidLocation, isStaleLocation } from "@/lib/tracking"

type Props = {
  zones: TrackingZone[]
  partners: TrackedPartner[]
  selectedId: string | null
  onSelect: (id: string) => void
  trail?: { lat: number; lng: number }[] | undefined
  /** Fits the map to this zone instead of every zone in scope. */
  focusZoneId?: string | undefined
  height?: number | string
  /** Pixels to keep the selected pin left of centre, when a card covers the right side. */
  cardOffset?: number
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  )

/** Pin size: the rider bubble plus its pointer tip, which marks the exact spot. */
const PIN = { w: 56, h: 68 }

type PinState = {
  selected: boolean
  /** Another partner is selected: fade this one so the selected rider stands out. */
  dimmed: boolean
  stale: boolean
  /** No GPS yet: placed at the centre of the partner's service area. */
  approximate: boolean
}

/** The partner's initials, for the pin: "Divya M" becomes "DM". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()

/**
 * A partner pin: the partner's initials in a white bubble with a status ring and a
 * pointer tip. The ring colour shows availability.
 */
function iconHtml(p: TrackedPartner, s: PinState, zoneName: string | undefined) {
  const classes = [
    "gk-rider",
    p.availability,
    s.stale && "stale",
    s.selected && "selected",
    s.dimmed && "dimmed",
    s.approximate && "approximate",
  ]
    .filter(Boolean)
    .join(" ")
  const pulse = p.availability === "available" && !s.stale && !s.approximate
  const detail = s.approximate
    ? `Approximate · no GPS yet${zoneName ? ` · ${escapeHtml(zoneName)}` : ""}`
    : s.stale
      ? "Last known location"
      : escapeHtml(p.code)
  const label = s.selected
    ? `<span class="gk-rider-name">${escapeHtml(p.name)}<small>${detail}</small></span>`
    : ""
  return `<span class="${classes}"><span class="gk-rider-bubble">${pulse ? '<i class="gk-rider-pulse"></i>' : ""}<span class="gk-initials">${escapeHtml(initials(p.name))}</span></span><i class="gk-rider-tip"></i></span>${label}`
}

export function LiveMap({
  zones,
  partners,
  selectedId,
  onSelect,
  trail,
  focusZoneId,
  height = "100%",
  cardOffset = 0,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const L = useRef<typeof Leaflet | null>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const markers = useRef(new Map<string, Leaflet.Marker>())
  const clusters = useRef(new Map<string, Leaflet.Marker>())
  const zoneLayer = useRef<Leaflet.LayerGroup | null>(null)
  const trailLine = useRef<Leaflet.Polyline | null>(null)
  const select = useRef(onSelect)
  select.current = onSelect
  const ready = useRef<Promise<void> | null>(null)
  const [now, setNow] = useState(Date.now())
  const selectedPartner = selectedId
    ? partners.find((partner) => partner.id === selectedId)
    : undefined

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // Create the map once.
  useEffect(() => {
    let cancelled = false
    let resize: ResizeObserver | undefined
    ready.current = import("leaflet").then((mod) => {
      if (cancelled || !host.current) return
      L.current = mod
      map.current = mod
        .map(host.current, { zoomControl: true, attributionControl: true })
        .setView([11.1, 78.6], 7)
      mod
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
        .addTo(map.current)
      zoneLayer.current = mod.layerGroup().addTo(map.current)
      // Leaflet measures its box once; re-measure when the layout settles or resizes.
      resize = new ResizeObserver(() => map.current?.invalidateSize())
      resize.observe(host.current)
    })
    return () => {
      cancelled = true
      resize?.disconnect()
      map.current?.remove()
      map.current = null
      markers.current.clear()
      clusters.current.clear()
    }
  }, [])

  // Zones: soft circles.
  useEffect(() => {
    void ready.current?.then(() => {
      const mod = L.current
      if (!mod || !map.current || !zoneLayer.current) return
      zoneLayer.current.clearLayers()
      const shown = focusZoneId ? zones.filter((z) => z.id === focusZoneId) : zones
      for (const z of shown)
        mod
          .circle([z.lat, z.lng], { radius: 1800, className: "gk-zone" })
          .bindTooltip(z.name, { direction: "top", className: "gk-zone-label" })
          .addTo(zoneLayer.current)
    })
  }, [zones, focusZoneId])

  // What the map frames: a newly chosen service area, else the selected partner (their
  // pin at street level, or their area until they report a location), else every zone.
  // It reframes only when that target changes, never on routine location updates.
  const framed = useRef<string | null>(null)
  const lastFocus = useRef(focusZoneId)
  useEffect(() => {
    void ready.current?.then(() => {
      const mod = L.current
      const m = map.current
      if (!mod || !m || !zones.length) return
      const focusChanged = lastFocus.current !== focusZoneId
      lastFocus.current = focusZoneId
      const p = selectedId ? partners.find((x) => x.id === selectedId) : undefined
      const zoneOf = (id: string | undefined) => zones.find((z) => z.id === id)

      let key: string
      let frame: () => void
      const frameZone = (id: string) => {
        const z = zoneOf(id)
        key = `zone:${id}`
        frame = () => z && m.setView([z.lat, z.lng], 14)
      }
      // Centre a partner's pin, kept clear of the side card.
      const framePin = (lat: number, lng: number, minZoom: number) => () => {
        const zoom = Math.max(m.getZoom(), minZoom)
        const shift = Math.min(cardOffset, m.getSize().x / 3)
        m.setView(m.unproject(m.project([lat, lng], zoom).add([shift, 0]), zoom), zoom)
      }
      const area = p && zoneOf(p.zoneId)
      if (focusChanged && focusZoneId) frameZone(focusZoneId)
      else if (p && hasValidLocation(p.location)) {
        key = `partner:${p.id}`
        frame = framePin(p.location.lat, p.location.lng, 15)
      } else if (p && area) {
        key = `partner-area:${p.id}`
        frame = framePin(area.lat, area.lng, 14)
      } else if (focusZoneId) frameZone(focusZoneId)
      else {
        key = `all:${zones.length}`
        frame = () =>
          m.fitBounds(mod.latLngBounds(zones.map((z) => [z.lat, z.lng])), { padding: [40, 40] })
      }
      if (key! === framed.current) return
      framed.current = key!
      frame!()
    })
  }, [zones, focusZoneId, selectedId, partners, cardOffset])

  // Nearby markers share a clickable cluster until zoomed in; selected partners stay
  // individually visible so their details and highlight are never hidden.
  useEffect(() => {
    let cancelled = false
    let redraw: (() => void) | undefined
    void ready.current?.then(() => {
      const mod = L.current
      const m = map.current
      if (cancelled || !mod || !m) return

      // Where a pin goes: the partner's reported location, or, for the selected partner
      // who hasn't sent GPS yet, the centre of their service area (drawn as approximate).
      // Other partners without GPS stay off the map.
      const pinPosition = (p: TrackedPartner) => {
        if (hasValidLocation(p.location)) return p.location
        if (p.id !== selectedId) return null
        const zone = zones.find((z) => z.id === p.zoneId)
        return zone ? { lat: zone.lat, lng: zone.lng } : null
      }

      redraw = () => {
        const zoom = m.getZoom()
        const groups = new Map<string, TrackedPartner[]>()
        const seenPartners = new Set<string>()

        for (const p of partners) {
          if (seenPartners.has(p.id) || !pinPosition(p)) continue
          seenPartners.add(p.id)
          const at = pinPosition(p)!
          const point = m.project([at.lat, at.lng], zoom)
          const key =
            p.id === selectedId
              ? `partner:${p.id}`
              : `cell:${Math.floor(point.x / 56)}:${Math.floor(point.y / 56)}`
          const group = groups.get(key)
          if (group) group.push(p)
          else groups.set(key, [p])
        }

        const visibleIds = new Set<string>()
        const visibleClusters = new Set<string>()
        for (const [key, group] of groups) {
          if (group.length > 1) {
            const clusterId = key
            visibleClusters.add(clusterId)
            const points = group.flatMap((p) => {
              const at = pinPosition(p)
              return at ? [[at.lat, at.lng] as [number, number]] : []
            })
            const center = mod.latLngBounds(points).getCenter()
            // A cluster is the rider pin with a count badge, so it reads as riders on the map.
            const icon = mod.divIcon({
              html: `<span class="gk-rider gk-rider-cluster" aria-label="${group.length} delivery partners"><span class="gk-rider-bubble"><span class="gk-initials">${group.length}</span></span><i class="gk-rider-tip"></i></span>`,
              className: "gk-cluster-wrap",
              iconSize: [PIN.w, PIN.h],
              iconAnchor: [PIN.w / 2, PIN.h],
            })
            let marker = clusters.current.get(clusterId)
            if (!marker) {
              marker = mod.marker(center, {
                icon,
                keyboard: true,
                title: `${group.length} delivery partners`,
              })
              clusters.current.set(clusterId, marker)
              marker.addTo(m)
            } else {
              marker.setLatLng(center)
              marker.setIcon(icon)
              marker.options.title = `${group.length} delivery partners`
              marker.getElement()?.setAttribute("title", marker.options.title)
            }
            marker.off("click")
            marker.on("click", () => {
              const bounds = mod.latLngBounds(points)
              if (m.getZoom() >= 19 || bounds.getSouthWest().equals(bounds.getNorthEast())) {
                select.current(group[0]!.id)
              } else {
                m.fitBounds(bounds, {
                  padding: [48, 48],
                  maxZoom: Math.min(19, m.getZoom() + 3),
                })
              }
            })
            continue
          }

          const p = group[0]!
          const at = pinPosition(p)
          if (!at) continue
          visibleIds.add(p.id)
          const selected = p.id === selectedId
          const approximate = !hasValidLocation(p.location)
          const icon = mod.divIcon({
            html: iconHtml(
              p,
              {
                selected,
                dimmed: Boolean(selectedId) && !selected,
                stale: !approximate && isStaleLocation(p.location!, now),
                approximate,
              },
              zones.find((z) => z.id === p.zoneId)?.name,
            ),
            className: "gk-pin-wrap",
            // The selected pin carries a name label to the right of the rider.
            iconSize: selected ? [PIN.w + 220, PIN.h] : [PIN.w, PIN.h],
            // Anchored at the pointer tip, so the tip sits exactly on the location.
            iconAnchor: [PIN.w / 2, PIN.h],
          })
          let marker = markers.current.get(p.id)
          if (!marker) {
            marker = mod.marker([at.lat, at.lng], {
              icon,
              keyboard: true,
              title: p.name,
            })
            marker.on("click", () => select.current(p.id))
            marker.addTo(m)
            markers.current.set(p.id, marker)
          } else {
            marker.setLatLng([at.lat, at.lng])
            marker.setIcon(icon)
          }
          marker.setZIndexOffset(selected ? 1000 : 0)
        }

        for (const [id, marker] of markers.current)
          if (!visibleIds.has(id)) {
            marker.remove()
            markers.current.delete(id)
          }
        for (const [id, marker] of clusters.current)
          if (!visibleClusters.has(id)) {
            marker.remove()
            clusters.current.delete(id)
          }
      }

      m.on("zoomend", redraw)
      redraw()
    })
    return () => {
      cancelled = true
      if (redraw) map.current?.off("zoomend", redraw)
    }
  }, [partners, selectedId, now, zones])

  // Trail of the selected partner.
  useEffect(() => {
    void ready.current?.then(() => {
      const mod = L.current
      if (!mod || !map.current) return
      trailLine.current?.remove()
      trailLine.current = null
      if (trail && trail.length > 1)
        trailLine.current = mod
          .polyline(
            trail.map((t) => [t.lat, t.lng]),
            { className: "gk-trail", weight: 4 },
          )
          .addTo(map.current)
    })
  }, [trail])

  return (
    <div className="gk-map-shell" style={{ height }}>
      <div ref={host} className="gk-map" role="region" aria-label="Live partner map" />
      {selectedPartner && !hasValidLocation(selectedPartner.location) && (
        <div className="gk-map-selected-unavailable" role="status" aria-live="polite">
          <strong>
            {selectedPartner.name} · {selectedPartner.code} hasn&apos;t sent a GPS location yet
          </strong>
          <span>
            The dashed pin shows their service area
            {zones.find((z) => z.id === selectedPartner.zoneId)
              ? ` (${zones.find((z) => z.id === selectedPartner.zoneId)!.name})`
              : ""}
            . It moves to their real position once the partner app reports one.
          </span>
        </div>
      )}
      <div className="gk-map-legend" aria-label="Map marker legend">
        <span>
          <i className="available" />
          Online
        </span>
        <span>
          <i className="on_delivery" />
          On delivery
        </span>
        <span>
          <i className="offline" />
          Offline or last known
        </span>
        <span>
          <i className="approximate" />
          Approximate (no GPS)
        </span>
        <span>
          <i className="cluster" />
          Several partners
        </span>
      </div>
    </div>
  )
}
