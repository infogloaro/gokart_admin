"use client"
// OpenStreetMap of delivery boys, one dot per rider, coloured by availability. Leaflet
// needs `window`, so it loads in an effect; the map is re-fitted to the riders shown.
import "leaflet/dist/leaflet.css"
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

const COLOURS: Record<string, string> = {
  available: "#16a34a",
  on_delivery: "#2563eb",
  on_break: "#d97706",
  offline: "#64748b",
  suspended: "#dc2626",
}

const CHENNAI: [number, number] = [13.0827, 80.2707]

export function LiveRidersMap({ riders }: { riders: MapRider[] }) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const dots = useRef<Leaflet.LayerGroup | null>(null)
  const lib = useRef<typeof Leaflet | null>(null)
  // The map may finish loading after riders change, so it reads the latest list.
  const latest = useRef(riders)
  latest.current = riders

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
      dots.current = L.layerGroup().addTo(map.current)
      draw(latest.current)
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      dots.current = null
    }
    // Riders are drawn by the effect below; the map itself is only created once.
  }, [])

  useEffect(() => {
    draw(riders)
  }, [riders])

  function draw(list: MapRider[]) {
    const L = lib.current
    if (!L || !dots.current || !map.current) return
    dots.current.clearLayers()
    for (const rider of list) {
      L.circleMarker([rider.lat, rider.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: COLOURS[rider.availability] ?? "#64748b",
        fillOpacity: 0.95,
      })
        .bindTooltip(`${rider.name} · ${rider.code}<br />${rider.zoneName}`)
        .addTo(dots.current)
    }
    if (list.length === 0) return
    const bounds = L.latLngBounds(list.map((rider) => [rider.lat, rider.lng] as [number, number]))
    map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
  }

  return <div ref={host} className="lr-map" role="region" aria-label="Rider locations map" />
}
