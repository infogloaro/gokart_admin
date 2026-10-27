import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// Placeholder document: each module adds its own paths here as it lands,
// ideally generated from the Zod schemas in packages/shared.
const document = {
  openapi: "3.1.0",
  info: { title: "GoKart Admin API", version: "0.1.0" },
  paths: {
    "/health": {
      get: {
        summary: "Service health check",
        responses: {
          "200": { description: "Postgres and Redis are both reachable" },
          "503": { description: "Postgres or Redis is unreachable" },
        },
      },
    },
  },
}

const outPath = fileURLToPath(new URL("../openapi.json", import.meta.url))
writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`)
console.log(`Wrote ${outPath}`)
