import { Router } from "express"
import type { Request, RequestHandler } from "express"
import type { PrismaClient } from "../../generated/client/index.js"

import { createDashboardController } from "./dashboard.controller.js"
import { createDashboardService } from "./dashboard.service.js"
import type { ResolveAccessibleWorkspaceIds, WorkspacePrincipal } from "./dashboard.types.js"

interface DashboardRouterDependencies {
  prisma: PrismaClient
  requireAuth: RequestHandler
  getPrincipal: (req: Request) => WorkspacePrincipal | null
  resolveAccessibleWorkspaceIds: ResolveAccessibleWorkspaceIds
}

export function createDashboardRouter(dependencies: DashboardRouterDependencies) {
  const router = Router({ mergeParams: true })

  const service = createDashboardService(
    dependencies.prisma,
    dependencies.resolveAccessibleWorkspaceIds,
  )

  const controller = createDashboardController(service, dependencies.getPrincipal)

  router.use(dependencies.requireAuth)

  router.get("/:workspaceId/dashboard", controller.getDashboard)
  router.get("/:workspaceId/overview", controller.getOverview)
  router.get("/:workspaceId/revenue", controller.getRevenue)
  router.get("/:workspaceId/reports", controller.getReports)
  router.get("/:workspaceId/notifications", controller.getNotifications)

  return router
}
