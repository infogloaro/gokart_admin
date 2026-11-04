import { randomBytes } from "node:crypto"
import { createRiderTicket, riderTickets } from "../rider-ops/rider-ops"
import { acceptOffer, declineOffer, openOffers } from "../rider-ops/offers"
import { verifyDeliveryCode } from "../rider-ops/delivery-code"
import { uploadProof } from "../rider-ops/proof"
import { requestArea, riderAreas } from "../rider-ops/areas"
import express, { Router, type RequestHandler } from "express"
import { DeliveryBoyDocumentKind } from "@zoauro/shared"
import { hashForLookup } from "../../lib/crypto"
import { badRequest, forbidden, parse, unauthorized } from "../../lib/errors"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { currentMember, requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./delivery.controller"

const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (currentMember(req).role !== "super_admin") throw forbidden()
  next()
}

const requireFleetCredential: RequestHandler = async (req, _res, next) => {
  const token = req.get("x-partner-credential")
  if (!token || token.length > 200) throw unauthorized("Partner credential required.")
  const fleet = await prisma.deliveryFleet.findFirst({
    where: { credentialHash: hashForLookup("delivery-fleet", token), status: "active" },
    select: { id: true },
  })
  if (!fleet) throw unauthorized("Partner credential is invalid or inactive.")
  req.deliveryFleetId = fleet.id
  next()
}

const issueCredential = () => `gdf_${randomBytes(32).toString("base64url")}`

const requireAdmin: RequestHandler = (req, _res, next) => {
  if (currentMember(req).role !== "admin") throw forbidden()
  next()
}

