import { Router, type RequestHandler } from "express"
import { forbidden } from "../../lib/errors"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./finance.controller"

/** Payroll for every partner and admin is visible to Super Admins only. */
const superAdmin: RequestHandler = (req, _res, next) => {
  if (req.member?.role !== "super_admin") throw forbidden("Finance & payouts is for Super Admins.")
  next()
}
const view = [requirePermission("finance.view"), superAdmin]
const approve = [requirePermission("finance.approve"), superAdmin]
const manage = [requirePermission("finance.manage_plans"), superAdmin]

export const financeRoutes = Router()
  .use(requireAuth)
  .get("/cycles", ...view, c.cycles)
  .get("/overview", ...view, c.overview)
  .get("/accounts/:type/:id", ...view, c.account)
  .get("/payouts", ...view, c.payouts)
  .get("/payouts/:id", ...view, c.payout)
  .post("/payouts/generate", ...approve, c.generate)
  .post("/payouts/:id/approve", ...approve, c.approve)
  .post("/payouts/:id/reject", ...approve, c.reject)
  .post("/payouts/:id/pay", ...approve, c.pay)
  .post("/payouts/:id/recalculate", ...approve, c.recalculate)
  .post("/remittances", ...manage, c.remit)
  .post("/adjustments", ...manage, c.adjust)
  .put("/plans/:type/:id", ...manage, c.setPlan)
  .get("/requests", ...view, c.requests)
  // Admins propose pay changes for partners they manage; the service checks that.
  .post("/requests", requirePermission("finance.view"), c.requestChange)
  .post("/requests/:id/approve", ...approve, c.approveRequest)
  .post("/requests/:id/reject", ...approve, c.rejectRequest)
  .get("/movements", ...view, c.movements)
  .get("/report", ...view, c.report)
  .get("/audit", ...view, c.auditTrail)
