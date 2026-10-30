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

describe("system management permissions", () => {
  it("exposes the admin, area, fee and audit data only to the Super Admin", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent: superAdmin } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const [members, zones, fees, audit] = await Promise.all([
      superAdmin.get("/api/v1/members"),
      superAdmin.get("/api/v1/settings/zones"),
      superAdmin.get("/api/v1/settings/fees?page=1&pageSize=1"),
      superAdmin.get("/api/v1/audit?page=1&pageSize=1"),
    ])
    expect(members.status).toBe(200)
    expect(members.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "admin@gokart.in" })]),
    )
    expect(zones.status).toBe(200)
    expect(zones.body.length).toBeGreaterThan(0)
    expect(fees.status).toBe(200)
    expect(fees.body.total).toBeGreaterThan(0)
    expect(audit.status).toBe(200)
    await superAdmin
      .post("/api/v1/members")
      .send({
        name: "Restricted Permission Test",
        email: "restricted-test@gokart.in",
        password: "A-secure-initial-password",
        businesses: ["food"],
        zoneIds: [zones.body[0].id],
        permissions: ["audit.view"],
      })
      .expect(403)

    const { agent: admin } = await signIn("admin@gokart.in", "Admin@123")
    const adminRecord = await prisma.member.findUniqueOrThrow({
      where: { email: "admin@gokart.in" },
      select: { id: true },
    })
    const systemPermissions = ["members.manage", "settings.manage", "audit.view"]
    const priorGrants = await prisma.memberPermission.findMany({
      where: { memberId: adminRecord.id, permission: { in: systemPermissions } },
    })
    await prisma.memberPermission.createMany({
      data: systemPermissions.map((permission) => ({ memberId: adminRecord.id, permission })),
      skipDuplicates: true,
    })
    try {
      await admin.get("/api/v1/members").expect(403)
      await admin.get("/api/v1/settings/zones").expect(403)
      await admin.get("/api/v1/settings/fees").expect(403)
      await admin.get("/api/v1/audit").expect(403)
    } finally {
      await prisma.memberPermission.deleteMany({
        where: { memberId: adminRecord.id, permission: { in: systemPermissions } },
      })
      if (priorGrants.length) await prisma.memberPermission.createMany({ data: priorGrants })
    }
  }, 30_000)
})

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

  describe("authenticator app", () => {
    const email = "ravi.chandran@gokart.in"
    const now = () => Math.floor(Date.now() / 1000)
    let secret = ""
    let backupCodes: string[] = []

    /** Password, then choose the authenticator app; returns the challenge id. */
    async function startTotpLogin() {
      const start = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password: "Admin@123" })
      await request(app)
        .post("/api/v1/auth/send-code")
        .send({ challengeId: start.body.challengeId, method: "totp" })
        .expect(200)
      return start.body.challengeId as string
    }

    beforeAll(async () => {
      if (!ready) return
      // Start from "not set up" so the suite can run repeatedly.
      const ravi = await prisma.member.findUniqueOrThrow({ where: { email } })
      await prisma.memberRecoveryCode.deleteMany({ where: { memberId: ravi.id } })
      await prisma.member.update({
        where: { id: ravi.id },
        data: { totpEnabled: false, totpSecret: null, totpLastStep: null },
      })
    })

    it("sets up with a QR code or setup key, stores the secret encrypted and returns 10 backup codes", async (ctx) => {
      if (!ready) ctx.skip()
      const { generate } = await import("otplib")
      const { agent } = await signIn(email, "Admin@123")
      const setup = await agent.post("/api/v1/auth/totp/setup").expect(200)
      expect(setup.headers["cache-control"]).toBe("no-store")
      secret = new URL(setup.body.otpauthUrl).searchParams.get("secret")!
      expect(setup.body.manualKey.replace(/\s/g, "")).toBe(secret)
      await agent.post("/api/v1/auth/totp/confirm").send({ code: "000000" }).expect(400)
      const confirm = await agent
        .post("/api/v1/auth/totp/confirm")
        .send({ code: await generate({ secret }) })
        .expect(200)
      backupCodes = confirm.body.recoveryCodes
      expect(backupCodes).toHaveLength(10)
      expect(backupCodes.every((c: string) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c))).toBe(true)

      const row = await prisma.member.findUniqueOrThrow({ where: { email } })
      expect(row.totpSecret?.startsWith("v1:")).toBe(true)
      expect(row.totpSecret).not.toContain(secret)
      const me = await agent.get("/api/v1/auth/me").expect(200)
      expect(me.body).toMatchObject({ totpEnabled: true, recoveryCodesLeft: 10 })
      // A second setup is refused while one is active.
      await agent.post("/api/v1/auth/totp/setup").expect(400)
    })

    it("signs in with the app, and refuses the same code twice", async (ctx) => {
      if (!ready) ctx.skip()
      const { generate } = await import("otplib")
      // The setup code used this 30-second step, so the next valid code is the next step's.
      const code = await generate({ secret, epoch: now() + 30 })
      const first = await startTotpLogin()
      await request(app).post("/api/v1/auth/verify").send({ challengeId: first, code }).expect(200)
      const second = await startTotpLogin()
      const replay = await request(app)
        .post("/api/v1/auth/verify")
        .send({ challengeId: second, code })
      expect(replay.status).toBe(400)
    })

    it("signs in once with each backup code and warns by email", async (ctx) => {
      if (!ready) ctx.skip()
      const challengeId = await startTotpLogin()
      const ok = await request(app)
        .post("/api/v1/auth/verify-recovery")
        .send({ challengeId, recoveryCode: backupCodes[0]!.toLowerCase().replace("-", "") })
      expect(ok.status).toBe(200)
      expect(ok.body.recoveryCodesLeft).toBe(9)
      expect(sent.findLast((m) => m.to === email)!.text).toContain("You have 9 backup codes left")

      const again = await startTotpLogin()
      const reused = await request(app)
        .post("/api/v1/auth/verify-recovery")
        .send({ challengeId: again, recoveryCode: backupCodes[0] })
      expect(reused.status).toBe(400)
      expect(reused.body.error.message).toBe(
        "That backup code isn't valid or has already been used.",
      )
    })

    it("makes new backup codes and turns off only with the right password", async (ctx) => {
      if (!ready) ctx.skip()
      const { agent } = await signIn(email, "Admin@123")
      await agent.post("/api/v1/auth/totp/recovery-codes").send({ password: "wrong" }).expect(400)
      const fresh = await agent
        .post("/api/v1/auth/totp/recovery-codes")
        .send({ password: "Admin@123" })
        .expect(200)
      expect(fresh.body.recoveryCodes).toHaveLength(10)
      // The old codes stopped working.
      const challengeId = await startTotpLogin()
      await request(app)
        .post("/api/v1/auth/verify-recovery")
        .send({ challengeId, recoveryCode: backupCodes[1] })
        .expect(400)

      await agent.post("/api/v1/auth/totp/disable").send({ password: "nope" }).expect(400)
      await agent.post("/api/v1/auth/totp/disable").send({ password: "Admin@123" }).expect(204)
      const me = await agent.get("/api/v1/auth/me").expect(200)
      expect(me.body).toMatchObject({ totpEnabled: false, recoveryCodesLeft: 0 })
      expect(await prisma.memberRecoveryCode.count({ where: { member: { email } } })).toBe(0)
      const audit = await prisma.auditLog.findFirst({
        where: { action: "auth.totp_disabled" },
        orderBy: { at: "desc" },
      })
      expect(audit?.actorName).toBe("Ravi Chandran")
    })
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
  it("scopes admins to their assigned business access and zones", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("priya.shankar@gokart.in", "Admin@123")
    const food = await agent.get("/api/v1/orders?business=food&pageSize=100")
    expect(food.status).toBe(200)
    const mart = await agent.get("/api/v1/orders?business=mart&pageSize=100").expect(200)
    const chennai = await prisma.zone.findMany({
      where: { district: "Chennai" },
      select: { id: true },
    })
    const ids = new Set(chennai.map((z) => z.id))
    expect(food.body.items.length).toBeGreaterThan(0)
    expect(food.body.items.every((o: { zoneId: string }) => ids.has(o.zoneId))).toBe(true)
    expect(mart.body.items.every((o: { zoneId: string }) => ids.has(o.zoneId))).toBe(true)
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

describe("dashboard and search", () => {
  it("reconciles Command Center totals with the orders in the period", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const res = await agent.get("/api/v1/dashboard/overview?range=90d").expect(200)
    const from = new Date(res.body.from)
    const orders = await prisma.order.findMany({
      where: { placedAt: { gte: from } },
      include: { vendor: { select: { commissionBps: true } } },
    })
    const counted = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded")
    const gross = counted.reduce((t, o) => t + o.totalPaise, 0)
    const platform = counted.reduce(
      (t, o) =>
        t + Math.floor((o.itemsTotalPaise * o.vendor.commissionBps) / 10000) + o.deliveryFeePaise,
      0,
    )
    expect(res.body.metrics.orders.value).toBe(orders.length)
    expect(res.body.metrics.grossPaise.value).toBe(gross)
    expect(res.body.metrics.platformRevenuePaise.value).toBe(platform)
    expect(res.body.trend).toHaveLength(90)
    const trendTotal = res.body.trend.reduce(
      (t: number, d: { food: number; mart: number }) => t + d.food + d.mart,
      0,
    )
    expect(trendTotal).toBe(gross)
    const dist = res.body.distribution
    expect(dist.delivered + dist.inProgress + dist.cancelled + dist.refunded).toBe(orders.length)
  })

  it("keeps an admin's dashboard, revenue and search inside assigned zones", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("priya.shankar@gokart.in", "Admin@123")
    await agent.get("/api/v1/dashboard/overview?business=mart").expect(200)
    const martRevenue = await agent.get("/api/v1/dashboard/revenue?business=mart").expect(200)
    expect(martRevenue.body.totals.grossPaise).toBe(
      martRevenue.body.totals.vendorSharePaise +
        martRevenue.body.totals.commissionPaise +
        martRevenue.body.totals.deliveryFeesPaise,
    )
    const health = await agent.get("/api/v1/dashboard/health").expect(200)
    expect(new Set(health.body.businesses.map((b: { business: string }) => b.business))).toEqual(
      new Set(["food", "mart"]),
    )

    const revenue = await agent.get("/api/v1/dashboard/revenue?business=food&range=90d").expect(200)
    const t = revenue.body.totals
    expect(t.platformPaise).toBe(t.commissionPaise + t.deliveryFeesPaise)
    expect(t.grossPaise).toBe(t.vendorSharePaise + t.commissionPaise + t.deliveryFeesPaise)

    const chennai = new Set(
      (await prisma.zone.findMany({ where: { district: "Chennai" }, select: { id: true } })).map(
        (z) => z.id,
      ),
    )
    const found = await agent.get("/api/v1/search?q=or").expect(200)
    const ids = found.body.orders.map((o: { id: string }) => o.id)
    const rows = await prisma.order.findMany({ where: { id: { in: ids } } })
    expect(rows.every((o) => chennai.has(o.zoneId))).toBe(true)
    await agent.get("/api/v1/search?q=a").expect(400)
  })

  it("finds an order by its code", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const res = await agent.get("/api/v1/search?q=ZOF-88219").expect(200)
    expect(res.body.orders[0].code).toBe("ZOF-88219")
  })
})

