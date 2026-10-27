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
    const order = await prisma.order.findFirstOrThrow({
      where: { business: "food", status: "placed" },
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
