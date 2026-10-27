import "./openapi/zod-extend"
import { createServer } from "node:http"
import { createApp } from "./app"
import { env } from "./config/env"
import { prisma } from "./lib/prisma"
import { attachRealtime, closeRealtime } from "./lib/realtime"
import { redis } from "./lib/redis"
import { sweepStale } from "./modules/tracking/tracking.service"

const server = createServer(createApp())
attachRealtime(server)
server.listen(env.PORT, () =>
  console.info(`GoKart API listening on http://localhost:${env.PORT}/api/v1`),
)

// Partners who stop sending locations go offline (see STALE_AFTER_SECONDS).
const sweeper = setInterval(() => {
  sweepStale().catch((e: unknown) => console.error("Stale partner sweep failed", e))
}, 30_000)
sweeper.unref()

async function shutdown() {
  clearInterval(sweeper)
  await closeRealtime()
  server.close()
  await Promise.allSettled([prisma.$disconnect(), redis.quit()])
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
