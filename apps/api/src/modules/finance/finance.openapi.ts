import {
  AccountDetail,
  AccountType,
  AdjustmentRequest,
  CycleInfo,
  CycleQuery,
  DecideRequest,
  FinanceAuditEntry,
  FinanceOverview,
  FinanceReportRow,
  GeneratePayoutsRequest,
  GeoFields,
  MoneyMovement,
  NewPayChangeRequest,
  OverviewQuery,
  PayChangeRequestInfo,
  PayoutDetail,
  PayoutListQuery,
  PayoutSummary,
  PayoutVersionRequest,
  PayPayoutRequest,
  PlanChangeRequest,
  RejectPayoutRequest,
  RemittanceRequest,
  ReportPeriod,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, noContent, registry } from "../../openapi/registry"

const tags = ["Finance & payouts"]
const id = z.object({ id: z.string() })
const body = (schema: z.ZodType) => ({ content: { "application/json": { schema } } })
const DetailRef = registry.register("PayoutDetail", PayoutDetail)
const SummaryRef = registry.register("PayoutSummary", PayoutSummary)

const get = (path: string, summary: string, response: z.ZodType, request?: object) =>
  registry.registerPath({
    method: "get",
    path,
    tags,
    summary,
    ...(request && { request }),
    responses: { 200: json(response, "OK"), ...errors(400, 401, 403, 404) },
  })
const post = (
  path: string,
  summary: string,
  schema: z.ZodType | null,
  ok: { status: number; schema?: z.ZodType },
  params = false,
) =>
  registry.registerPath({
    method: "post",
    path,
    tags,
    summary,
    request: { ...(params && { params: id }), ...(schema && { body: body(schema) }) },
    responses: {
      [ok.status]: ok.schema ? json(ok.schema, "OK") : noContent,
      ...errors(400, 401, 403, 404, 409),
    },
  })

get("/finance/cycles", "The current pay cycle and the two before it", z.array(CycleInfo))
get(
  "/finance/overview",
  "Every partner and admin account's statement and payout for a cycle",
  registry.register("FinanceOverview", FinanceOverview),
  { query: OverviewQuery },
)
get(
  "/finance/accounts/{type}/{id}",
  "One account's calculation, plan history, payouts and remittances",
  registry.register("AccountDetail", AccountDetail),
  {
    params: z.object({ type: AccountType, id: z.string() }),
    query: CycleQuery,
  },
)
get("/finance/payouts", "Payout records across cycles", z.array(SummaryRef), {
  query: PayoutListQuery,
})
get("/finance/payouts/{id}", "One payout with its frozen calculation", DetailRef, { params: id })
post(
  "/finance/payouts/generate",
  "Freeze each account's statement into a payout awaiting approval",
  GeneratePayoutsRequest,
  { status: 201, schema: z.object({ created: z.number().int() }) },
)
post(
  "/finance/payouts/{id}/approve",
  "Approve a pending payout (version-checked, audited)",
  PayoutVersionRequest,
  { status: 200, schema: DetailRef },
  true,
)
post(
  "/finance/payouts/{id}/reject",
  "Reject a pending or approved payout with a reason",
  RejectPayoutRequest,
  { status: 200, schema: DetailRef },
  true,
)
post(
  "/finance/payouts/{id}/pay",
  "Record a payment made outside the panel; settles when nothing is owed back",
  PayPayoutRequest,
  { status: 200, schema: DetailRef },
  true,
)
post(
  "/finance/payouts/{id}/recalculate",
  "Recalculate a rejected payout and send it for approval again",
  PayoutVersionRequest,
  { status: 200, schema: DetailRef },
  true,
)
post(
  "/finance/remittances",
  "Record cash on delivery handed back by a partner",
  RemittanceRequest,
  { status: 201 },
)
post("/finance/adjustments", "Add a bonus or deduction to the current cycle", AdjustmentRequest, {
  status: 201,
})
registry.registerPath({
  method: "put",
  path: "/finance/plans/{type}/{id}",
  tags,
  summary: "Change an account's pay plan from today (earlier days keep their rates)",
  request: {
    params: z.object({ type: AccountType, id: z.string() }),
    body: body(PlanChangeRequest),
  },
  responses: { 204: noContent, ...errors(400, 401, 403, 404) },
})
get("/finance/requests", "Pay change requests", z.array(PayChangeRequestInfo))
post(
  "/finance/requests",
  "Propose a pay change (admins: only for partners they manage)",
  NewPayChangeRequest,
  { status: 201 },
)
post(
  "/finance/requests/{id}/approve",
  "Approve a pay change request and apply it from today",
  DecideRequest,
  { status: 204 },
  true,
)
post(
  "/finance/requests/{id}/reject",
  "Reject a pay change request",
  DecideRequest,
  { status: 204 },
  true,
)
get(
  "/finance/movements",
  "Money paid out to partners and admins, and cash remitted to GloAro",
  z.array(MoneyMovement),
)
get(
  "/finance/report",
  "Daily, weekly or monthly finance report from daily accruals",
  z.array(FinanceReportRow),
  { query: z.object({ period: ReportPeriod.optional(), ...GeoFields.shape }) },
)
get("/finance/audit", "Finance audit trail", z.array(FinanceAuditEntry))

registry.registerPath({
  method: "get",
  path: "/finance/reconciliation",
  tags,
  summary: "Check every payout against its lines, its payment record and the ledger",
  request: {
    query: z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }),
  },
  responses: {
    200: json(
      z.object({
        rows: z.array(
          z.object({
            id: z.string(),
            code: z.string(),
            accountType: z.string(),
            payee: z.string(),
            cycle: z.string(),
            status: z.string(),
            dueDate: z.string(),
            payoutPaise: z.number().int(),
            linesPaise: z.number().int(),
            ledgerPaise: z.number().int().nullable(),
            differencePaise: z.number().int(),
            issues: z.array(z.string()),
          }),
        ),
        summary: z.object({
          payouts: z.number().int(),
          clean: z.number().int(),
          withIssues: z.number().int(),
          payoutPaise: z.number().int(),
          postedPaise: z.number().int(),
        }),
      }),
    ),
    ...errors(401, 403),
  },
})
