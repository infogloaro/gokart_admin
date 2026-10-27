// End-to-end API checks against a migrated, seeded database and Redis
// (`pnpm services:up && pnpm db:migrate && pnpm db:seed`). Skipped when they are not reachable.
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const sent: { to: string; text: string }[] = []
vi.mock("./lib/mailer", () => ({
  sendMail: async (to: string, _subject: string, text: string) => {
    sent.push({ to, text })
  },
}))

const { createApp } = await import("./app")
const { prisma } = await import("./lib/prisma")
const { redis } = await import("./lib/redis")

let ready = false
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await redis.connect().catch(() => {})
    await redis.ping()
    await redis.flushdb() // clears rate limits and old sessions between runs
    ready = (await prisma.member.count()) > 0
  } catch {
    ready = false
  }
  if (!ready) console.warn("Integration tests skipped: start services, migrate and seed first.")
})
afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

const app = createApp()
const lastCode = (to: string) => sent.findLast((m) => m.to === to)!.text.match(/\b(\d{6})\b/)![1]

/** Password, then an emailed code. */
async function signIn(email: string, password: string) {
  const agent = request.agent(app)
  const start = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(start.status).toBe(200)
  await agent
    .post("/api/v1/auth/send-code")
    .send({ challengeId: start.body.challengeId, method: "email" })
    .expect(200)
  const verify = await agent
    .post("/api/v1/auth/verify")
    .send({ challengeId: start.body.challengeId, code: lastCode(email) })
  expect(verify.status).toBe(200)
  return { agent, me: verify.body }
}

describe("sign-in", () => {
  it("rejects a wrong password without saying which part was wrong", async (ctx) => {
    if (!ready) ctx.skip()
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "superadmin@gokart.in", password: "nope" })
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe("The email or password is incorrect. Please try again.")
  })

  it("lists the member's verification methods, marking ones not set up", async (ctx) => {
    if (!ready) ctx.skip()
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "fathima.begum@gokart.in", password: "Admin@123" })
    expect(res.status).toBe(200)
    const byMethod = Object.fromEntries(
      res.body.options.map((o: { method: string }) => [o.method, o]),
    )
    expect(byMethod.email).toMatchObject({ available: true, destination: "f******m@gokart.in" })
    expect(byMethod.sms).toMatchObject({
      available: false,
      destination: "No mobile number on file",
    })
    expect(byMethod.totp.available).toBe(false)
    // Choosing a method that isn't set up is refused.
    await request(app)
      .post("/api/v1/auth/send-code")
      .send({ challengeId: res.body.challengeId, method: "sms" })
      .expect(400)
  })

  it("needs a method chosen before a code is checked", async (ctx) => {
    if (!ready) ctx.skip()
    const start = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@gokart.in", password: "Admin@123" })
    const res = await request(app)
      .post("/api/v1/auth/verify")
      .send({ challengeId: start.body.challengeId, code: "123456" })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe("Choose how you want to receive your code first.")
  })

  it("rejects a wrong code and counts attempts", async (ctx) => {
    if (!ready) ctx.skip()
    const start = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@gokart.in", password: "Admin@123" })
    await request(app)
      .post("/api/v1/auth/send-code")
      .send({ challengeId: start.body.challengeId, method: "email" })
      .expect(200)
    const res = await request(app)
      .post("/api/v1/auth/verify")
      .send({ challengeId: start.body.challengeId, code: "000000" })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.code[0]).toBe("4 attempts left")
  })

  it("signs in with a mobile number and an SMS code, and remembers SMS", async (ctx) => {
    if (!ready) ctx.skip()
    const agent = request.agent(app)
    const start = await agent
      .post("/api/v1/auth/login")
      .send({ phone: "98400 23456", password: "Admin@123" })
    expect(start.status).toBe(200)
    // Signing in with a mobile number preselects SMS.
    expect(start.body.preferred).toBe("sms")
    const sms = await agent
      .post("/api/v1/auth/send-code")
      .send({ challengeId: start.body.challengeId, method: "sms" })
    expect(sms.body).toMatchObject({
      method: "sms",
      destination: "+91 98•••••456",
      resendInSeconds: 30,
    })
    // Asking again straight away is refused.
    await agent
      .post("/api/v1/auth/resend")
      .send({ challengeId: start.body.challengeId })
      .expect(429)
    const verify = await agent
      .post("/api/v1/auth/verify")
      .send({ challengeId: start.body.challengeId, code: lastCode("919840023456@sms.local") })
    expect(verify.status).toBe(200)
    expect(verify.body).toMatchObject({ name: "Ananya Kapoor", preferredMfa: "sms" })
    // Signing in with the email preselects the email code, even though SMS was used last.
    const next = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@gokart.in", password: "Admin@123" })
    expect(next.body.preferred).toBe("email")
  })

  it("sets up an authenticator app and signs in with it", async (ctx) => {
    if (!ready) ctx.skip()
    const { generate } = await import("otplib")
    const { agent } = await signIn("ravi.chandran@gokart.in", "Admin@123")
    const setup = await agent.post("/api/v1/auth/totp/setup").expect(200)
    const secret = new URL(setup.body.otpauthUrl).searchParams.get("secret")!
    await agent.post("/api/v1/auth/totp/confirm").send({ code: "000000" }).expect(400)
    await agent
      .post("/api/v1/auth/totp/confirm")
      .send({ code: await generate({ secret }) })
      .expect(204)

    const start = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ravi.chandran@gokart.in", password: "Admin@123" })
    const totp = start.body.options.find((o: { method: string }) => o.method === "totp")
    expect(totp.available).toBe(true)
    const choose = await request(app)
      .post("/api/v1/auth/send-code")
      .send({ challengeId: start.body.challengeId, method: "totp" })
    expect(choose.body).toMatchObject({ method: "totp", resendInSeconds: 0 })
    await request(app)
      .post("/api/v1/auth/verify")
      .send({ challengeId: start.body.challengeId, code: await generate({ secret }) })
      .expect(200)
  })

  it("signs in with password + emailed code and returns the member", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent, me } = await signIn("superadmin@gokart.in", "Gokart@12345")
    expect(me).toMatchObject({ name: "Arjun Menon", role: "super_admin", initials: "AM" })
    expect(me.permissions).toContain("finance.approve")
    const again = await agent.get("/api/v1/auth/me")
    expect(again.status).toBe(200)
    await agent.post("/api/v1/auth/logout").expect(204)
    await agent.get("/api/v1/auth/me").expect(401)
  })
})

