"use client"
// OpenStreetMap view shared by both portals. Leaflet needs `window`, so it loads in an
// effect; markers move by setLatLng and a CSS transition, so pins glide between pings.
import "leaflet/dist/leaflet.css"
import "./live-map.css"
import type { TrackedPartner, TrackingZone } from "@zoauro/shared"
import type * as Leaflet from "leaflet"
import { useEffect, useRef } from "react"

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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

function iconHtml(p: TrackedPartner, selected: boolean) {
  return `<span class="gk-pin ${p.availability}${selected ? " selected" : ""}" title="${p.name}"><b>${initials(p.name)}</b>${p.availability === "available" ? '<i class="gk-pin-pulse"></i>' : ""}</span>`
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
  const zoneLayer = useRef<Leaflet.LayerGroup | null>(null)
  const trailLine = useRef<Leaflet.Polyline | null>(null)
  const select = useRef(onSelect)
  select.current = onSelect
  const ready = useRef<Promise<void> | null>(null)

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
    }
  }, [])

  // Zones: soft circles, and fit the view to them (or to the focused one).
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
      if (shown.length === 1) map.current.setView([shown[0]!.lat, shown[0]!.lng], 14)
      else if (shown.length)
        map.current.fitBounds(mod.latLngBounds(shown.map((z) => [z.lat, z.lng])), {
          padding: [40, 40],
        })
    })
  }, [zones, focusZoneId])

  // Partners: add, move or remove markers.
  useEffect(() => {
    void ready.current?.then(() => {
      const mod = L.current
      if (!mod || !map.current) return
      const seen = new Set<string>()
      for (const p of partners) {
        if (!p.location) continue
        seen.add(p.id)
        const icon = mod.divIcon({
          html: iconHtml(p, p.id === selectedId),
          className: "gk-pin-wrap",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        })
        const existing = markers.current.get(p.id)
        if (existing) {
          existing.setLatLng([p.location.lat, p.location.lng])
          existing.setIcon(icon)
          existing.setZIndexOffset(p.id === selectedId ? 1000 : 0)
        } else {
          const m = mod
            .marker([p.location.lat, p.location.lng], { icon, keyboard: true, title: p.name })
            .on("click", () => select.current(p.id))
            .addTo(map.current)
          markers.current.set(p.id, m)
        }
      }
      for (const [id, m] of markers.current)
        if (!seen.has(id)) {
          m.remove()
          markers.current.delete(id)
        }
    })
  }, [partners, selectedId])

  // Selected partner: pan to them.
  useEffect(() => {
    const p = partners.find((x) => x.id === selectedId)
    const m = map.current
    if (!p?.location || !m || !L.current) return
    // Centre the pin in the part of the map the side card doesn't cover.
    const shift = Math.min(cardOffset, m.getSize().x / 4)
    const point = m.project([p.location.lat, p.location.lng], m.getZoom()).add([shift, 0])
    m.panTo(m.unproject(point, m.getZoom()), { animate: true })
    // Only when the selection changes, not on every location update.
  }, [selectedId])

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
    <div
      ref={host}
      className="gk-map"
      style={{ height }}
      role="region"
      aria-label="Live partner map"
    />
  )
}
