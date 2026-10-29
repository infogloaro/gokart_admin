import type { Request, Response, NextFunction, RequestHandler } from "express"
import { parseLedgerQuery, parseSummaryQuery } from "./ledger.validation.js"
import type { createLedgerService } from "./ledger.service.js"
import type { WorkspacePrincipal } from "./ledger.types.js"

type LedgerService = ReturnType<typeof createLedgerService>

export function createLedgerController(
  service: LedgerService,
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
    getSummary: handle((req, principal) => {
      const { workspaceSlug, range } = parseSummaryQuery(
        req.params as Record<string, unknown>,
        req.query as Record<string, unknown>,
      )
      return service.getSummary(principal, workspaceSlug, range)
    }),

    getTransactions: handle((req, principal) => {
      const { workspaceSlug, range, type, paymentMethod, search, page, pageSize } =
        parseLedgerQuery(
          req.params as Record<string, unknown>,
          req.query as Record<string, unknown>,
        )
      return service.getTransactions(
        principal,
        workspaceSlug,
        range,
        { type, paymentMethod, search },
        page,
        pageSize,
      )
    }),
  }
}
