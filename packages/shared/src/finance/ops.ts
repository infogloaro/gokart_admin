// Finance & payouts, Transaction ledger and Reports & Analytics API shapes.
// Every amount is integer paise.
import { z } from "zod"
import { Business } from "../common/enums"
import { Paise } from "../common/money"
import { DashboardRange } from "../dashboard/schemas"
import { AccountType, AdminPlan, PartnerPlan, PayoutLine, PayoutStatus } from "./schemas"

// ---------- finance ----------

/** YYYY-MM */
export const Cycle = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM")

export const CycleInfo = z.object({ cycle: Cycle, label: z.string(), closed: z.boolean() })
export type CycleInfo = z.infer<typeof CycleInfo>

/** Pending approval or approved after its due date shows as "overdue". */
export const PayoutDisplayStatus = z.enum([
  "pending_approval",
  "approved",
  "overdue",
  "paid",
  "settled",
  "rejected",
])
export type PayoutDisplayStatus = z.infer<typeof PayoutDisplayStatus>

export const PayoutSummary = z.object({
  id: z.string(),
  code: z.string(),
  accountType: AccountType,
  accountId: z.string(),
  accountName: z.string(),
  cycle: Cycle,
  amountPaise: Paise,
  status: PayoutStatus,
  displayStatus: PayoutDisplayStatus,
  version: z.number().int(),
  dueDate: z.iso.date(),
  createdAt: z.iso.datetime(),
  createdBy: z.string(),
  approvedAt: z.iso.datetime().nullable(),
  approvedBy: z.string().nullable(),
  paidAt: z.iso.datetime().nullable(),
  paidRef: z.string().nullable(),
  paidMethod: z.string().nullable(),
  settledAt: z.iso.datetime().nullable(),
  rejectedBy: z.string().nullable(),
  rejectedReason: z.string().nullable(),
})
export type PayoutSummary = z.infer<typeof PayoutSummary>
export const PayoutDetail = PayoutSummary.extend({ lines: z.array(PayoutLine) })
export type PayoutDetail = z.infer<typeof PayoutDetail>

export const Statement = z.object({
  lines: z.array(PayoutLine),
  totalPaise: Paise,
  deliveries: z.number().int(),
  salaryPaise: Paise,
  fixedPaise: Paise,
  incentivePaise: Paise,
  commissionPaise: Paise,
  bonusPaise: Paise,
  deductionPaise: Paise,
  /** Partners: cash collected from customers, remitted, and still to remit. */
  codPaise: Paise,
  remittedPaise: Paise,
  outstandingPaise: Paise,
  /** Delivery fees and platform revenue from this account's deliveries (or managed partners'). */
  feesPaise: Paise,
  revenuePaise: Paise,
  /** Admins: on-time share of managed deliveries (0–1) and how many partners they manage. */
  onTimeRate: z.number(),
  managedPartners: z.number().int(),
})
export type Statement = z.infer<typeof Statement>

const AccountBase = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  /** "HDFC ••4821" */
  bank: z.string(),
  statement: Statement,
  payout: PayoutSummary.nullable(),
})
export const PartnerAccount = AccountBase.extend({
  business: Business,
  managerId: z.string().nullable(),
  managerName: z.string().nullable(),
  plan: PartnerPlan,
  lastRemittance: z.object({ day: z.iso.date(), method: z.string() }).nullable(),
})
export type PartnerAccount = z.infer<typeof PartnerAccount>
export const AdminAccount = AccountBase.extend({ region: z.string(), plan: AdminPlan })
export type AdminAccount = z.infer<typeof AdminAccount>

export const FinanceOverview = z.object({
  cycle: CycleInfo,
  today: z.iso.date(),
  dueDate: z.iso.date(),
  partners: z.array(PartnerAccount),
  admins: z.array(AdminAccount),
})
export type FinanceOverview = z.infer<typeof FinanceOverview>

export const CycleQuery = z.object({ cycle: Cycle.optional() })

/** State / District filter shared by Finance and Reports; a district needs its state. */
export const GeoFields = z.object({
  state: z.string().trim().min(1).optional(),
  district: z.string().trim().min(1).optional(),
})
export const OverviewQuery = CycleQuery.extend(GeoFields.shape)

export const PlanVersionInfo = z.object({
  from: z.iso.date(),
  plan: z.union([PartnerPlan, AdminPlan]),
  by: z.string(),
  reason: z.string(),
})
export const AccountDetail = z.object({
  accountType: AccountType,
  id: z.string(),
  name: z.string(),
  bank: z.string(),
  cycle: CycleInfo,
  statement: Statement,
  planHistory: z.array(PlanVersionInfo),
  payouts: z.array(PayoutSummary),
  remittances: z.array(
    z.object({
      id: z.string(),
      cycle: Cycle,
      day: z.iso.date(),
      amountPaise: Paise,
      method: z.string(),
      receivedBy: z.string(),
    }),
  ),
})
export type AccountDetail = z.infer<typeof AccountDetail>

