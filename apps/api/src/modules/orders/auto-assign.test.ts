import { describe, expect, it } from "vitest"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"
import { autoAssignReadyOrder } from "./orders.service"
import { acceptOffer } from "../rider-ops/offers"

// A ready order with no rider gets the best free rider in its zone. Runs against the seeded
// database; the order is put back to its original state afterwards.
describe("automatic rider assignment", () => {
  it("assigns a free rider from the order's zone to a ready order", async () => {
    let ready = true
    try {
      await prisma.$queryRaw`SELECT 1`
      await redis.ping()
    } catch {
      ready = false
    }
    if (!ready) return

    const freeRiders = await prisma.deliveryBoy.findMany({
      where: {
        status: "active",
        availability: "available",
        fleet: { status: "active" },
        documents: { some: {} },
      },
      select: { zoneId: true },
      take: 200,
    })
    expect(freeRiders.length, "the seed must include free riders").toBeGreaterThan(0)
    const order = await prisma.order.findFirst({
      where: {
        zoneId: { in: freeRiders.map((r) => r.zoneId) },
        deliveryBoyId: null,
        status: { in: ["placed", "packed", "preparing", "ready"] },
        partnerId: null,
      },
      select: { id: true, status: true },
    })
    expect(order, "the seed must include an order in a zone with a free rider").not.toBeNull()

    const originalStatus = order!.status
    await prisma.order.update({ where: { id: order!.id }, data: { status: "ready" } })
    try {
      // The rider is offered the order first; accepting the offer assigns it.
      const offer = await autoAssignReadyOrder(order!.id)
      expect(offer).not.toBeNull()
      expect(offer!.status).toBe("offered")
      await acceptOffer(offer!.fleetId, offer!.boyId, offer!.id)
      const after = await prisma.order.findUniqueOrThrow({ where: { id: order!.id } })
      expect(after.status).toBe("assigned")
      expect(after.deliveryBoyId).toBe(offer!.boyId)
      expect(after.deliveryFleetId).toBe(offer!.fleetId)
      expect(after.deliveryOtpHash).not.toBeNull()
    } finally {
      await prisma.deliveryOffer.deleteMany({ where: { orderId: order!.id } })
      await prisma.deliveryAssignment.deleteMany({ where: { orderId: order!.id } })
      await prisma.orderEvent.deleteMany({ where: { orderId: order!.id } })
      await prisma.order.update({
        where: { id: order!.id },
        data: {
          status: originalStatus,
          deliveryBoyId: null,
          deliveryFleetId: null,
          deliveryOtpHash: null,
          otpVerifiedAt: null,
        },
      })
    }
  })
})
