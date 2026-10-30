// Writes openapi/openapi.json from the Zod schemas registered by each module.
// Run `pnpm openapi` from the repo root; it also regenerates @zoauro/api-client.
import { mkdirSync, writeFileSync } from "node:fs"

process.env.DATABASE_URL ??= "postgresql://unused"
process.env.REDIS_URL ??= "redis://unused"
process.env.SESSION_SECRET ??= "openapi-generation-only-secret"

await import("../src/openapi/zod-extend")
const { createApp } = await import("../src/app")
const { buildDocument } = await import("../src/openapi/registry")
createApp() // imports every module's registrations
mkdirSync("openapi", { recursive: true })
writeFileSync("openapi/openapi.json", JSON.stringify(buildDocument(), null, 2) + "\n")
console.info("Wrote apps/api/openapi/openapi.json")
process.exit(0)
