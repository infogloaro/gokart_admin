// Rider operations against the seeded database: notices and support stay inside the Admin's zones,
// cash handover is confirmed once, and support tickets get a reply and can be resolved.
// Skipped when the database or Redis is not reachable.
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const sent: { to: string; text: string }[] = []
vi.mock("../../lib/mailer", () => ({
  sendMail: async (to: string, _subject: string, text: string) => {
    sent.push({ to, text })
  },
}))

const { createApp } = await import("../../app")
const { prisma } = await import("../../lib/prisma")
const { redis } = await import("../../lib/redis")

let ready = false
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await redis.connect().catch(() => {})
    await redis.ping()
    ready = (await prisma.member.count()) > 0
  } catch {
    ready = false
  }
})
afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

const app = createApp()

async function signIn(email: string, password: string) {
  const agent = request.agent(app)
  const loginLimits = await redis.keys("rl:login:*")
  if (loginLimits.length) await redis.del(...loginLimits)
  const start = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(start.status).toBe(200)
  await agent
    .post("/api/v1/auth/send-code")
    .send({ challengeId: start.body.challengeId, method: "email" })
    .expect(200)
  const code = sent.findLast((m) => m.to === email)!.text.match(/\b(\d{6})\b/)![1]
  const verify = await agent
    .post("/api/v1/auth/verify")
    .send({ challengeId: start.body.challengeId, code })
  expect(verify.status).toBe(200)
  return agent
}

describe("rider operations", () => {
  it("keeps notices and support inside the Admin's zones, and confirms cash handover once", async (ctx) => {
    if (!ready) ctx.skip()
    const admin = await prisma.member.findUniqueOrThrow({
      where: { email: "ravi.chandran@gokart.in" },
      select: { id: true, zones: { select: { zoneId: true } } },
    })
    const zoneIds = admin.zones.map((row) => row.zoneId)
    const inZone = await prisma.deliveryBoy.findFirstOrThrow({
      where: { status: "active", zoneId: { in: zoneIds } },
      select: { id: true, zoneId: true },
    })
    const outside = await prisma.deliveryBoy.findFirst({
      where: { status: "active", zoneId: { notIn: zoneIds } },
      select: { id: true },
    })
    const agent = await signIn("ravi.chandran@gokart.in", "Admin@123")

    // A notice to a rider in the zone reaches that rider.
    const before = await prisma.deliveryBoyNotification.count({ where: { boyId: inZone.id } })
    const notice = await agent
      .post("/api/v1/delivery/notices")
      .send({
        boyIds: [inZone.id],
        title: "Test notice",
        body: "Please check your vehicle papers.",
      })
      .expect(201)
    expect(notice.body.sent).toBe(1)
    expect(await prisma.deliveryBoyNotification.count({ where: { boyId: inZone.id } })).toBe(
      before + 1,
    )

    // A notice to a rider outside the zones is refused.
    if (outside) {
      await agent
        .post("/api/v1/delivery/notices")
        .send({ boyIds: [outside.id], title: "Test notice", body: "Outside the zone." })
        .expect(400)
    }

    // A support ticket: the team replies, then resolves it; resolving twice is refused.
    const ticket = await prisma.riderSupportTicket.create({
      data: {
        boyId: inZone.id,
        subject: "Test ticket",
        messages: { create: { fromRole: "rider", authorName: "Rider", body: "Test problem" } },
      },
    })
    try {
      const listed = await agent.get("/api/v1/delivery/support?status=open").expect(200)
      expect(listed.body.items.map((t: { id: string }) => t.id)).toContain(ticket.id)
      await agent
        .post(`/api/v1/delivery/support/${ticket.id}/reply`)
        .send({ body: "We are looking into it." })
        .expect(201)
      await agent.post(`/api/v1/delivery/support/${ticket.id}/resolve`).expect(200)
      await agent.post(`/api/v1/delivery/support/${ticket.id}/resolve`).expect(409)
    } finally {
      await prisma.riderSupportTicket.delete({ where: { id: ticket.id } })
    }

    // Cash handover: a collection is confirmed once, then refused.
    const candidates = await prisma.order.findMany({
      where: { deliveryBoyId: { not: null } },
      select: { id: true, zoneId: true },
      take: 20,
    })
    const taken = new Set(
      (
        await prisma.codCollection.findMany({
          where: { orderId: { in: candidates.map((c) => c.id) } },
          select: { orderId: true },
        })
      ).map((row) => row.orderId),
    )
    const order = candidates.find((c) => !taken.has(c.id))
    if (order) {
      const cod = await prisma.codCollection.create({
        data: { orderId: order.id, boyId: inZone.id, zoneId: order.zoneId, amountPaise: 12_300 },
      })
      try {
        await agent.post(`/api/v1/delivery/cod/${cod.id}/handover`).expect(200)
        const row = await prisma.codCollection.findUniqueOrThrow({ where: { id: cod.id } })
        expect(row.status).toBe("handed_over")
        expect(row.confirmedById).toBe(admin.id)
        await agent.post(`/api/v1/delivery/cod/${cod.id}/handover`).expect(409)
      } finally {
        await prisma.codCollection.delete({ where: { id: cod.id } })
      }
    }
  })
})