describe("complaints", () => {
  it("keeps admins to their zones, and runs assign → escalate → resolve with history and notifications", async (ctx) => {
    if (!ready) ctx.skip()
    const priya = (await signIn("priya.shankar@gokart.in", "Admin@123")).agent
    // Its own complaint in a Chennai zone, so repeated runs don't use up the seeded ones.
    const zone = await prisma.zone.findFirstOrThrow({ where: { district: "Chennai" } })
    const created = await prisma.complaint.create({
      data: {
        code: `CMP-T${Date.now()}`,
        business: "food",
        zoneId: zone.id,
        category: "missing_item",
        customerName: "Test Customer",
        summary: "Missing item in the bag",
        details: "Created by the integration test.",
        evidence: [],
      },
    })
    const list = await priya
      .get(`/api/v1/complaints?business=food&status=open&search=${created.code}`)
      .expect(200)
    expect(list.body.items).toHaveLength(1)
    let c = list.body.items[0]

    // Ravi looks after Madurai; a Chennai complaint looks like it doesn't exist.
    const ravi = (await signIn("ravi.chandran@gokart.in", "Admin@123")).agent
    await ravi.get(`/api/v1/complaints/${c.id}`).expect(404)
    const raviList = await ravi.get("/api/v1/complaints?business=food").expect(200)
    expect(raviList.body.items.some((x: { id: string }) => x.id === c.id)).toBe(false)

    // Assign to herself: moves to in review and writes a history note.
    const people = await priya.get(`/api/v1/complaints/${c.id}/assignees`).expect(200)
    const me = people.body.find((p: { name: string }) => p.name === "Priya Shankar")
    c = (
      await priya
        .post(`/api/v1/complaints/${c.id}/assign`)
        .send({ version: c.version, assigneeId: me.id })
        .expect(200)
    ).body
    expect(c.status).toBe("in_review")
    expect(c.notes.at(-1).kind).toBe("assigned")

    // A stale version is refused.
    await priya
      .post(`/api/v1/complaints/${c.id}/escalate`)
      .send({ version: c.version - 1, reason: "Needs a Super Admin decision" })
      .expect(409)

    const before = await prisma.notification.count({ where: { title: "Complaint escalated" } })
    c = (
      await priya
        .post(`/api/v1/complaints/${c.id}/escalate`)
        .send({ version: c.version, reason: "Needs a Super Admin decision" })
        .expect(200)
    ).body
    expect(c.status).toBe("escalated")
    expect(await prisma.notification.count({ where: { title: "Complaint escalated" } })).toBe(
      before + 1,
    )

    c = (
      await priya
        .post(`/api/v1/complaints/${c.id}/resolve`)
        .send({ version: c.version, resolution: "Refund approved and vendor warned." })
        .expect(200)
    ).body
    expect(c.status).toBe("resolved")
    expect(c.notes.map((n: { kind: string }) => n.kind)).toEqual(
      expect.arrayContaining(["assigned", "escalated", "resolved"]),
    )
    const audited = await prisma.auditLog.count({
      where: { entityType: "complaint", entityId: c.id },
    })
    expect(audited).toBeGreaterThanOrEqual(3)
  })
})