describe("orders", () => {
  it("scopes admins to their business and zones", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("priya.shankar@gokart.in", "Admin@123")
    await agent.get("/api/v1/orders?business=mart").expect(403)
    const food = await agent.get("/api/v1/orders?business=food&pageSize=100")
    expect(food.status).toBe(200)
    const chennai = await prisma.zone.findMany({ where: { city: "Chennai" }, select: { id: true } })
    const ids = new Set(chennai.map((z) => z.id))
    expect(food.body.items.length).toBeGreaterThan(0)
    expect(food.body.items.every((o: { zoneId: string }) => ids.has(o.zoneId))).toBe(true)
    // An order outside her zones looks like it doesn't exist.
    const elsewhere = await prisma.order.findFirst({
      where: { business: "food", zoneId: { notIn: [...ids] } },
    })
    if (elsewhere) await agent.get(`/api/v1/orders/${elsewhere.id}`).expect(404)
  })

  it("moves an order through the state machine with a version check and an audit entry", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    // Its own order, so repeated runs don't use up the seeded "placed" ones.
    const vendor = await prisma.vendor.findFirstOrThrow({ where: { name: "Saffron Table" } })
    const order = await prisma.order.create({
      data: {
        code: "ZOF-TEST-1",
        business: "food",
        customerName: "Test Customer",
        customerPhone: "+919800000002",
        vendorId: vendor.id,
        zoneId: vendor.zoneId,
        paymentMethod: "upi",
        itemsTotalPaise: 20000,
        deliveryFeePaise: 3800,
        totalPaise: 23800,
      },
    })
    ctx.onTestFinished(async () => {
      await prisma.orderEvent.deleteMany({ where: { orderId: order.id } })
      await prisma.auditLog.deleteMany({ where: { entityId: order.id } })
      await prisma.order.delete({ where: { id: order.id } })
    })

    const bad = await agent
      .post(`/api/v1/orders/${order.id}/status`)
      .send({ to: "delivered", version: order.version })
    expect(bad.status).toBe(400)

    const ok = await agent
      .post(`/api/v1/orders/${order.id}/status`)
      .send({ to: "accepted", version: order.version })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ status: "accepted", version: order.version + 1 })

    const stale = await agent
      .post(`/api/v1/orders/${order.id}/status`)
      .send({ to: "preparing", version: order.version })
    expect(stale.status).toBe(409)

    const noReason = await agent
      .post(`/api/v1/orders/${order.id}/status`)
      .send({ to: "cancelled", version: order.version + 1 })
    expect(noReason.status).toBe(400)

    const logged = await prisma.auditLog.findFirst({
      where: { entityId: order.id, action: "order.status_changed" },
    })
    expect(logged?.actorName).toBe("Arjun Menon")
    expect(
      await prisma.outboxEvent.count({ where: { topic: "order.status_changed" } }),
    ).toBeGreaterThan(0)
  })
})

