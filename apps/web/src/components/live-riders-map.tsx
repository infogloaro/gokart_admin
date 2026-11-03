"use client"
// OpenStreetMap of delivery boys, drawn with the same rider pin as the partner map: the
// rider image in a white bubble, a status ring and a pointer tip on the exact location.
// Riders that sit on top of each other become one count badge, which zooms in on click.
// Leaflet needs `window`, so it loads in an effect; the map is re-fitted when the list changes.
import "leaflet/dist/leaflet.css"
import "./tracking/live-map.css"
import "./live-riders-map.css"
import type * as Leaflet from "leaflet"
import { useEffect, useRef } from "react"

export type MapRider = {
  id: string
  code: string
  name: string
  zoneName: string
  availability: string
  lat: number
  lng: number
}

// Same size as the partner pin, so the tip sits on the location.
const PIN = { w: 56, h: 68 }
const CHENNAI: [number, number] = [13.0827, 80.2707]

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

function pinHtml(rider: MapRider) {
  return `<span class="gk-rider ${escapeHtml(rider.availability)}"><span class="gk-rider-bubble"><img src="/rider-pin.png" alt="" draggable="false"></span><i class="gk-rider-tip"></i></span>`
}

function clusterHtml(count: number) {
  return `<span class="gk-rider gk-rider-cluster" aria-label="${count} riders"><span class="gk-rider-bubble"><img src="/rider-pin.png" alt="" draggable="false"></span><i class="gk-rider-tip"></i><b class="gk-count">${count}</b></span>`
}

export function LiveRidersMap({ riders }: { riders: MapRider[] }) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const pins = useRef<Leaflet.LayerGroup | null>(null)
  const lib = useRef<typeof Leaflet | null>(null)
  // The map may finish loading after riders change, so it reads the latest list.
  const latest = useRef(riders)
  latest.current = riders
  // Draws the current list; a zoom regroups the pins without moving the map.
  const redraw = useRef<(fit: boolean) => void>(() => {})

  // Create the map once, when the component mounts on the client.
  useEffect(() => {
    let cancelled = false
    void import("leaflet").then((L) => {
      if (cancelled || !host.current) return
      lib.current = L
      map.current = L.map(host.current, { zoomControl: true, attributionControl: true }).setView(
        CHENNAI,
        7,
      )
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map.current)
      pins.current = L.layerGroup().addTo(map.current)
      map.current.on("zoomend", () => redraw.current(false))
      redraw.current(true)
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      pins.current = null
    }
    // Riders are drawn by the effect below; the map itself is only created once.
  }, [])

  useEffect(() => {
    redraw.current(true)
  }, [riders])

  redraw.current = (fit: boolean) => {
    const L = lib.current
    const m = map.current
    const layer = pins.current
    if (!L || !m || !layer) return
    const list = latest.current
    layer.clearLayers()

    // Riders whose pins would overlap at this zoom share one cell and one badge.
    const zoom = m.getZoom()
    const cells = new Map<string, MapRider[]>()
    for (const rider of list) {
      const point = m.project([rider.lat, rider.lng], zoom)
      const key = `${Math.floor(point.x / PIN.w)}:${Math.floor(point.y / PIN.w)}`
      cells.set(key, [...(cells.get(key) ?? []), rider])
    }

    for (const group of cells.values()) {
      if (group.length === 1) {
        const [rider] = group
        L.marker([rider!.lat, rider!.lng], {
          icon: L.divIcon({
            html: pinHtml(rider!),
            className: "gk-pin-wrap",
            iconSize: [PIN.w, PIN.h],
            iconAnchor: [PIN.w / 2, PIN.h],
          }),
          title: rider!.name,
        })
          .bindTooltip(
            `<strong>${escapeHtml(rider!.name)}</strong><br />${escapeHtml(rider!.code)} · ${escapeHtml(rider!.zoneName)}`,
          )
          .addTo(layer)
        continue
      }
      const bounds = L.latLngBounds(
        group.map((rider) => [rider.lat, rider.lng] as [number, number]),
      )
      L.marker(bounds.getCenter(), {
        icon: L.divIcon({
          html: clusterHtml(group.length),
          className: "gk-cluster-wrap",
          iconSize: [PIN.w, PIN.h],
          iconAnchor: [PIN.w / 2, PIN.h],
        }),
        title: `${group.length} riders`,
      })
        .on("click", () => m.fitBounds(bounds.pad(0.2), { maxZoom: 16 }))
        .addTo(layer)
    }

    if (!fit || list.length === 0) return
    const bounds = L.latLngBounds(list.map((rider) => [rider.lat, rider.lng] as [number, number]))
    m.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
  }

  return <div ref={host} className="gk-map lr-map" role="region" aria-label="Rider locations map" />
}
