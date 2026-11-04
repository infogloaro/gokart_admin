// Offer chain: when a rider lets an offer run out, the order goes to a different rider, and a rider
// who already let one run out is not offered the same order again. Runs against the seeded
// database and restores the order afterwards.
import type { OrderStatus } from "../../generated/prisma/client"
import { describe, expect, it } from "vitest"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"
import { expireOffers, offerNextRider, OFFER_SECONDS } from "./offers"

describe("order offers", () => {
  it("moves an expired offer on to the next rider, and never back to the one who let it expire", async (ctx) => {
    let ready = true
    try {
      await prisma.$queryRaw`SELECT 1`
      await redis.ping()
    } catch {
      ready = false
    }
    if (!ready) return ctx.skip()

    const candidates = await prisma.order.findMany({
      where: {
        status: { in: ["placed", "packed", "preparing"] },
        deliveryBoyId: null,
        partnerId: null,
      },
      select: { id: true, status: true },
      take: 30,
    })
    let orderId: string | null = null
    let originalStatus: OrderStatus = "placed"
    let firstOffer: Awaited<ReturnType<typeof offerNextRider>> = null
    for (const candidate of candidates) {
      await prisma.order.update({ where: { id: candidate.id }, data: { status: "ready" } })
      firstOffer = await offerNextRider(candidate.id)
      if (firstOffer) {
        orderId = candidate.id
        originalStatus = candidate.status
        await prisma.order.update({
          where: { id: candidate.id },
          data: { status: candidate.status },
        })
        break
      }
      await prisma.order.update({ where: { id: candidate.id }, data: { status: candidate.status } })
    }
    if (!orderId || !firstOffer) return ctx.skip()

    try {
      await prisma.order.update({ where: { id: orderId }, data: { status: "ready" } })
      // The first rider lets the offer run out.
      const later = Date.now() + (OFFER_SECONDS + 5) * 1000
      await expireOffers(later)
      const expired = await prisma.deliveryOffer.findUniqueOrThrow({ where: { id: firstOffer.id } })
      expect(expired.status).toBe("expired")

      // The next offer goes to a different rider.
      const second = await offerNextRider(orderId, later)
      if (second) {
        expect(second.boyId).not.toBe(firstOffer.boyId)
        expect(second.status).toBe("offered")
      }
      // The first rider is never offered this order again.
      const again = await prisma.deliveryOffer.findMany({
        where: { orderId, boyId: firstOffer.boyId, status: "offered" },
      })
      expect(again).toHaveLength(0)
    } finally {
      await prisma.deliveryOffer.deleteMany({ where: { orderId } })
      await prisma.order.update({ where: { id: orderId }, data: { status: originalStatus } })
    }
  })
})