export const PayoutListQuery = z.object({
  cycle: Cycle.optional(),
  accountType: AccountType.optional(),
  status: PayoutDisplayStatus.optional(),
  ...GeoFields.shape,
})

const version = z.number().int()
export const GeneratePayoutsRequest = z.object({ cycle: Cycle })
export const PayoutVersionRequest = z.object({ version })
export const RejectPayoutRequest = z.object({ version, reason: z.string().trim().min(5).max(500) })
export const PayPayoutRequest = z.object({
  version,
  reference: z.string().trim().min(6, "Enter the bank / UPI reference").max(60),
  method: z.string().trim().min(2).max(40),
})
export const RemittanceRequest = z.object({
  partnerId: z.string(),
  cycle: Cycle,
  amountPaise: Paise.positive(),
  method: z.enum(["Cash deposit", "UPI to GloAro", "Bank transfer"]),
})
export const AdjustmentRequest = z.object({
  accountType: AccountType,
  accountId: z.string(),
  kind: z.enum(["bonus", "deduction"]),
  amountPaise: Paise.positive(),
  reason: z.string().trim().min(5).max(300),
})
export const PlanChangeRequest = z.object({
  plan: z.union([PartnerPlan, AdminPlan]),
  reason: z.string().trim().min(5).max(300),
})
export const NewPayChangeRequest = z.object({
  accountType: AccountType,
  accountId: z.string(),
  plan: z.union([PartnerPlan, AdminPlan]),
  reason: z.string().trim().min(5).max(300),
})
export const DecideRequest = z.object({ reason: z.string().trim().max(300).optional() })

export const PayChangeRequestInfo = z.object({
  id: z.string(),
  code: z.string(),
  accountType: AccountType,
  accountId: z.string(),
  accountName: z.string(),
  currentPlan: z.union([PartnerPlan, AdminPlan]).nullable(),
  plan: z.union([PartnerPlan, AdminPlan]),
  reason: z.string(),
  requestedBy: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  decidedBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type PayChangeRequestInfo = z.infer<typeof PayChangeRequestInfo>

export const MoneyMovement = z.object({
  day: z.iso.date(),
  reference: z.string(),
  kind: z.enum(["partner_payout", "admin_payout", "cash_remittance"]),
  accountName: z.string(),
  detail: z.string(),
  /** Negative for money paid out, positive for cash received. */
  amountPaise: Paise,
})
export type MoneyMovement = z.infer<typeof MoneyMovement>

export const REPORT_PERIODS = ["daily", "weekly", "monthly", "custom"] as const
export const ReportPeriod = z.enum(REPORT_PERIODS)
export type ReportPeriod = z.infer<typeof ReportPeriod>

export const FinanceReportRow = z.object({
  label: z.string(),
  from: z.iso.date(),
  to: z.iso.date(),
  collectionsPaise: Paise,
  revenuePaise: Paise,
  partnerCostPaise: Paise,
  adminCostPaise: Paise,
  netPaise: Paise,
})
export type FinanceReportRow = z.infer<typeof FinanceReportRow>

export const FinanceAuditEntry = z.object({
  at: z.iso.datetime(),
  actor: z.string(),
  action: z.string(),
  detail: z.string(),
})
export type FinanceAuditEntry = z.infer<typeof FinanceAuditEntry>

// ---------- transaction ledger ----------

export const LEDGER_TYPES = [
  "order_payment",
  "cod_collection",
  "refund",
  "partner_payout",
  "admin_payout",
  "cash_remittance",
] as const
export const LedgerType = z.enum(LEDGER_TYPES)
export type LedgerType = z.infer<typeof LedgerType>
export const ledgerTypeLabel: Record<LedgerType, string> = {
  order_payment: "Order Payment",
  cod_collection: "COD Collection",
  refund: "Refund",
  partner_payout: "Partner Earnings",
  admin_payout: "Admin Payout",
  cash_remittance: "Cash Remittance",
}

export const LEDGER_METHODS = [
  "upi",
  "card",
  "cod",
  "netbanking",
  "wallet",
  "bank_transfer",
] as const
export const LedgerMethod = z.enum(LEDGER_METHODS)
export type LedgerMethod = z.infer<typeof LedgerMethod>
export const ledgerMethodLabel: Record<LedgerMethod, string> = {
  upi: "UPI",
  card: "Card",
  cod: "Cash on Delivery",
  netbanking: "Net Banking",
  wallet: "Wallet / Credit",
  bank_transfer: "Bank Transfer",
}

export const LedgerQuery = z.object({
  range: DashboardRange.default("30d"),
  business: Business.optional(),
  type: LedgerType.optional(),
  method: LedgerMethod.optional(),
  search: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
})
export type LedgerQuery = z.infer<typeof LedgerQuery>

export const LedgerSummary = z.object({
  range: DashboardRange,
  grossPaise: Paise,
  commissionPaise: Paise,
  deliveryFeesPaise: Paise,
  refundsPaise: Paise,
  /** Commission + delivery fees − refunds. */
  netPaise: Paise,
  methods: z.array(z.object({ method: LedgerMethod, amountPaise: Paise, share: z.number() })),
})
export type LedgerSummary = z.infer<typeof LedgerSummary>

export const LedgerEntry = z.object({
  id: z.string(),
  code: z.string(),
  business: Business.nullable(),
  reference: z.string(),
  type: LedgerType,
  beneficiary: z.string(),
  method: LedgerMethod,
  grossPaise: Paise,
  feesPaise: Paise,
  netPaise: Paise,
  status: z.string(),
  at: z.iso.datetime(),
})
export type LedgerEntry = z.infer<typeof LedgerEntry>

// ---------- reports & analytics ----------

const reportDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")

/** A "custom" period reports the days from `from` to `to` inclusive (IST), at most three years. */
/** Reports & Analytics adds a yearly view (the last five calendar years) to the finance periods. */
export const ANALYTICS_PERIODS = ["daily", "weekly", "monthly", "yearly", "custom"] as const
export const AnalyticsPeriod = z.enum(ANALYTICS_PERIODS)
export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriod>

export const AnalyticsQuery = z
  .object({
    period: AnalyticsPeriod.default("monthly"),
    from: reportDate.optional(),
    to: reportDate.optional(),
    /** Only orders fulfilled by this delivery company. */
    fleetId: z.string().optional(),
    /** Only orders delivered by this rider. */
    boyId: z.string().optional(),
    ...GeoFields.shape,
  })
  .refine((q) => q.period !== "custom" || (q.from !== undefined && q.to !== undefined), {
    message: "Choose a first and a last date for a custom period.",
    path: ["from"],
  })
export const Analytics = z.object({
  period: AnalyticsPeriod,
  metrics: z.object({
    orders: z.object({ value: z.number().int(), previous: z.number().int() }),
    grossPaise: z.object({ value: Paise, previous: Paise }),
    platformPaise: z.object({ value: Paise, previous: Paise }),
    averageOrderPaise: z.object({ value: Paise, previous: Paise }),
  }),
  /** Platform revenue per bucket and business. */
  series: z.array(z.object({ label: z.string(), from: z.iso.date(), food: Paise, mart: Paise })),
  topVendors: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      business: Business,
      orders: z.number().int(),
      grossPaise: Paise,
    }),
  ),
})
export type Analytics = z.infer<typeof Analytics>

