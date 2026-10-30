import { Router } from "express"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./dashboard.controller"

export const dashboardRoutes = Router()
  .use(requireAuth)
  .get("/overview", requirePermission("dashboard.view"), c.overview)
  .get("/health", requirePermission("dashboard.view"), c.health)
  .get("/revenue", requirePermission("finance.view"), c.revenue)

// Each result group is limited by its own view permission inside the handler.
export const searchRoutes = Router().use(requireAuth).get("/", c.search)
