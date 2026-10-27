import { Router } from "express"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./partners.controller"

export const partnerRoutes = Router()
  .use(requireAuth)
  .get("/", requirePermission("partners.view"), c.list)
  .get("/summary", requirePermission("partners.view"), c.summary)
  .get("/:id", requirePermission("partners.view"), c.get)
  .post("/", requirePermission("partners.manage"), c.create)
  .post("/:id/decision", requirePermission("partners.approve"), c.decide)