describe("inventory", () => {
  it("keeps stock to the admin's zones, refuses taking more than is in stock, and audits changes", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("admin@gokart.in", "Admin@123")
    const summary = await agent.get("/api/v1/inventory/summary").expect(200)
    expect(summary.body.products).toBeGreaterThan(0)
    const started = new Date()
    const p = (await agent.get("/api/v1/inventory?stock=in").expect(200)).body.items[0]
    await agent
      .post(`/api/v1/inventory/${p.id}/stock`)
      .send({ version: p.version, change: -(p.stock + 1), reason: "damaged" })
      .expect(409)
    const after = await agent
      .post(`/api/v1/inventory/${p.id}/stock`)
      .send({ version: p.version, change: 5, reason: "restock" })
      .expect(200)
    expect(after.body.stock).toBe(p.stock + 5)
    // The seeded products are all in Chennai; Ravi (Madurai) can't see or change them.
    const ravi = (await signIn("ravi.chandran@gokart.in", "Admin@123")).agent
    const raviList = await ravi.get("/api/v1/inventory?pageSize=100").expect(200)
    expect(raviList.body.items.some((x: { id: string }) => x.id === p.id)).toBe(false)
    await ravi
      .post(`/api/v1/inventory/${p.id}/stock`)
      .send({ version: after.body.version, change: 1, reason: "restock" })
      .expect(404)
    expect(
      await prisma.auditLog.count({
        where: { action: "inventory.stock_adjusted", entityId: p.id, at: { gte: started } },
      }),
    ).toBe(1)
  })
})

