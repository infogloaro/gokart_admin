import { defineConfig } from "vitest/config"

try {
  process.loadEnvFile(".env")
} catch {
  // CI provides the variables.
}

export default defineConfig({
  test: {
    env: { NODE_ENV: "test" },
    setupFiles: ["src/openapi/zod-extend.ts"],
    // Integration tests share one database and Redis.
    fileParallelism: false,
  },
})