describe("vendors", () => {
  it("lists vendors with order stats, scoped to the admin's business and zones", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("priya.shankar@gokart.in", "Admin@123")
    await agent.get("/api/v1/vendors?business=mart").expect(403)
    const food = await agent.get("/api/v1/vendors?pageSize=100").expect(200)
    const names = food.body.items.map((v: { name: string }) => v.name)
    expect(names).toContain("Saffron Kitchen")
    expect(names).not.toContain("Kovai Biryani House") // Coimbatore
    const saffron = food.body.items.find((v: { name: string }) => v.name === "Saffron Table")
    expect(saffron).toMatchObject({ zoneName: "T. Nagar, Chennai", commissionPct: 18 })
    expect(saffron.ordersCount).toBeGreaterThan(0)
    const kovai = await prisma.vendor.findFirstOrThrow({ where: { name: "Kovai Biryani House" } })
    await agent.get(`/api/v1/vendors/${kovai.id}`).expect(404)
    // Admins can't approve.
    await agent
      .post(`/api/v1/vendors/${saffron.id}/decision`)
      .send({ decision: "suspend" })
      .expect(403)
  })

  it("adds a vendor for review, then approves it with an audit entry", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const zone = await prisma.zone.findFirstOrThrow({ where: { location: "Egmore" } })
    const body = {
      business: "food",
      name: "Test Tiffin Centre",
      ownerName: "Test Owner",
      phone: "98400 99999",
      email: "tiffin@example.com",
      address: "12, Test Street, Egmore",
      zoneId: zone.id,
      commissionPct: 18,
    }
    const noFssai = await agent.post("/api/v1/vendors").send(body)
    expect(noFssai.status).toBe(400)
    const created = await agent.post("/api/v1/vendors").send({ ...body, fssai: "12345678901234" })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ status: "pending_review", verification: "under_review" })
    try {
      const noReason = await agent
        .post(`/api/v1/vendors/${created.body.id}/decision`)
        .send({ decision: "reject" })
      expect(noReason.status).toBe(400)
      const ok = await agent
        .post(`/api/v1/vendors/${created.body.id}/decision`)
        .send({ decision: "approve" })
      expect(ok.status).toBe(200)
      expect(ok.body).toMatchObject({ status: "active", verification: "verified" })
      expect(ok.body.activity.map((a: { action: string }) => a.action)).toEqual([
        "vendor.approved",
        "vendor.created",
      ])
      const twice = await agent
        .post(`/api/v1/vendors/${created.body.id}/decision`)
        .send({ decision: "approve" })
      expect(twice.status).toBe(400)
    } finally {
      await prisma.vendor.delete({ where: { id: created.body.id } })
    }
  })
})

