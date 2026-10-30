"use client"
// Service areas are district → zone → area (see apps/api/prisma/tamil-nadu.ts).
// A zone is a district, or part of a large city such as "Chennai North".
import { useState } from "react"

type Area = { id: string; district: string; city: string; location: string }

const zoneKey = (a: Area) => `${a.district}|${a.city}`

/**
 * Two-step service-area choice: a zone, then an area inside it. The form keeps a
 * single zone id (the area's); changing the zone clears an area from another zone.
 */
export function useAreaPicker(
  all: Area[] | undefined,
  zoneId: string,
  onChange: (zoneId: string) => void,
) {
  const [picked, setPicked] = useState("")
  const areas = all ?? []
  const current = areas.find((a) => a.id === zoneId)
  const zone = current ? zoneKey(current) : picked
  const zones = [...new Map(areas.map((a) => [zoneKey(a), a.city])).entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return {
    zones,
    zone,
    areas: areas.filter((a) => zoneKey(a) === zone),
    district: current?.district ?? zones.find((z) => z.key === zone)?.key.split("|")[0] ?? "",
    setZone(key: string) {
      setPicked(key)
      if (current && zoneKey(current) !== key) onChange("")
    },
  }
}
