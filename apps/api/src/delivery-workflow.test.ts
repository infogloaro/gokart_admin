// End-to-end delivery approval workflow against a migrated, seeded database and Redis:
// Admin requests a partner → Super Admin approves → the partner submits riders through its
// portal (OTP) → the Admin verifies and forwards → Super Admin gives final approval, with reasons,
// history, the 20-rider cap, and Super Admin notifications for each change.
// Skipped when the services are not reachable.
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { DELIVERY_BOYS_PER_PARTNER } from "@zoauro/shared"

const sent: { to: string; text: string }[] = []
vi.mock("./lib/mailer", () => ({
  sendMail: async (to: string, _subject: string, text: string) => {
    sent.push({ to, text })
  },
}))

const { createApp } = await import("./app")
const { prisma } = await import("./lib/prisma")
const { redis } = await import("./lib/redis")

const app = createApp()
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
  if (!ready)
    console.warn("Delivery workflow test skipped: start services, migrate and seed first.")
})
afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

const lastCode = (to: string) => sent.findLast((m) => m.to === to)!.text.match(/\b(\d{6})\b/)![1]

/** Password, then an emailed code. Clears sign-in limits first: this file signs in several times. */
async function signIn(email: string, password: string) {
  const agent = request.agent(app)
  const limits = await redis.keys("rl:login:*")
  if (limits.length) await redis.del(...limits)
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
  return agent
}

/** Partner OTP sends are limited per partner and per phone; this file sends many on purpose. */
async function clearOtpLimits() {
  const keys = [
    ...(await redis.keys("rl:delivery-boy-otp:*")),
    ...(await redis.keys("delivery-boy:otp:cooldown:*")),
  ]
  if (keys.length) await redis.del(...keys)
}

const base = Date.now().toString().slice(-6)
const phoneFor = (n: number) => `9${base}${String(n).padStart(3, "0")}`
const plate = (n: number) => `TN01AB${String(1000 + n).padStart(4, "0")}`

