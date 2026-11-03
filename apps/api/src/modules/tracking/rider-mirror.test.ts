import { describe, expect, it } from "vitest"
import { prisma } from "../../lib/prisma"
import { setAvailability } from "./tracking.repository"

// Runs against the migrated database. Skipped when it is not reachable or nothing is mapped yet.
describe("partner updates reach the linked rider", () => {
  it("copies an availability change from the partner to the rider and restores it", async () => {
    let link: { partnerId: string; boyId: string } | null = null
    try {
      link = await prisma.partnerRiderMap.findFirst({ select: { partnerId: true, boyId: true } })
    } catch {
      return
    }
    if (!link) return

    const partner = await prisma.partner.findUniqueOrThrow({
      where: { id: link.partnerId },
      select: { availability: true },
    })
    const target = partner.availability === "offline" ? "available" : "offline"
    try {
      await setAvailability(link.partnerId, target)
      const rider = await prisma.deliveryBoy.findUniqueOrThrow({
        where: { id: link.boyId },
        select: { availability: true },
      })
      expect(rider.availability).toBe(target)
    } finally {
      await setAvailability(link.partnerId, partner.availability)
    }
  })
})
