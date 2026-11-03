import { describe, expect, it } from "vitest"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"
import { runAlertChecks } from "./alerts"

// Runs against the seeded database and Redis. Skipped when they are not reachable.
describe("operational alerts", () => {
  it("records each problem once a day, in the alerts table and not as notifications", async () => {
    let ready = true
    try {
      await prisma.$queryRaw`SELECT 1`
      await redis.ping()
    } catch {
      ready = false
    }
    if (!ready) return

    const before = await prisma.notification.count({ where: { title: "Order delayed" } })
    await runAlertChecks()
    const first = await prisma.operationalAlert.count({ where: { kind: "delayed_order" } })
    expect(first).toBeGreaterThan(0)

    // A second pass the same day adds nothing.
    await runAlertChecks()
    const second = await prisma.operationalAlert.count({ where: { kind: "delayed_order" } })
    expect(second).toBe(first)

    // Alerts no longer create notifications.
    const after = await prisma.notification.count({ where: { title: "Order delayed" } })
    expect(after).toBe(before)
  })
})