describe("delivery partner approval workflow", () => {
  it("runs request → approval → portal riders → verification → forward → final approval", async () => {
    if (!ready) return

    const superAdmin = await signIn("superadmin@gokart.in", "Gokart@12345")
    const admin = await signIn("ravi.chandran@gokart.in", "Admin@123")

    // Pick one of the Admin's zones that has no primary partner yet.
    const adminMember = await prisma.member.findUniqueOrThrow({
      where: { email: "ravi.chandran@gokart.in" },
      include: { zones: { select: { zoneId: true } } },
    })
    const occupiedIds = new Set(
      (
        await prisma.deliveryFleetZone.findMany({
          where: { endedAt: null },
          select: { zoneId: true },
        })
      ).map((row) => row.zoneId),
    )
    const targetZone = await prisma.zone.findFirst({
      where: {
        id: { in: adminMember.zones.map((row) => row.zoneId).filter((id) => !occupiedIds.has(id)) },
        active: true,
      },
    })
    expect(targetZone, "the Admin needs a zone without a primary partner").not.toBeNull()
    const zoneId = targetZone!.id

    // 1. Admin requests the partner. It stays pending.
    const requested = await admin.post("/api/v1/delivery/fleet-requests").send({
      name: `Workflow Partner ${base}`,
      contactPerson: "Workflow Tester",
      phone: phoneFor(1),
      address: "12 Test Street, Madurai",
      districtId: targetZone!.districtId,
      businesses: ["food"],
      zoneIds: [zoneId],
    })
    expect(requested.status).toBe(201)
    expect(requested.body.status).toBe("pending_approval")
    const fleetId: string = requested.body.id
    expect(requested.body.requestedByName).toBe("Ravi Chandran")

    // The Super Admin was told about the request.
    const superIds = (
      await prisma.member.findMany({
        where: { role: "super_admin", status: "active" },
        select: { id: true },
      })
    ).map((member) => member.id)
    const requestNote = await prisma.notification.findFirst({
      where: { memberId: { in: superIds }, title: "Change: delivery_fleet.requested" },
    })
    expect(requestNote).not.toBeNull()

    // 2. Super Admin approval needs a reason.
    await superAdmin
      .post(`/api/v1/delivery/fleets/${fleetId}/review`)
      .send({ decision: "approved" })
      .expect(400)
    const approved = await superAdmin
      .post(`/api/v1/delivery/fleets/${fleetId}/review`)
      .send({ decision: "approved", reason: "Verified partner agreement" })
    expect(approved.status).toBe(200)
    expect(approved.body.fleet.status).toBe("active")
    const credential: string = approved.body.credential
    expect(typeof credential).toBe("string")
    const partner = { "x-partner-credential": credential }

    // 3. The partner submits riders through its portal, each confirmed by an SMS code.
    const submitRider = async (n: number) => {
      await clearOtpLimits()
      const challenge = await request(app)
        .post("/api/v1/delivery/intake/fleet/me/boys/otp")
        .set(partner)
        .send({ phone: phoneFor(n) })
        .expect(200)
      const code = lastCode(`91${phoneFor(n)}@sms.local`)
      return request(app)
        .post("/api/v1/delivery/intake/fleet/me/boys")
        .set(partner)
        .send({
          name: `Rider ${n}`,
          phone: phoneFor(n),
          address: `${n} Rider Lane, Madurai`,
          zoneId,
          vehicleType: "scooter",
          vehicleNumber: plate(n),
          otpChallengeId: challenge.body.challengeId,
          otp: code,
        })
    }
    const first = await submitRider(10)
    expect(first.status).toBe(201)
    expect(first.body.status).toBe("pending_admin")
    const boyId: string = first.body.id

    // 4. Admin cannot forward until every required document is verified.
    const boy = await prisma.deliveryBoy.findUniqueOrThrow({ where: { id: boyId } })
    const documents = await Promise.all(
      ["photo_id", "driving_licence", "vehicle_registration"].map((kind) =>
        prisma.deliveryBoyDocument.create({
          data: {
            boyId,
            kind: kind as "photo_id",
            s3Key: `test/${boyId}/${kind}`,
            fileName: `${kind}.pdf`,
            contentType: "application/pdf",
            sizeBytes: 100,
          },
        }),
      ),
    )
    await admin
      .post(`/api/v1/delivery/boys/${boyId}/review`)
      .send({ decision: "forwarded", version: boy.version, reason: "Ready" })
      .expect(409)

    // 5. Document decisions need a reason.
    await admin
      .post(`/api/v1/delivery/boys/${boyId}/documents/${documents[0]!.id}/verify`)
      .send({ verified: true })
      .expect(400)
    for (const document of documents)
      await admin
        .post(`/api/v1/delivery/boys/${boyId}/documents/${document.id}/verify`)
        .send({ verified: true, reason: "Originals checked" })
        .expect(200)

    // 6. Admin forwards with a reason.
    const forwarded = await admin
      .post(`/api/v1/delivery/boys/${boyId}/review`)
      .send({ decision: "forwarded", version: boy.version, reason: "All documents checked" })
    expect(forwarded.status).toBe(200)
    expect(forwarded.body.status).toBe("pending_super")

    // 7. Once forwarded, the Admin has no further decision to make on the application.
    await admin
      .post(`/api/v1/delivery/boys/${boyId}/review`)
      .send({ decision: "approved", version: forwarded.body.version, reason: "Trying" })
      .expect(409)

    // 8. Super Admin gives final approval.
    const finalApproval = await superAdmin
      .post(`/api/v1/delivery/boys/${boyId}/review`)
      .send({ decision: "approved", version: forwarded.body.version, reason: "Meets all checks" })
    expect(finalApproval.status).toBe(200)
    expect(finalApproval.body.status).toBe("active")

    // 9. Every step is in the rider's history with who and why.
    const riderHistory = await superAdmin.get(`/api/v1/delivery/boys/${boyId}/history`).expect(200)
    const actions = riderHistory.body.map((entry: { action: string }) => entry.action)
    expect(actions).toEqual(
      expect.arrayContaining(["boy.document_verified", "boy.forwarded", "boy.approved"]),
    )
    const finalEntry = riderHistory.body.find(
      (entry: { action: string }) => entry.action === "boy.approved",
    )
    expect(finalEntry.reason).toBe("Meets all checks")
    expect(finalEntry.changes.status).toEqual({ from: "pending_super", to: "active" })

    // 10. Partner history shows the approval and its reason.
    const partnerHistory = await superAdmin
      .get(`/api/v1/delivery/fleets/${fleetId}/history`)
      .expect(200)
    const approval = partnerHistory.body.find(
      (entry: { action: string }) => entry.action === "fleet.approved",
    )
    expect(approval.reason).toBe("Verified partner agreement")
    expect(approval.changes.status).toEqual({ from: "pending_approval", to: "active" })

    // 11. Editing a partner needs a reason, and the reason is recorded.
    const profile = {
      name: `Workflow Partner Renamed ${base}`,
      companyName: null,
      contactPerson: "Workflow Tester",
      phone: phoneFor(1),
      email: null,
      address: "12 Test Street, Madurai",
      status: "active",
      businesses: ["food"],
    }
    await superAdmin.patch(`/api/v1/delivery/fleets/${fleetId}`).send(profile).expect(400)
    await superAdmin
      .patch(`/api/v1/delivery/fleets/${fleetId}`)
      .send({ ...profile, reason: "Trading name changed" })
      .expect(200)
    const afterEdit = await superAdmin.get(`/api/v1/delivery/fleets/${fleetId}/history`).expect(200)
    const rename = afterEdit.body.find(
      (entry: { action: string }) => entry.action === "fleet.updated",
    )
    expect(rename.reason).toBe("Trading name changed")
    expect(rename.changes.name.to).toBe(`Workflow Partner Renamed ${base}`)

    // 12. The 20-rider cap: 19 more riders fill the partner, and the 21st is refused.
    for (let n = 11; n < 10 + DELIVERY_BOYS_PER_PARTNER.max; n++) {
      const added = await submitRider(n)
      expect(added.status, added.text).toBe(201)
    }
    const overflow = await submitRider(40)
    expect(overflow.status).toBe(409)
    expect(overflow.body.error.message).toContain(String(DELIVERY_BOYS_PER_PARTNER.max))

    // 13. Super Admin saw the changes made by the Admin and the partner.
    const superNotes = await prisma.notification.count({
      where: { memberId: { in: superIds }, title: { startsWith: "Change: " } },
    })
    expect(superNotes).toBeGreaterThan(0)

    // Cleanup: this file creates its own partner and riders.
    const riders = await prisma.deliveryBoy.findMany({ where: { fleetId }, select: { id: true } })
    const riderIds = riders.map((rider) => rider.id)
    await prisma.deliveryHistory.deleteMany({
      where: { OR: [{ fleetId }, { boyId: { in: riderIds } }] },
    })
    await prisma.deliveryBoyDocument.deleteMany({ where: { boyId: { in: riderIds } } })
    await prisma.deliveryBoyReview.deleteMany({ where: { boyId: { in: riderIds } } })
    await prisma.deliveryBoyNotification.deleteMany({ where: { boyId: { in: riderIds } } })
    await prisma.deliveryBoy.deleteMany({ where: { id: { in: riderIds } } })
    await prisma.deliveryFleetZone.deleteMany({ where: { fleetId } })
    await prisma.deliveryFleetBusiness.deleteMany({ where: { fleetId } })
    await prisma.deliveryFleet.delete({ where: { id: fleetId } })
  })
})
