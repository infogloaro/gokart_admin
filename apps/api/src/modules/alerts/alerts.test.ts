import { describe, expect, it } from "vitest"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"
import { distanceKm } from "../../lib/geo"
import { escalateOverdueAlerts, raiseAlert, runAlertChecks } from "./alerts"

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

  it("sends an open delayed-order alert to Super Admins once, after the escalation time", async () => {
    let ready = true
    try {
      await prisma.$queryRaw`SELECT 1`
    } catch {
      ready = false
    }
    if (!ready) return

    const marker = `escalation-test-${Date.now()}`
    const now = Date.now()
    await raiseAlert(prisma, {
      kind: "delayed_order",
      subject: marker,
      business: "food",
      zoneId: null,
      title: "Order delayed",
      body: `${marker} is still placed after the limit.`,
      link: null,
      now,
    })
    const later = now + 31 * 60_000
    await escalateOverdueAlerts(later)
    const sent = await prisma.notification.count({ where: { body: { contains: marker } } })
    expect(sent).toBeGreaterThan(0)

    // The same alert is never escalated twice.
    await escalateOverdueAlerts(later + 60_000)
    const again = await prisma.notification.count({ where: { body: { contains: marker } } })
    expect(again).toBe(sent)
  })

  it("measures distance on the ground, so a rider 20 km out is flagged and one 1 km out is not", () => {
    const centre = { lat: 13.0827, lng: 80.2707 }
    const near = { lat: 13.0917, lng: 80.2707 }
    const far = { lat: 13.2627, lng: 80.2707 }
    expect(distanceKm(centre, near)).toBeCloseTo(1, 0)
    expect(distanceKm(centre, far)).toBeGreaterThan(18)
    expect(distanceKm(centre, far)).toBeLessThan(22)
  })
})
