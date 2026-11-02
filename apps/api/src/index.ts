import "./openapi/zod-extend"
import { createServer } from "node:http"
import { createApp } from "./app"
import { env } from "./config/env"
import { prisma } from "./lib/prisma"
import { attachRealtime, closeRealtime } from "./lib/realtime"
import { redis } from "./lib/redis"
import { runAlertChecks } from "./modules/alerts/alerts"
import { relayOutbox } from "./modules/notifications/notifications"
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

// Business events become notifications a few seconds after they are committed.
const relay = setInterval(() => {
  relayOutbox().catch((e: unknown) => console.error("Outbox relay failed", e))
}, 5_000)
relay.unref()

// Smart alerts: delayed orders, failed payments and suspended vendors with open orders.
const alerts = setInterval(() => {
  runAlertChecks().catch((e: unknown) => console.error("Alert checks failed", e))
}, 60_000)
alerts.unref()

async function shutdown() {
  clearInterval(sweeper)
  clearInterval(relay)
  clearInterval(alerts)
  await closeRealtime()
  server.close()
  await Promise.allSettled([prisma.$disconnect(), redis.quit()])
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