// Delivery partner and rider comparison. Orders are counted by the month/week/day/year they were placed.
const Minutes = z.number().nullable()

/** The period, or a custom first and last date. */
const ComparisonPeriod = {
  period: AnalyticsPeriod.default("monthly"),
  from: reportDate.optional(),
  to: reportDate.optional(),
}
export const PartnerComparisonQuery = z.object({ ...ComparisonPeriod, ...GeoFields.shape })
export const RiderComparisonQuery = z.object({
  ...ComparisonPeriod,
  fleetId: z.string().optional(),
  ...GeoFields.shape,
})
export const RiderDeliveriesQuery = z.object(ComparisonPeriod)

const ComparisonCounts = {
  deliveries: z.number().int(),
  /**
   * Average minutes from the rider taking an order (the accepted offer or assignment, else when it
   * was placed) to delivering it. Null when nothing was delivered.
   */
  avgMinutes: Minutes,
  offersSent: z.number().int(),
  offersAccepted: z.number().int(),
  complaints: z.number().int(),
  codCollectedPaise: Paise,
}

export const PartnerComparisonRow = z.object({
  fleetId: z.string(),
  fleetName: z.string(),
  riders: z.number().int(),
  ...ComparisonCounts,
})
export type PartnerComparisonRow = z.infer<typeof PartnerComparisonRow>

export const RiderComparisonRow = z.object({
  boyId: z.string(),
  code: z.string(),
  name: z.string(),
  fleetId: z.string(),
  fleetName: z.string(),
  zoneName: z.string(),
  ...ComparisonCounts,
})
export type RiderComparisonRow = z.infer<typeof RiderComparisonRow>

export const DistrictComparisonRow = z.object({
  district: z.string(),
  riders: z.number().int(),
  partners: z.number().int(),
  ...ComparisonCounts,
})
export type DistrictComparisonRow = z.infer<typeof DistrictComparisonRow>

export const RIDER_STEPS = [
  "placed",
  "accepted",
  "picked_up",
  "out_for_delivery",
  "delivered",
] as const
export const RiderDeliveryStep = z.object({
  key: z.enum(RIDER_STEPS),
  label: z.string(),
  at: z.string().nullable(),
})

/** One order the rider handled, with the steps it went through. */
export const RiderDeliveryRow = z.object({
  orderId: z.string(),
  orderCode: z.string(),
  business: Business,
  vendorName: z.string(),
  placedAt: z.iso.datetime(),
  delivered: z.boolean(),
  steps: z.array(RiderDeliveryStep),
  codeVerified: z.boolean(),
  proofAt: z.iso.datetime().nullable(),
  amountPaise: Paise,
  complaints: z.array(
    z.object({
      code: z.string(),
      category: z.string(),
      status: z.string(),
      priority: z.string(),
    }),
  ),
})
export type RiderDeliveryRow = z.infer<typeof RiderDeliveryRow>
