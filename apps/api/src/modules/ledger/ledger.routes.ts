import { Router } from "express"
import type { Request, RequestHandler } from "express"
import type { PrismaClient } from "../../generated/client/index.js"

import { createLedgerController } from "./ledger.controller.js"
import { createLedgerService } from "./ledger.service.js"
import type { ResolveAccessibleWorkspaceIds, WorkspacePrincipal } from "./ledger.types.js"

interface LedgerRouterDependencies {
  prisma: PrismaClient
  requireAuth: RequestHandler
  getPrincipal: (req: Request) => WorkspacePrincipal | null
  resolveAccessibleWorkspaceIds: ResolveAccessibleWorkspaceIds
}

export function createLedgerRouter(dependencies: LedgerRouterDependencies) {
  const router = Router({ mergeParams: true })

  const service = createLedgerService(
    dependencies.prisma,
    dependencies.resolveAccessibleWorkspaceIds,
  )

  const controller = createLedgerController(service, dependencies.getPrincipal)

  router.use(dependencies.requireAuth)

  router.get("/:workspaceId/ledger/summary", controller.getSummary)
  router.get("/:workspaceId/ledger/transactions", controller.getTransactions)

  return router
}