describe("notifications and account", () => {
  it("lists and marks the member's own notifications, lists sessions and saves preferences", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("admin@gokart.in", "Admin@123")
    const second = (await signIn("admin@gokart.in", "Admin@123")).agent
    const self = await prisma.member.findUniqueOrThrow({ where: { email: "admin@gokart.in" } })
    await prisma.notification.create({
      data: { memberId: self.id, title: "Test update", body: "Created by the integration test." },
    })
    const list = await agent.get("/api/v1/notifications").expect(200)
    expect(list.body.unread).toBeGreaterThan(0)
    await agent.post(`/api/v1/notifications/${list.body.items[0].id}/read`).expect(204)
    await agent.post("/api/v1/notifications/read-all").expect(204)
    expect((await agent.get("/api/v1/notifications").expect(200)).body.unread).toBe(0)

    // Another member's notification looks like it doesn't exist.
    const other = await prisma.notification.findFirst({ where: { memberId: { not: self.id } } })
    if (other) await agent.post(`/api/v1/notifications/${other.id}/read`).expect(404)

    const sessions = await agent.get("/api/v1/auth/sessions").expect(200)
    expect(sessions.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1)
    expect(sessions.body.length).toBeGreaterThanOrEqual(2)
    await agent.post("/api/v1/auth/sessions/end-others").expect(200)
    await second.get("/api/v1/auth/me").expect(401)

    const prefs = await agent
      .put("/api/v1/auth/preferences")
      .send({ emailComplaints: false, slaAlerts: true, dailyDigest: true, sound: false })
      .expect(200)
    expect(prefs.body.dailyDigest).toBe(true)
    expect((await agent.get("/api/v1/auth/preferences").expect(200)).body.emailComplaints).toBe(
      false,
    )
  })
})