export const deliveryRoutes = Router()
  // Admins see only the partners they requested; Super Admin sees all.
  .get("/fleets", requireAuth, requirePermission("partners.view"), c.fleets)
  .post(
    "/fleets",
    requireAuth,
    requirePermission("settings.manage"),
    requireSuperAdmin,
    (req, res) => c.createFleet(req, res, issueCredential),
  )
  .post(
    "/fleets/:id/boys",
    requireAuth,
    requirePermission("partners.manage"),
    requireSuperAdmin,
    c.addBoy,
  )
  .post(
    "/fleet-requests",
    requireAuth,
    requirePermission("partners.manage"),
    requireAdmin,
    c.requestFleet,
  )
  .post(
    "/fleets/:id/review",
    requireAuth,
    requirePermission("settings.manage"),
    requireSuperAdmin,
    (req, res) => c.reviewFleet(req, res, issueCredential),
  )
  .get("/fleets/:id/history", requireAuth, requirePermission("partners.view"), c.fleetHistory)
  .get("/boys/:id/history", requireAuth, requirePermission("partners.view"), c.boyHistory)
  .get("/orders/:id/suggestions", requireAuth, requirePermission("orders.view"), c.suggestRiders)
  .patch(
    "/fleets/:id",
    requireAuth,
    requirePermission("settings.manage"),
    requireSuperAdmin,
    c.updateFleet,
  )
  .post(
    "/fleets/:id/credential",
    requireAuth,
    requirePermission("settings.manage"),
    requireSuperAdmin,
    (req, res) => c.rotateCredential(req, res, issueCredential),
  )
  .post(
    "/fleets/:id/zones/:zoneId",
    requireAuth,
    requirePermission("settings.manage"),
    requireSuperAdmin,
    c.assignZone,
  )
  .get("/boys", requireAuth, requirePermission("partners.view"), c.boys)
  .get("/boys/:id", requireAuth, requirePermission("partners.view"), c.boy)
  .post("/boys/:id/review", requireAuth, requirePermission("partners.manage"), c.reviewBoy)
  .post(
    "/boys/:id/documents/:docId/verify",
    requireAuth,
    requirePermission("partners.manage"),
    c.verifyBoyDocument,
  )
  .get(
    "/boys/:id/documents/:docId/file",
    requireAuth,
    requirePermission("partners.view"),
    c.boyDocumentFile,
  )
  .get("/intake/fleet/me", requireFleetCredential, c.fleetProfile)
  .get("/intake/fleet/me/boys", requireFleetCredential, c.fleetBoys)
  .get("/intake/fleet/me/boys/:id/history", requireFleetCredential, c.fleetBoyHistory)
  .post("/intake/fleet/me/boys/:id/location", requireFleetCredential, c.reportLocation)
  .get("/intake/fleet/me/boys/:id/offers", requireFleetCredential, async (req, res) => {
    res.json(await openOffers(req.deliveryFleetId as string, req.params.id as string))
  })
  .post(
    "/intake/fleet/me/boys/:id/offers/:offerId/accept",
    requireFleetCredential,
    async (req, res) => {
      await acceptOffer(
        req.deliveryFleetId as string,
        req.params.id as string,
        req.params.offerId as string,
      )
      res.json({ ok: true })
    },
  )
  .post(
    "/intake/fleet/me/boys/:id/offers/:offerId/decline",
    requireFleetCredential,
    async (req, res) => {
      const body = parse(z.object({ reason: z.string().trim().max(200).optional() }), req.body)
      await declineOffer(
        req.deliveryFleetId as string,
        req.params.id as string,
        req.params.offerId as string,
        body.reason,
      )
      res.json({ ok: true })
    },
  )
  .post(
    "/intake/fleet/me/boys/:id/orders/:orderId/verify-code",
    requireFleetCredential,
    async (req, res) => {
      const body = parse(
        z.object({ code: z.string().regex(/^\d{4}$/, "Enter the 4-digit code.") }),
        req.body,
      )
      await verifyDeliveryCode(
        req.deliveryFleetId as string,
        req.params.id as string,
        req.params.orderId as string,
        body.code,
      )
      res.json({ ok: true })
    },
  )
  .post(
    "/intake/fleet/me/boys/:id/orders/:orderId/proof",
    requireFleetCredential,
    express.json({ limit: "8mb" }),
    async (req, res) => {
      const body = parse(z.object({ contentType: z.string(), data: z.string().min(1) }), req.body)
      await uploadProof(
        req.deliveryFleetId as string,
        req.params.id as string,
        req.params.orderId as string,
        body,
      )
      res.json({ ok: true })
    },
  )
  .get("/intake/fleet/me/boys/:id/areas", requireFleetCredential, async (req, res) => {
    res.json(await riderAreas(req.deliveryFleetId as string, req.params.id as string))
  })
  .post("/intake/fleet/me/boys/:id/areas", requireFleetCredential, async (req, res) => {
    const body = parse(z.object({ zoneId: z.string().min(1) }), req.body)
    await requestArea(req.deliveryFleetId as string, req.params.id as string, body.zoneId)
    res.status(201).json({ ok: true })
  })
  .get("/riders/live", requireAuth, requirePermission("partners.view"), c.live)
  .get("/performance", requireAuth, requirePermission("partners.view"), c.performance)
  .get("/intake/fleet/me/orders", requireFleetCredential, c.fleetOrders)
  .post("/intake/fleet/me/orders/:orderId/assign", requireFleetCredential, c.assignOrder)
  .post("/intake/fleet/me/orders/:orderId/status", requireFleetCredential, c.changeFleetOrderStatus)
  .get("/intake/fleet/me/boys/:id/notifications", requireFleetCredential, c.boyNotifications)
  .post(
    "/intake/fleet/me/boys/:id/notifications/:notificationId/read",
    requireFleetCredential,
    c.readBoyNotification,
  )
  .post("/intake/fleet/me/boys/otp", requireFleetCredential, c.sendBoyOtp)
  .get("/intake/fleet/me/boys/:id/support", requireFleetCredential, async (req, res) => {
    res.json(await riderTickets(req.deliveryFleetId as string, req.params.id as string))
  })
  .post("/intake/fleet/me/boys/:id/support", requireFleetCredential, async (req, res) => {
    res
      .status(201)
      .json(
        await createRiderTicket(req.deliveryFleetId as string, req.params.id as string, req.body),
      )
  })
  .post("/intake/fleet/me/boys", requireFleetCredential, c.submitBoy)
  .patch("/intake/fleet/me/boys/:id", requireFleetCredential, c.correctBoy)
  .put(
    "/intake/fleet/me/boys/:id/documents/:kind",
    requireFleetCredential,
    (req, _res, next) => {
      const kind = DeliveryBoyDocumentKind.safeParse(req.params.kind)
      if (!kind.success) throw badRequest("Unknown delivery boy document type.")
      next()
    },
    express.raw({ type: ["application/pdf", "image/jpeg", "image/png"], limit: "10mb" }),
    c.uploadBoyDocument,
  )

export { issueCredential }
