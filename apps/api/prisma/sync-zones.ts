// Brings the zones table in line with tamil-nadu.ts without touching anything else.
// Existing areas are matched on district + area and updated in place, so vendors,
// partners, orders and admin assignments keep their zone. Safe to re-run.
//   pnpm --filter @zoauro/api db:zones
import { pathToFileURL } from "node:url"
import { prisma } from "../src/lib/prisma"
import { tamilNaduZones } from "./tamil-nadu"

/** Returns zone ids keyed `${district}/${area}`. */
export async function syncZones() {
  const ids: Record<string, string> = {}
  const existing = await prisma.zone.findMany()
  for (const [district, city, areas] of tamilNaduZones)
    for (const [location, lat, lng] of areas) {
      const row = existing.find((z) => z.district === district && z.location === location)
      const z = row
        ? await prisma.zone.update({
            where: { id: row.id },
            data: { city, lat, lng, active: true },
          })
        : await prisma.zone.create({ data: { district, city, location, lat, lng } })
      ids[`${district}/${location}`] = z.id
    }
  return ids
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  syncZones()
    .then((ids) => console.info(`Synced ${Object.keys(ids).length} Tamil Nadu service areas.`))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
