// State and district filter shared by Finance and Reports. A district belongs to a state and
// owns zones, so a filter resolves to the zone ids inside it.
import { z } from "zod"
import { prisma } from "../lib/prisma"

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

/** States and districts that have zones the member can see. */
export async function geographyOptions(allowed: string[] | null): Promise<GeographyState[]> {
  const districts = await prisma.district.findMany({
    where: { active: true, zones: { some: allowed ? { id: { in: allowed } } : {} } },
    select: { state: true, name: true },
    orderBy: [{ state: "asc" }, { name: "asc" }],
  })
  const byState = new Map<string, string[]>()
  for (const d of districts) byState.set(d.state, [...(byState.get(d.state) ?? []), d.name])
  return [...byState].map(([state, names]) => ({ state, districts: names }))
}