describe("partners", () => {
  it("shows multi-business partners to admins of either business, within their zones", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("ravi.chandran@gokart.in", "Admin@123")
    const mart = await agent.get("/api/v1/partners?pageSize=100").expect(200)
    const codes = mart.body.items.map((p: { code: string }) => p.code)
    expect(codes).toContain("DP-2379")
    expect(codes).not.toContain("DP-2381") // food + mart, but in Chennai
    const summary = await agent.get("/api/v1/partners/summary").expect(200)
    expect(summary.body.total).toBe(mart.body.total)
  })

  it("takes an admin's application and lets only a Super Admin decide it", async (ctx) => {
    if (!ready) ctx.skip()
    const admin = (await signIn("admin@gokart.in", "Admin@123")).agent
    const zone = await prisma.zone.findFirstOrThrow({ where: { location: "Adyar" } })
    const elsewhere = await prisma.zone.findFirstOrThrow({ where: { city: "Madurai" } })
    const body = {
      name: "Test Rider",
      phone: "98400 88888",
      businesses: ["food"],
      zoneId: zone.id,
      vehicleType: "scooter",
      vehicleNumber: "tn 09 xy 1234",
      drivingLicence: "TN0920200012345",
      bank: {
        holderName: "Test Rider",
        bankName: "HDFC Bank",
        accountNumber: "50100012345678",
        ifsc: "hdfc0001284",
      },
    }
    await admin
      .post("/api/v1/partners")
      .send({ ...body, zoneId: elsewhere.id })
      .expect(403)
    const created = await admin.post("/api/v1/partners").send(body)
    expect(created.status).toBe(201)
    try {
      expect(created.body).toMatchObject({
        status: "pending_approval",
        vehicleNumber: "TN 09 XY 1234",
        phone: "+919840088888",
        submittedByName: "Ananya Kapoor",
        bank: { last4: "5678", ifsc: "HDFC0001284", verified: false },
      })
      const dup = await admin.post("/api/v1/partners").send(body)
      expect(dup.status).toBe(400)
      await admin
        .post(`/api/v1/partners/${created.body.id}/decision`)
        .send({ decision: "approve" })
        .expect(403)

      const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
      const rejected = await agent
        .post(`/api/v1/partners/${created.body.id}/decision`)
        .send({ decision: "reject", reason: "Driving license issue" })
      expect(rejected.status).toBe(200)
      expect(rejected.body).toMatchObject({
        status: "rejected",
        decisionReason: "Driving license issue",
        decidedByName: "Arjun Menon",
      })
      expect(rejected.body.activity[0]).toMatchObject({
        action: "partner.rejected",
        reason: "Driving license issue",
      })
    } finally {
      await prisma.bankAccount.deleteMany({ where: { accountId: created.body.id } })
      await prisma.partner.delete({ where: { id: created.body.id } })
    }
  })
})

describe("partner profile", () => {
  it("sorts by performance and returns earnings data in the detail", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const sorted = await agent.get("/api/v1/partners?sort=performance&pageSize=100").expect(200)
    const counts = sorted.body.items.map(
      (p: { deliveriesCompleted: number }) => p.deliveriesCompleted,
    )
    expect(counts).toEqual([...counts].sort((a: number, b: number) => b - a))
    const top = sorted.body.items[0]
    const detail = await agent.get(`/api/v1/partners/${top.id}`).expect(200)
    expect(detail.body.payPlan).toMatchObject({ perDeliveryPaise: expect.any(Number) })
    expect(detail.body.updatedAt).toEqual(expect.any(String))
    const carried = await agent.get(`/api/v1/orders?partnerId=${top.id}&pageSize=100`).expect(200)
    expect(carried.body.items.every((o: { partnerId: string }) => o.partnerId === top.id)).toBe(
      true,
    )
  })

  it("lets a Super Admin edit a profile with a stale-write check", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const p = await prisma.partner.findFirstOrThrow({ where: { code: "DP-2386" } })
    const before = { vehicleModel: p.vehicleModel, updatedAt: p.updatedAt }
    try {
      const ok = await agent
        .patch(`/api/v1/partners/${p.id}`)
        .send({ vehicleModel: "TVS Jupiter", updatedAt: p.updatedAt.toISOString() })
      expect(ok.status).toBe(200)
      expect(ok.body.vehicleModel).toBe("TVS Jupiter")
      expect(ok.body.activity[0]).toMatchObject({ action: "partner.updated" })
      const stale = await agent
        .patch(`/api/v1/partners/${p.id}`)
        .send({ vehicleModel: "Honda Activa", updatedAt: p.updatedAt.toISOString() })
      expect(stale.status).toBe(409)
      const admin = (await signIn("ravi.chandran@gokart.in", "Admin@123")).agent
      await admin
        .patch(`/api/v1/partners/${p.id}`)
        .send({ vehicleModel: "Honda Activa", updatedAt: ok.body.updatedAt })
        .expect(403)
    } finally {
      await prisma.partner.update({
        where: { id: p.id },
        data: { vehicleModel: before.vehicleModel },
      })
      await prisma.auditLog.deleteMany({ where: { entityId: p.id, action: "partner.updated" } })
    }
  })
})

