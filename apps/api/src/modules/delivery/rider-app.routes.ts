// Phase 3 routes: rider app sign-in and profile, and the portal side that issues app passwords.
import { Router } from "express"
import {
  EarningsQuery,
  RiderAnalyticsQuery,
  RiderLoginRequest,
  RiderProfileChangeDecision,
  RiderProfileChangeQuery,
  RiderProfileChangeRequest,
  RiderShiftQuery,
} from "@zoauro/shared"
import { z } from "zod"
import { acceptOffer, declineOffer, openOffers } from "../rider-ops/offers"
import { audit, type Actor } from "../../lib/audit"
import { exportFormat, sendTable } from "../../lib/export"
import { forbidden, notFound, parse, unauthorized } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { actorOf, currentMember, requireAuth, requirePermission } from "../../middleware/auth"
import {
  decideProfileChange,
  earningsStatement,
  endShift,
  forceEndShift,
  listProfileChanges,
  listShifts,
  myProfileChanges,
  myShifts,
  requestProfileChange,
  riderAnalytics,
  riderVerification,
  startShift,
} from "./rider-phase3.service"
import {
  endRiderSession,
  generateAppPassword,
  hashAppPassword,
  loginRider,
  createRiderSession,
  requireRiderSession,
} from "./rider-session"

const loginBody = RiderLoginRequest

const fleetIdOf = async (boyId: string) =>
  (await prisma.deliveryBoy.findUniqueOrThrow({ where: { id: boyId }, select: { fleetId: true } }))
    .fleetId

async function assertRiderInScope(riderId: string, member: ReturnType<typeof currentMember>) {
  const boy = await prisma.deliveryBoy.findUnique({
    where: { id: riderId },
    select: { id: true, zoneId: true },
  })
  if (!boy) throw notFound("Rider")
  if (member.role !== "super_admin" && !member.zoneIds.includes(boy.zoneId)) throw forbidden()
  return boy
}

