import { Router } from "express"
import type { Request, RequestHandler } from "express"
import type { PrismaClient } from "@prisma/client"

import { createWorkspaceController } from "./workspace.controller.js"
import { createWorkspaceService } from "./workspace.service.js"
import type { ResolveAccessibleWorkspaceIds, WorkspacePrincipal } from "./workspace.types.js"

interface WorkspaceRouterDependencies {
  prisma: PrismaClient
  requireAuth: RequestHandler
  getPrincipal: (req: Request) => WorkspacePrincipal | null
  resolveAccessibleWorkspaceIds: ResolveAccessibleWorkspaceIds
}

export function createWorkspaceRouter(dependencies: WorkspaceRouterDependencies) {
  const router = Router()

  const service = createWorkspaceService(
    dependencies.prisma,
    dependencies.resolveAccessibleWorkspaceIds,
  )

  const controller = createWorkspaceController(service, dependencies.getPrincipal)

  router.use(dependencies.requireAuth)

  router.get("/", controller.list)
  router.get("/active", controller.getActive)
  router.put("/active", controller.setActive)

  return router
}
