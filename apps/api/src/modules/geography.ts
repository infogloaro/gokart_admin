// State and district filter shared by Finance and Reports. A district belongs to a state and
// owns zones, so a filter resolves to the zone ids inside it.
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { INDIA_GEOGRAPHY } from "./geography-catalog"

export const GeoQuery = z
  .object({
    state: z.string().trim().min(1).optional(),
    district: z.string().trim().min(1).optional(),
  })
  .refine((g) => !g.district || g.state, { message: "state is required when district is given" })
export type Geo = z.infer<typeof GeoQuery>

export type GeographyState = { state: string; districts: string[] }

/** Zone ids inside the chosen state / district, limited to the member's own zones. */
export async function geoZoneIds(geo: Geo, allowed: string[] | null): Promise<string[] | null> {
  if (!geo.state) return allowed
  const zones = await prisma.zone.findMany({
    where: {
      districtRecord: { state: geo.state, ...(geo.district && { name: geo.district }) },
      ...(allowed && { id: { in: allowed } }),
    },
    select: { id: true },
  })
  return zones.map((z) => z.id)
}

/** Union of two lists, so states and districts in the data but not in the catalog still appear. */
export function mergeGeography(base: GeographyState[], extra: GeographyState[]): GeographyState[] {
  const byState = new Map<string, Set<string>>()
  for (const item of [...base, ...extra]) {
    const districts = byState.get(item.state) ?? new Set<string>()
    for (const district of item.districts) districts.add(district)
    byState.set(item.state, districts)
  }
  return [...byState]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([state, districts]) => ({ state, districts: [...districts].sort() }))
}

/**
 * Every state and union territory of India with its districts for Super Admins, plus any
 * district set up here. An Admin only sees the states and districts of their own zones.
 */
export async function geographyOptions(allowed: string[] | null): Promise<GeographyState[]> {
  const districts = await prisma.district.findMany({
    where: { active: true, zones: { some: allowed ? { id: { in: allowed } } : {} } },
    select: { state: true, name: true },
  })
  const own = mergeGeography(
    [],
    districts.map((d) => ({ state: d.state, districts: [d.name] })),
  )
  return allowed ? own : mergeGeography(INDIA_GEOGRAPHY, own)
}
