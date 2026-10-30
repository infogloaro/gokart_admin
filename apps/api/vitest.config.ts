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
    // Finance rebuilds two months of accruals on a cold start; the default 5s is too tight.
    testTimeout: 20_000,
  },
})