describe("vendors", () => {
  it("lists vendors with order stats, scoped to the admin's business access and zones", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("priya.shankar@gokart.in", "Admin@123")
    const food = await agent.get("/api/v1/vendors?business=food&pageSize=100").expect(200)
    const mart = await agent.get("/api/v1/vendors?business=mart&pageSize=100").expect(200)
    const chennai = new Set(
      (await prisma.zone.findMany({ where: { district: "Chennai" }, select: { id: true } })).map(
        (z) => z.id,
      ),
    )
    const names = food.body.items.map((v: { name: string }) => v.name)
    expect(names).toContain("Saffron Kitchen")
    expect(names).not.toContain("Kovai Biryani House") // Coimbatore
    expect(food.body.items.every((v: { zoneId: string }) => chennai.has(v.zoneId))).toBe(true)
    expect(mart.body.items.every((v: { zoneId: string }) => chennai.has(v.zoneId))).toBe(true)
    const saffron = food.body.items.find((v: { name: string }) => v.name === "Saffron Table")
    expect(saffron).toMatchObject({ zoneName: "T. Nagar, Chennai Central", commissionPct: 18 })
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
    const elsewhere = await prisma.zone.findFirstOrThrow({ where: { district: "Madurai" } })
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
      expect(map.body.every((x: { zoneName: string }) => x.zoneName.includes("Madurai"))).toBe(true)
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

describe("documents", () => {
  it("uploads, serves and verifies vendor and partner documents", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const vendor = await prisma.vendor.findFirstOrThrow({ where: { code: "VEN-1044" } })
    const partner = await prisma.partner.findFirstOrThrow({ where: { code: "DP-2387" } })
    const pdf = Buffer.from("%PDF-1.4\n% test document\n%%EOF\n")
    const created: { table: "vendor" | "partner"; id: string; key: string }[] = []
    try {
      const fake = await agent
        .put(`/api/v1/vendors/${vendor.id}/documents/storefront_photo`)
        .set("Content-Type", "application/pdf")
        .send(Buffer.from("not really a pdf"))
      expect(fake.status).toBe(400)
      await agent
        .put(`/api/v1/vendors/${vendor.id}/documents/not_a_kind`)
        .set("Content-Type", "application/pdf")
        .send(pdf)
        .expect(400)

      // Storefront photo: no seeded file of this kind, so the test leaves seed data alone.
      const first = await agent
        .put(`/api/v1/vendors/${vendor.id}/documents/storefront_photo`)
        .set("Content-Type", "application/pdf")
        .send(pdf)
        .expect(201)
      const firstKey = (
        await prisma.vendorDocument.findUniqueOrThrow({ where: { id: first.body.id } })
      ).s3Key
      // Uploading the same kind again replaces the record and its stored file.
      const up = await agent
        .put(`/api/v1/vendors/${vendor.id}/documents/storefront_photo`)
        .set("Content-Type", "application/pdf")
        .set("x-file-name", encodeURIComponent("Storefront.pdf"))
        .send(pdf)
      expect(up.status).toBe(201)
      expect(up.body).toMatchObject({
        kind: "storefront_photo",
        fileName: "Storefront.pdf",
        contentType: "application/pdf",
        sizeBytes: pdf.length,
        verified: false,
      })
      const row = await prisma.vendorDocument.findUniqueOrThrow({ where: { id: up.body.id } })
      created.push({ table: "vendor", id: row.id, key: row.s3Key })
      expect(
        await prisma.vendorDocument.count({
          where: { vendorId: vendor.id, kind: "storefront_photo" },
        }),
      ).toBe(1)
      const { getObject } = await import("./lib/storage")
      expect(await getObject(firstKey)).toBeNull()

      const file = await agent
        .get(`/api/v1/vendors/${vendor.id}/documents/${up.body.id}/file`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = []
          res.on("data", (c: Buffer) => chunks.push(c))
          res.on("end", () => cb(null, Buffer.concat(chunks)))
        })
      expect(file.status).toBe(200)
      expect(file.headers["content-type"]).toContain("application/pdf")
      expect(Buffer.compare(file.body as Buffer, pdf)).toBe(0)

      const verified = await agent
        .post(`/api/v1/vendors/${vendor.id}/documents/${up.body.id}/verify`)
        .send({ verified: true })
      expect(verified.body.verified).toBe(true)

      // A Chennai admin can see this Chennai vendor's file but can't verify it.
      const admin = (await signIn("priya.shankar@gokart.in", "Admin@123")).agent
      await admin.get(`/api/v1/vendors/${vendor.id}/documents/${up.body.id}/file`).expect(200)
      await admin
        .post(`/api/v1/vendors/${vendor.id}/documents/${up.body.id}/verify`)
        .send({ verified: false })
        .expect(403)

      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
      const photo = await admin
        .put(`/api/v1/partners/${partner.id}/documents/photo`)
        .set("Content-Type", "image/png")
        .send(png)
      expect(photo.status).toBe(201)
      const prow = await prisma.partnerDocument.findUniqueOrThrow({ where: { id: photo.body.id } })
      created.push({ table: "partner", id: prow.id, key: prow.s3Key })
      // Outside her zones, a Madurai admin can't reach the Chennai partner's file.
      const madurai = (await signIn("ravi.chandran@gokart.in", "Admin@123")).agent
      await madurai
        .get(`/api/v1/partners/${partner.id}/documents/${photo.body.id}/file`)
        .expect(404)
    } finally {
      const { deleteObject } = await import("./lib/storage")
      for (const c of created) {
        await deleteObject(c.key)
        if (c.table === "vendor") await prisma.vendorDocument.delete({ where: { id: c.id } })
        else await prisma.partnerDocument.delete({ where: { id: c.id } })
      }
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: [vendor.id, partner.id] }, action: { contains: "document" } },
      })
    }
  })
})