describe("live tracking", () => {
  const key = { "x-intake-key": "dev-intake-key-not-for-production" }

  it("rejects intake calls without the shared key", async (ctx) => {
    if (!ready) ctx.skip()
    await request(app)
      .post("/api/v1/intake/partners/DP-2379/shift")
      .send({ action: "start" })
      .expect(401)
  })

  it("follows shift, location, order progress and an Admin override", async (ctx) => {
    if (!ready) ctx.skip()
    const p = await prisma.partner.findFirstOrThrow({ where: { code: "DP-2379" } })
    const vendor = await prisma.vendor.findFirstOrThrow({ where: { name: "Meenakshi Mart" } })
    const order = await prisma.order.create({
      data: {
        code: "GLM-TEST-1",
        business: "mart",
        status: "ready",
        customerName: "Test Customer",
        customerPhone: "+919800000001",
        vendorId: vendor.id,
        zoneId: p.zoneId,
        paymentMethod: "upi",
        paymentStatus: "paid",
        itemsTotalPaise: 10000,
        deliveryFeePaise: 4900,
        totalPaise: 14900,
      },
    })
    const intake = (path: string, body: object) =>
      request(app).post(`/api/v1/intake${path}`).set(key).send(body)
    try {
      await intake("/partners/DP-2379/shift", { action: "end" }).expect(200)
      await intake("/partners/DP-2379/location", { lat: 9.92, lng: 78.11 }).expect(400)
      const on = await intake("/partners/DP-2379/shift", { action: "start" }).expect(200)
      expect(on.body.availability).toBe("available")
      await intake("/partners/DP-2379/location", {
        lat: 9.9181,
        lng: 78.1152,
        speedKmh: 22,
      }).expect(202)

      const { agent } = await signIn("ravi.chandran@gokart.in", "Admin@123")
      const map = await agent.get("/api/v1/tracking/partners").expect(200)
      const me = map.body.find((x: { code: string }) => x.code === "DP-2379")
      expect(me).toMatchObject({
        availability: "available",
        location: { lat: 9.9181, lng: 78.1152 },
      })
      expect(map.body.every((x: { zoneName: string }) => x.zoneName.endsWith("Madurai"))).toBe(true)
      const zones = await agent.get("/api/v1/tracking/zones").expect(200)
      expect(zones.body.every((z: { lat: number }) => typeof z.lat === "number")).toBe(true)

      await intake("/orders/GLM-TEST-1/status", { partnerCode: "DP-2379", to: "assigned" }).expect(
        200,
      )
      let row = await prisma.partner.findUniqueOrThrow({ where: { id: p.id } })
      expect(row.availability).toBe("on_delivery")
      // Mart goes assigned → picked up → in transit → delivered.
      for (const to of ["picked_up", "out_for_delivery", "delivered"])
        await intake("/orders/GLM-TEST-1/status", { partnerCode: "DP-2379", to }).expect(200)
      // Back to available, unless the seed gives her other orders she's still carrying.
      const stillCarrying = await prisma.order.count({
        where: { partnerId: p.id, status: { in: ["assigned", "picked_up", "out_for_delivery"] } },
      })
      row = await prisma.partner.findUniqueOrThrow({ where: { id: p.id } })
      expect(row.availability).toBe(stillCarrying ? "on_delivery" : "available")

      const trail = await agent.get(`/api/v1/tracking/partners/${p.id}/trail`).expect(200)
      expect(trail.body.length).toBeGreaterThan(0)

      const noReason = await agent
        .post(`/api/v1/tracking/partners/${p.id}/availability`)
        .send({ availability: "offline" })
      expect(noReason.status).toBe(400)
      const off = await agent
        .post(`/api/v1/tracking/partners/${p.id}/availability`)
        .send({ availability: "offline", reason: "Phone switched off mid-shift" })
      expect(off.status).toBe(200)
      expect(off.body.availability).toBe("offline")
      const logged = await prisma.auditLog.findFirst({
        where: { entityId: p.id, action: "partner.availability_changed" },
        orderBy: { at: "desc" },
      })
      expect(logged?.actorName).toBe("Ravi Chandran")

      // Outside her zones, a Chennai admin can't see or change this partner.
      const chennai = (await signIn("priya.shankar@gokart.in", "Admin@123")).agent
      await chennai
        .post(`/api/v1/tracking/partners/${p.id}/availability`)
        .send({ availability: "available", reason: "Testing scope" })
        .expect(404)
    } finally {
      await prisma.orderEvent.deleteMany({ where: { orderId: order.id } })
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: [order.id, p.id] }, at: { gte: new Date(Date.now() - 60_000) } },
      })
      await prisma.order.delete({ where: { id: order.id } })
      await prisma.partnerLocation.deleteMany({ where: { partnerId: p.id } })
      await prisma.partner.update({ where: { id: p.id }, data: { availability: p.availability } })
      await redis.del(`track:loc:${p.id}`)
      await redis.zrem("track:seen", p.id)
    }
  })
})

