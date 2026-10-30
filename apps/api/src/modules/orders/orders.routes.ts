import { Router } from "express"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./orders.controller"

export const orderRoutes = Router()
  .use(requireAuth)
  .get("/", requirePermission("orders.view"), c.list)
  .get("/summary", requirePermission("orders.view"), c.summary)
  .get("/:id", requirePermission("orders.view"), c.get)
  .post("/:id/status", requirePermission("orders.manage"), c.changeStatus)
  .get("/:id/partners", requirePermission("orders.manage"), c.candidates)
  .post("/:id/assign", requirePermission("orders.manage"), c.assign)
