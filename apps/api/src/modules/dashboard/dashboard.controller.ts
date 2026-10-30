import type { Request, Response, NextFunction, RequestHandler } from "express"
import {
  parseDashboardQuery,
  parseReportsQuery,
  parseRevenueQuery,
} from "./dashboard.validation.js"
import type { createDashboardService } from "./dashboard.service.js"
import type { WorkspacePrincipal } from "./dashboard.types.js"

type DashboardService = ReturnType<typeof createDashboardService>

export function createDashboardController(
  service: DashboardService,
  getPrincipal: (req: Request) => WorkspacePrincipal | null,
) {
  const handle =
    (action: (req: Request, principal: WorkspacePrincipal) => Promise<unknown>): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
      const principal = getPrincipal(req)

      if (!principal?.userId) {
        res.status(401).json({
          error: { message: "Authentication required" },
        })
        return
      }

      void action(req, principal)
        .then((data) => res.status(200).json({ data }))
        .catch(next)
    }

  return {
    getDashboard: handle((req, principal) => {
      const { workspaceSlug, range } = parseDashboardQuery(
        req.params as Record<string, unknown>,
        req.query as Record<string, unknown>,
      )
      return service.getDashboard(principal, workspaceSlug, range)
    }),

    getRevenue: handle((req, principal) => {
      const { workspaceSlug, businessSlug, range } = parseRevenueQuery(
        req.params as Record<string, unknown>,
        req.query as Record<string, unknown>,
      )
      return service.getRevenue(principal, workspaceSlug, businessSlug, range)
    }),

    getReports: handle((req, principal) => {
      const { workspaceSlug, range, period } = parseReportsQuery(
        req.params as Record<string, unknown>,
        req.query as Record<string, unknown>,
      )
      return service.getReports(principal, workspaceSlug, range, period)
    }),

    getNotifications: handle((req, principal) => {
      const { workspaceSlug } = parseDashboardQuery(
        req.params as Record<string, unknown>,
        req.query as Record<string, unknown>,
      )
      return service.getNotifications(principal, workspaceSlug)
    }),

    getOverview: handle((req, principal) => {
      const { workspaceSlug, range } = parseDashboardQuery(
        req.params as Record<string, unknown>,
        req.query as Record<string, unknown>,
      )
      return service.getOverview(principal, workspaceSlug, range)
    }),
  }
}
