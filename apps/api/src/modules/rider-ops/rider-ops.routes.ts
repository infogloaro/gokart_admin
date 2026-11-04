import { Router } from "express"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./rider-ops"

export const riderOpsRoutes = Router()
  .post("/notices", requireAuth, requirePermission("partners.manage"), c.sendNotice)
  .get("/support", requireAuth, requirePermission("partners.view"), c.listTickets)
  .post("/support/:id/reply", requireAuth, requirePermission("partners.manage"), c.replyToTicket)
  .post("/support/:id/resolve", requireAuth, requirePermission("partners.manage"), c.resolveTicket)
  .get("/cod", requireAuth, requirePermission("partners.view"), c.listCod)
  .post("/cod/:id/handover", requireAuth, requirePermission("partners.manage"), c.confirmHandover)
  .get("/offers", requireAuth, requirePermission("partners.view"), c.listOffers)
  .get("/proofs", requireAuth, requirePermission("partners.view"), c.listProofs)
  .get("/orders/:id/proof", requireAuth, requirePermission("partners.view"), c.readProofImage)
  .post("/orders/:id/resend-code", requireAuth, requirePermission("partners.manage"), c.resendCode)
  .get("/area-requests", requireAuth, requirePermission("partners.view"), c.areaRequests)
  .post(
    "/area-requests/:id/approve",
    requireAuth,
    requirePermission("partners.manage"),
    c.approveArea,
  )
  .post(
    "/area-requests/:id/reject",
    requireAuth,
    requirePermission("partners.manage"),
    c.rejectArea,
  )
