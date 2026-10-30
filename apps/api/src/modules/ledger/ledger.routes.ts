// Transaction ledger: GET /ledger/summary and /ledger/transactions (ledger.view).
import { LEDGER_METHODS, LedgerQuery, type LedgerEntry, type LedgerSummary } from "@zoauro/shared"
import { Router, type Request, type Response } from "express"
import { parse } from "../../lib/errors"
import { requireAuth, requirePermission, scope } from "../../middleware/auth"
import { periods } from "../dashboard/dashboard.service"
import * as repo from "./ledger.repository"

const n = (v: bigint | number) => Number(v)

async function summary(req: Request, res: Response) {
  const q = parse(LedgerQuery, req.query)
  const { current } = periods(q.range)
  const { totals, methods } = await repo.summary(scope(req, q.business), current, q.business)
  const gross = n(totals.gross)
  const body: LedgerSummary = {
    range: q.range,
    grossPaise: gross,
    commissionPaise: n(totals.commission),
    deliveryFeesPaise: n(totals.fees),
    refundsPaise: n(totals.refunds),
    netPaise: n(totals.commission) + n(totals.fees) - n(totals.refunds),
    methods: LEDGER_METHODS.filter((m) => m !== "bank_transfer").map((method) => {
      const amount = n(methods.find((x) => x.method === method)?.amount ?? 0)
      return { method, amountPaise: amount, share: gross ? amount / gross : 0 }
    }),
  }
  res.json(body)
}

async function transactions(req: Request, res: Response) {
  const q = parse(LedgerQuery, req.query)
  const { current } = periods(q.range)
  const { rows, total } = await repo.list(
    scope(req, q.business),
    current,
    { business: q.business, type: q.type, method: q.method, search: q.search || undefined },
    q.page,
    q.pageSize,
  )
  const items: LedgerEntry[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    business: r.business,
    reference: r.reference,
    type: r.type,
    beneficiary: r.beneficiary,
    method: r.method,
    grossPaise: n(r.gross),
    feesPaise: n(r.fees),
    netPaise: n(r.net),
    status: r.status,
    at: r.at.toISOString(),
  }))
  res.json({ items, total, page: q.page })
}

export const ledgerRoutes = Router()
  .use(requireAuth, requirePermission("ledger.view"))
  .get("/summary", summary)
  .get("/transactions", transactions)
