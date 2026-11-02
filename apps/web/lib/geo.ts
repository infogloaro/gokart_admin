import type { GeoSelection } from "@/types/dashboard"

export function geoParams(geo: GeoSelection): Record<string, string | undefined> {
  return { state: geo.state, district: geo.district }
}

export function geoLabel(geo: GeoSelection): string {
  if (geo.state && geo.district) return `${geo.district}, ${geo.state}`
  return geo.state ?? "All India"
}