describe("vendor profile", () => {
  it("sorts by orders, filters orders by vendor and lets a Super Admin edit", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const sorted = await agent.get("/api/v1/vendors?sort=orders&pageSize=100").expect(200)
    const counts = sorted.body.items.map((v: { ordersCount: number }) => v.ordersCount)
    expect(counts).toEqual([...counts].sort((a: number, b: number) => b - a))
    const top = sorted.body.items[0]
    const orders = await agent.get(`/api/v1/orders?vendorId=${top.id}&pageSize=100`).expect(200)
    expect(orders.body.total).toBe(top.ordersCount)
    const summary = await agent.get("/api/v1/vendors/summary").expect(200)
    expect(summary.body[0]).toHaveProperty("rejected")

    const v = await prisma.vendor.findFirstOrThrow({ where: { code: "VEN-1044" } })
    try {
      const ok = await agent
        .patch(`/api/v1/vendors/${v.id}`)
        .send({ commissionPct: 16.5, updatedAt: v.updatedAt.toISOString() })
      expect(ok.status).toBe(200)
      expect(ok.body).toMatchObject({ commissionPct: 16.5 })
      expect(ok.body.activity[0]).toMatchObject({ action: "vendor.updated" })
      await agent
        .patch(`/api/v1/vendors/${v.id}`)
        .send({ commissionPct: 15, updatedAt: v.updatedAt.toISOString() })
        .expect(409)
      const admin = (await signIn("priya.shankar@gokart.in", "Admin@123")).agent
      await admin
        .patch(`/api/v1/vendors/${v.id}`)
        .send({ commissionPct: 15, updatedAt: ok.body.updatedAt })
        .expect(403)
    } finally {
      await prisma.vendor.update({ where: { id: v.id }, data: { commissionBps: v.commissionBps } })
      await prisma.auditLog.deleteMany({ where: { entityId: v.id, action: "vendor.updated" } })
    }
  })
})

describe("vendor onboarding", () => {
  it("saves every wizard field and keeps only the last four bank digits", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const zone = await prisma.zone.findFirstOrThrow({ where: { location: "Adyar" } })
    const created = await agent.post("/api/v1/vendors").send({
      business: "food",
      name: "Test Mess",
      ownerName: "Test Owner",
      phone: "98400 77777",
      email: "mess@example.com",
      address: "3, Test Road, Adyar",
      zoneId: zone.id,
      fssai: "12345678901234",
      commissionPct: 17,
      category: "South Indian",
      launchPreference: "paused",
      ownerPhone: "98400 66666",
      pan: "abcde1234f",
      pinCode: "600020",
      settlementCycle: "weekly",
      bank: {
        holderName: "Test Owner",
        bankName: "ICICI Bank",
        accountNumber: "002101998877",
        ifsc: "icic0001845",
        upiId: "testmess@icici",
      },
    })
    expect(created.status).toBe(201)
    try {
      expect(created.body).toMatchObject({
        category: "South Indian",
        launchPreference: "paused",
        ownerPhone: "+919840066666",
        panMasked: "ABCDE••••F",
        pinCode: "600020",
        settlementCycle: "weekly",
        bank: { last4: "8877", ifsc: "ICIC0001845", upiId: "testmess@icici", verified: false },
      })
      const bad = await agent
        .post("/api/v1/vendors")
        .send({ ...created.body, business: "food", pan: "BAD", commissionPct: 17 })
      expect(bad.status).toBe(400)
    } finally {
      await prisma.bankAccount.deleteMany({ where: { accountId: created.body.id } })
      await prisma.auditLog.deleteMany({ where: { entityId: created.body.id } })
      await prisma.vendor.delete({ where: { id: created.body.id } })
    }
  })
})