describe("order assignment and history", () => {
  it("assigns a ready order, keeps its history and flags delays", async (ctx) => {
    if (!ready) ctx.skip()
    const { agent } = await signIn("superadmin@gokart.in", "Gokart@12345")
    const vendor = await prisma.vendor.findFirstOrThrow({ where: { name: "Saffron Table" } })
    const vikram = await prisma.partner.findFirstOrThrow({ where: { code: "DP-1042" } })
    const before = vikram.availability
    await prisma.partner.update({ where: { id: vikram.id }, data: { availability: "available" } })
    const order = await prisma.order.create({
      data: {
        code: "ZOF-TEST-2",
        business: "food",
        status: "ready",
        customerName: "Test Customer",
        customerPhone: "+919800000003",
        vendorId: vendor.id,
        zoneId: vendor.zoneId,
        paymentMethod: "upi",
        paymentStatus: "paid",
        itemsTotalPaise: 30000,
        deliveryFeePaise: 3800,
        totalPaise: 33800,
        // Placed two hours ago: past the 45-minute food limit.
        placedAt: new Date(Date.now() - 2 * 60 * 60_000),
        events: { create: [{ to: "placed", actorType: "app" }] },
      },
    })
    try {
      const candidates = await agent.get(`/api/v1/orders/${order.id}/partners`).expect(200)
      expect(candidates.body.map((p: { code: string }) => p.code)).toContain("DP-1042")
      const delayed = await agent.get("/api/v1/orders?delayed=true&pageSize=100").expect(200)
      expect(delayed.body.items.some((o: { code: string }) => o.code === "ZOF-TEST-2")).toBe(true)
      expect(delayed.body.items.every((o: { delayed: boolean }) => o.delayed)).toBe(true)

      const assigned = await agent
        .post(`/api/v1/orders/${order.id}/assign`)
        .send({ partnerId: vikram.id, version: order.version })
      expect(assigned.status).toBe(200)
      expect(assigned.body).toMatchObject({ status: "assigned", partnerName: "Vikram Singh" })
      const again = await agent
        .post(`/api/v1/orders/${order.id}/assign`)
        .send({ partnerId: vikram.id, version: assigned.body.version })
      expect(again.status).toBe(400)
      expect(again.body.error.message).toBe("This order is already assigned to that partner.")
      expect(
        (await prisma.partner.findUniqueOrThrow({ where: { id: vikram.id } })).availability,
      ).toBe("on_delivery")

      const detail = await agent.get(`/api/v1/orders/${order.id}`).expect(200)
      expect(detail.body.events.at(-1)).toMatchObject({
        from: "ready",
        to: "assigned",
        actorName: "Arjun Menon",
        reason: "Assigned to Vikram Singh",
      })
      // A Madurai admin can't see or assign this Chennai order.
      const madurai = (await signIn("ravi.chandran@gokart.in", "Admin@123")).agent
      await madurai.get(`/api/v1/orders/${order.id}/partners`).expect(404)
    } finally {
      await prisma.orderEvent.deleteMany({ where: { orderId: order.id } })
      await prisma.auditLog.deleteMany({ where: { entityId: order.id } })
      await prisma.outboxEvent.deleteMany({ where: { topic: "order.assigned" } })
      await prisma.order.delete({ where: { id: order.id } })
      await prisma.partner.update({ where: { id: vikram.id }, data: { availability: before } })
    }
  })
})
