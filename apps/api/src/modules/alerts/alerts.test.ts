import { describe, expect, it } from "vitest"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"
import { runAlertChecks } from "./alerts"

// Runs against the seeded database and Redis. Skipped when they are not reachable.
describe("smart alerts", () => {
  it("runs every check and alerts each problem once per day", async () => {
    let ready = true
    try {
      await prisma.$queryRaw`SELECT 1`
      await redis.ping()
    } catch {
      ready = false
    }
    if (!ready) return

    const keys = await redis.keys("alert:*")
    if (keys.length) await redis.del(...keys)

    const first = await runAlertChecks()
    expect(first.delayedOrders).toBeGreaterThanOrEqual(1) // the seeded delayed order
    const afterFirst = await prisma.notification.count({ where: { title: "Order delayed" } })
    expect(afterFirst).toBeGreaterThan(0)

    // A second pass in the same day sends nothing new.
    await runAlertChecks()
    const afterSecond = await prisma.notification.count({ where: { title: "Order delayed" } })
    expect(afterSecond).toBe(afterFirst)
  })
})
