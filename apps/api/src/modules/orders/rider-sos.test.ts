import { describe, expect, it } from "vitest"
import { systemActor } from "../../lib/audit"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"
import { suggestRiders } from "../delivery/delivery.service"
import { acceptOffer } from "../rider-ops/offers"
import { autoAssignReadyOrder, releaseRider, SYSTEM_MEMBER } from "./orders.service"

const ALL = { businesses: ["food", "mart"], zoneIds: null }

// A rider who can't continue loses the order and another rider takes it over. Runs against the
// seeded database; the order and riders are put back afterwards.
describe("rider SOS and reassignment", () => {
  it("hands an order that is already on the road to the next rider, keeping its status and code", async () => {
    let ready = true
    try {
      await prisma.$queryRaw`SELECT 1`
      await redis.ping()
    } catch {
      ready = false
    }
    if (!ready) return

    const candidates = await prisma.order.findMany({
      where: {
        deliveryBoyId: null,
        status: { in: ["placed", "packed", "preparing", "ready"] },
        partnerId: null,
      },
      select: { id: true, status: true },
      take: 100,
    })
    // Needs an order with an eligible rider. A temporary second rider with the same partner, zone
    // and verified documents takes over; the seed has only one rider per zone. Removed afterwards.
    let order: (typeof candidates)[number] | null = null
    let top: { id: string } | undefined
    for (const candidate of candidates) {
      ;[top] = await suggestRiders(candidate.id, SYSTEM_MEMBER)
      if (top) {
        order = candidate
        break
      }
    }
    expect(order, "the seed must include an order with an eligible free rider").not.toBeNull()
    if (!order || !top) return

    const template = await prisma.deliveryBoy.findUniqueOrThrow({
      where: { id: top.id },
      include: { documents: true },
    })
    const suffix = Date.now().toString().slice(-8)
    const { id: _id, documents, code, phone, ...copy } = template
    void _id
    const spare = await prisma.deliveryBoy.create({
      data: {
        ...copy,
        code: `SOS${suffix}`,
        phone: `9${suffix}0`.slice(0, 10),
        availability: "available",
        documents: {
          create: documents.map((d) => ({
            kind: d.kind,
            s3Key: d.s3Key,
            fileName: d.fileName,
            verifiedAt: d.verifiedAt,
          })),
        },
      },
    })
    void code
    void phone
    const original = await prisma.deliveryBoy.findMany({
      where: { id: top.id },
      select: { id: true, availability: true },
    })
    await prisma.order.update({ where: { id: order.id }, data: { status: "ready" } })
    try {
      const first = await autoAssignReadyOrder(order.id)
      await acceptOffer(first!.fleetId, first!.boyId, first!.id)
      await prisma.order.update({ where: { id: order.id }, data: { status: "picked_up" } })
      const before = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })

      const released = await releaseRider(
        order.id,
        { reason: "Flat tyre", lat: 13.08, lng: 80.27 },
        { scope: ALL },
        systemActor,
      )
      expect(released.status).toBe("picked_up")
      expect(released.deliveryBoyId).toBeNull()
      expect(released.sos?.reason).toBe("Flat tyre")
      const stuck = await prisma.deliveryBoy.findUniqueOrThrow({ where: { id: first!.boyId } })
      expect(stuck.availability).toBe("offline")

      // The next rider, never the stuck one, is offered the order and takes it over.
      const offer = await prisma.deliveryOffer.findFirst({
        where: { orderId: order.id, status: "offered" },
      })
      expect(offer, "a replacement rider is offered the order").not.toBeNull()
      expect(offer!.boyId).not.toBe(first!.boyId)
      await acceptOffer(offer!.fleetId, offer!.boyId, offer!.id)

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
      expect(after.status).toBe("picked_up")
      expect(after.deliveryBoyId).toBe(offer!.boyId)
      expect(after.sosAt).toBeNull()
      // The customer keeps the same delivery code.
      expect(after.deliveryOtpHash).toBe(before.deliveryOtpHash)
    } finally {
      await prisma.deliveryOffer.deleteMany({ where: { orderId: order.id } })
      await prisma.deliveryAssignment.deleteMany({ where: { orderId: order.id } })
      await prisma.orderEvent.deleteMany({ where: { orderId: order.id } })
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: order.status,
          deliveryBoyId: null,
          deliveryFleetId: null,
          deliveryOtpHash: null,
          otpVerifiedAt: null,
          sosAt: null,
          sosReason: null,
          sosLat: null,
          sosLng: null,
        },
      })
      for (const rider of original)
        await prisma.deliveryBoy.update({
          where: { id: rider.id },
          data: { availability: rider.availability },
        })
      await prisma.deliveryBoy.delete({ where: { id: spare.id } })
    }
  })

  it("refuses to replace a rider on an order that has none", async () => {
    let ready = true
    try {
      await prisma.$queryRaw`SELECT 1`
    } catch {
      ready = false
    }
    if (!ready) return
    const order = await prisma.order.findFirst({
      where: { deliveryBoyId: null },
      select: { id: true },
    })
    if (!order) return
    await expect(
      releaseRider(order.id, { reason: "Accident" }, { scope: ALL }, systemActor),
    ).rejects.toThrow()
  })
})
