export interface GeoFilter {
  state?: string
  district?: string
}

export interface GeographyState {
  state: string
  districts: string[]
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

export function parseGeoFilter(query: Record<string, unknown>): GeoFilter {
  const state = text(query.state)
  const district = text(query.district)
  if (district && !state) {
    throw Object.assign(new Error("state is required when district is provided"), {
      status: 400,
    })
  }
  return { ...(state ? { state } : {}), ...(district ? { district } : {}) }
}

/** Prisma `where` fragment for models carrying `state` / `district` columns. */
export function geoWhere(geo?: GeoFilter): { state?: string; district?: string } {
  return {
    ...(geo?.state ? { state: geo.state } : {}),
    ...(geo?.district ? { district: geo.district } : {}),
  }
}

export function hasGeo(geo?: GeoFilter): boolean {
  return Boolean(geo?.state || geo?.district)
}

export function groupGeography(
  rows: Array<{ state: string | null; district: string | null }>,
): GeographyState[] {
  const byState = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row.state) continue
    const districts = byState.get(row.state) ?? new Set<string>()
    if (row.district) districts.add(row.district)
    byState.set(row.state, districts)
  }
  return [...byState.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([state, districts]) => ({ state, districts: [...districts].sort() }))
}
