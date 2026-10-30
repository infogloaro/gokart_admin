import { defineConfig, env } from "prisma/config"

// Prisma 7 does not read .env by itself.
try {
  process.loadEnvFile(".env")
} catch {
  // No local .env (CI sets the variables directly).
}

export default defineConfig({
  // One schema file per module, so each owner edits only their own file.
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file=.env prisma/seed.ts",
  },
  datasource: { url: env("DATABASE_URL") },
})
