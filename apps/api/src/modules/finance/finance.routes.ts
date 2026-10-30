import { Router } from "express"
import type { NextFunction, Request, RequestHandler, Response } from "express"
import type { PrismaClient } from "../../generated/client/index.js"
import type { ResolveAccessibleWorkspaceIds, WorkspacePrincipal } from "../workspace.types.js"
import { createFinanceService } from "./finance.service.js"

interface FinanceRouterDependencies {
  prisma: PrismaClient
  requireAuth: RequestHandler
  getPrincipal: (req: Request) => WorkspacePrincipal | null
  resolveAccessibleWorkspaceIds: ResolveAccessibleWorkspaceIds
}

type Service = ReturnType<typeof createFinanceService>

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function parsePeriod(value: unknown): "daily" | "weekly" | "monthly" {
  if (value === undefined) return "monthly"
  if (value === "daily" || value === "weekly" || value === "monthly") return value
  throw Object.assign(new Error("period must be one of daily, weekly, monthly"), { status: 400 })
}

export function createFinanceRouter(dependencies: FinanceRouterDependencies) {
  const router = Router({ mergeParams: true })
  const service = createFinanceService(
    dependencies.prisma,
    dependencies.resolveAccessibleWorkspaceIds,
  )

  const handle =
    (
      action: (
        req: Request,
        principal: WorkspacePrincipal,
        workspace: string,
        service: Service,
      ) => Promise<unknown>,
    ): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
      const principal = dependencies.getPrincipal(req)
      if (!principal?.userId) {
        res.status(401).json({ error: { message: "Authentication required" } })
        return
      }
      const workspace = text(req.params.workspaceId)
      if (!workspace) {
        res.status(400).json({ error: { message: "workspaceId is required" } })
        return
      }
      void action(req, principal, workspace, service)
        .then((data) => res.status(200).json({ data }))
        .catch(next)
    }

  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>
  const cycle = (req: Request) => text(req.query.cycle)

  router.use(dependencies.requireAuth)

  router.get(
    "/:workspaceId/finance/cycles",
    handle((_r, p, w, s) => s.getCycles(p, w)),
  )
  router.get(
    "/:workspaceId/finance/settlements",
    handle((r, p, w, s) => s.getSettlements(p, w, cycle(r))),
  )
  router.get(
    "/:workspaceId/finance/collections",
    handle((r, p, w, s) => s.getCollections(p, w, cycle(r))),
  )
  router.get(
    "/:workspaceId/finance/partner-payouts",
    handle((r, p, w, s) => s.getPartnerPayouts(p, w, cycle(r))),
  )
  router.get(
    "/:workspaceId/finance/admin-payouts",
    handle((r, p, w, s) => s.getAdminPayouts(p, w, cycle(r))),
  )
  router.get(
    "/:workspaceId/finance/payments",
    handle((r, p, w, s) =>
      s.getPayments(p, w, {
        account: text(r.query.account),
        status: text(r.query.status),
        cycle: cycle(r),
      }),
    ),
  )
  router.get(
    "/:workspaceId/finance/reports",
    handle((r, p, w, s) => s.getReports(p, w, parsePeriod(r.query.period))),
  )
  router.get(
    "/:workspaceId/finance/approvals",
    handle((_r, p, w, s) => s.getApprovals(p, w)),
  )

  router.post(
    "/:workspaceId/finance/payouts/generate",
    handle((r, p, w, s) => s.generatePayouts(p, w, text(body(r).cycle))),
  )
  router.post(
    "/:workspaceId/finance/payouts/:id/:action",
    handle((r, p, w, s) => {
      const action = r.params.action
      if (action !== "approve" && action !== "reject" && action !== "pay") {
        throw Object.assign(new Error("Unknown payout action"), { status: 404 })
      }
      return s.decidePayout(p, w, String(r.params.id), action)
    }),
  )
  router.post(
    "/:workspaceId/finance/remittances",
    handle((r, p, w, s) => s.recordRemittance(p, w, body(r))),
  )
  router.post(
    "/:workspaceId/finance/adjustments",
    handle((r, p, w, s) => s.addAdjustment(p, w, body(r))),
  )
  router.put(
    "/:workspaceId/finance/partners/:id/pay-plan",
    handle((r, p, w, s) => s.updatePartnerPlan(p, w, String(r.params.id), body(r))),
  )
  router.put(
    "/:workspaceId/finance/admins/:id/pay-plan",
    handle((r, p, w, s) => s.updateAdminPlan(p, w, String(r.params.id), body(r))),
  )
  router.post(
    "/:workspaceId/finance/requests/:id/:action",
    handle((r, p, w, s) => {
      const action = r.params.action
      if (action !== "approve" && action !== "reject") {
        throw Object.assign(new Error("Unknown request action"), { status: 404 })
      }
      return s.decideChangeRequest(p, w, String(r.params.id), action)
    }),
  )

  return router
}
