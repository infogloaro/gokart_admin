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
