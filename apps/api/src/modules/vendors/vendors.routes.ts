import { Router } from "express"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./vendors.controller"

export const vendorRoutes = Router()
  .use(requireAuth)
  .get("/", requirePermission("vendors.view"), c.list)
  .get("/summary", requirePermission("vendors.view"), c.summary)
  .get("/:id", requirePermission("vendors.view"), c.get)
  .post("/", requirePermission("vendors.manage"), c.create)
  .post("/:id/decision", requirePermission("vendors.approve"), c.decide)
