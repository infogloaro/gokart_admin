// Adds every Indian state / union territory district from the catalog to the districts table so
// zones can be created in any of them. Existing districts (matched on state + name) are left
// alone, and the old "Maharastra" spelling is corrected. Safe to re-run.
//   pnpm --filter @zoauro/api db:india
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { prisma } from "../src/lib/prisma"
import { INDIA_GEOGRAPHY } from "../src/modules/geography-catalog"

const stateCode = (state: string) =>
  state
    .split(/\s+/)
    .filter((word) => word.toLowerCase() !== "and")
    .map((word) => word[0]!.toUpperCase())
    .join("")
    .slice(0, 3)

const districtCode = (state: string, name: string) =>
  `${stateCode(state)}-${name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(
      0,
      7,
    )}-${createHash("sha256").update(`${state}|${name}`.toLowerCase()).digest("hex").slice(0, 4).toUpperCase()}`

export async function syncIndia() {
  const typo = await prisma.district.updateMany({
    where: { state: "Maharastra" },
    data: { state: "Maharashtra" },
  })
  let added = 0
  for (const { state, districts } of INDIA_GEOGRAPHY)
    for (const name of districts) {
      const existing = await prisma.district.findUnique({ where: { state_name: { state, name } } })
      if (existing) continue
      await prisma.district.create({ data: { code: districtCode(state, name), name, state } })
      added++
    }
  return { added, corrected: typo.count }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  syncIndia()
    .then(({ added, corrected }) =>
      console.info(
        `Added ${added} districts across India; corrected ${corrected} state spellings.`,
      ),
    )
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