export const riderAppRoutes = Router()
  // Rider app: sign in with phone and app password.
  .post("/intake/rider/login", async (req, res) => {
    const body = parse(loginBody, req.body)
    const result = await loginRider(body.phone, body.password)
    if (!result) throw unauthorized("Phone number or password is not right.")
    const token = await createRiderSession(result.boyId)
    const rider = await prisma.deliveryBoy.findUniqueOrThrow({
      where: { id: result.boyId },
      select: { id: true, code: true, name: true, status: true, availability: true },
    })
    res.json({ token, rider })
  })
  .post("/intake/rider/logout", requireRiderSession, async (req, res) => {
    await endRiderSession(req.riderSessionToken!)
    res.status(204).end()
  })
  .get("/intake/rider/me", requireRiderSession, async (req, res) => {
    const rider = await prisma.deliveryBoy.findUniqueOrThrow({
      where: { id: req.riderBoyId! },
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        status: true,
        availability: true,
        zone: { select: { location: true, district: true } },
      },
    })
    const { zone, ...profile } = rider
    res.json({ ...profile, zoneName: `${zone.location}, ${zone.district}` })
  })
  // Portal: issue or reset a rider's app password. The password is shown once.
  .post(
    "/boys/:id/app-password",
    requireAuth,
    requirePermission("partners.manage"),
    async (req, res) => {
      const member = currentMember(req)
      const boy = await assertRiderInScope(String(req.params.id), member)
      const password = generateAppPassword()
      const actor: Actor = actorOf(req)
      await prisma.$transaction(async (tx) => {
        await tx.deliveryBoy.update({
          where: { id: boy.id },
          data: { appPasswordHash: hashAppPassword(password), appPasswordSetAt: new Date() },
        })
        await audit(tx, actor, "rider.app_password_set", { type: "delivery_boy", id: boy.id })
      })
      res.json({ password })
    },
  )
  // Rider app: shifts, profile changes and verification status.
  .post("/intake/rider/shifts/start", requireRiderSession, async (req, res) => {
    const shift = await startShift(req.riderBoyId!)
    res.status(201).json({ id: shift.id, startedAt: shift.startedAt.toISOString() })
  })
  .post("/intake/rider/shifts/end", requireRiderSession, async (req, res) => {
    res.json(await endShift(req.riderBoyId!))
  })
  .get("/intake/rider/shifts", requireRiderSession, async (req, res) => {
    res.json(await myShifts(req.riderBoyId!))
  })
  // Rider app: order offers. The same rules as the company routes; the rider signs in with their own session.
  .get("/intake/rider/offers", requireRiderSession, async (req, res) => {
    res.json(await openOffers(await fleetIdOf(req.riderBoyId!), req.riderBoyId!))
  })
  .post("/intake/rider/offers/:offerId/accept", requireRiderSession, async (req, res) => {
    await acceptOffer(await fleetIdOf(req.riderBoyId!), req.riderBoyId!, String(req.params.offerId))
    res.json({ ok: true })
  })
  .post("/intake/rider/offers/:offerId/decline", requireRiderSession, async (req, res) => {
    const body = parse(z.object({ reason: z.string().trim().max(200).optional() }), req.body ?? {})
    await declineOffer(
      await fleetIdOf(req.riderBoyId!),
      req.riderBoyId!,
      String(req.params.offerId),
      body.reason,
    )
    res.json({ ok: true })
  })
  .get("/intake/rider/verification", requireRiderSession, async (req, res) => {
    res.json(await riderVerification(req.riderBoyId!))
  })
  .post("/intake/rider/profile-changes", requireRiderSession, async (req, res) => {
    const body = parse(RiderProfileChangeRequest, req.body)
    res.status(201).json(await requestProfileChange(req.riderBoyId!, body))
  })
  .get("/intake/rider/profile-changes", requireRiderSession, async (req, res) => {
    res.json(await myProfileChanges(req.riderBoyId!))
  })
  // Portal: shifts (Admins see their zones, Super Admins see all).
  .get("/shifts", requireAuth, requirePermission("partners.view"), async (req, res) => {
    res.json(await listShifts(currentMember(req), parse(RiderShiftQuery, req.query)))
  })
  .post("/shifts/:id/end", requireAuth, requirePermission("partners.manage"), async (req, res) => {
    await forceEndShift(currentMember(req), String(req.params.id), actorOf(req))
    res.status(204).end()
  })
  // Portal: earnings statements per rider, as JSON or as a CSV / Excel download.
  .get("/earnings", requireAuth, requirePermission("partners.view"), async (req, res) => {
    const query = parse(EarningsQuery, req.query)
    const statement = await earningsStatement(currentMember(req), query)
    if (req.query.format) {
      await sendTable(
        res,
        exportFormat(req),
        `rider-earnings-${query.from}-to-${query.to}`,
        ["riderCode", "riderName", "zoneName", "deliveries", "feePaise", "shiftMinutes"],
        statement.rows,
      )
      return
    }
    res.json({
      from: statement.from,
      to: statement.to,
      totals: statement.totals,
      items: statement.items,
    })
  })
  // Portal: profile change requests from riders.
  .get("/profile-changes", requireAuth, requirePermission("partners.view"), async (req, res) => {
    res.json(
      await listProfileChanges(currentMember(req), parse(RiderProfileChangeQuery, req.query)),
    )
  })
  .post(
    "/profile-changes/:id/approve",
    requireAuth,
    requirePermission("partners.manage"),
    async (req, res) => {
      const decision = parse(RiderProfileChangeDecision, req.body ?? {})
      await decideProfileChange(
        currentMember(req),
        String(req.params.id),
        true,
        decision,
        actorOf(req),
      )
      res.status(204).end()
    },
  )
  .post(
    "/profile-changes/:id/reject",
    requireAuth,
    requirePermission("partners.manage"),
    async (req, res) => {
      const decision = parse(RiderProfileChangeDecision, req.body ?? {})
      await decideProfileChange(
        currentMember(req),
        String(req.params.id),
        false,
        decision,
        actorOf(req),
      )
      res.status(204).end()
    },
  )
  // Portal: zone analytics for the last N days.
  .get("/analytics", requireAuth, requirePermission("partners.view"), async (req, res) => {
    res.json(await riderAnalytics(currentMember(req), parse(RiderAnalyticsQuery, req.query)))
  })
