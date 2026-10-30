export interface FinanceCycle {
  key: string
  label: string
  open: boolean
}

export interface SettlementsData {
  cycle: FinanceCycle
  rangeLabel: string
  kpis: {
    collections: number
    remitted: number
    remittedPercent: number
    pendingRemittance: number
    partnersHoldingCash: number
    partnerEarnings: number
    partnerAccounts: number
    adminEarnings: number
    adminAccounts: number
    bonuses: number
    deductions: number
    pendingPayout: number | null
    platformRevenue: number
    netProfit: number
    marginPercent: number
  }
  profit: {
    deliveryFees: number
    orderCommission: number
    platformRevenue: number
    partnerEarnings: number
    adminEarnings: number
    netProfit: number
  }
  remittance: { collected: number; remitted: number; owed: number }
  payoutsGenerated: boolean
}

export interface CollectionRow {
  partnerId: string
  name: string
  code: string
  accountCode: string
  business: string
  managedBy: string
  deliveries: number
  cashCollected: number
  remitted: number
  toRemit: number
  lastRemittance: { at: string; method: string } | null
  status: "Pending" | "Settled"
}

export interface CollectionsData {
  cycle: FinanceCycle
  rows: CollectionRow[]
}

export interface PartnerPlanInput {
  monthlySalary: number
  fixedPay: number
  perDeliveryRate: number
  feeSharePercent: number
}

export interface PartnerPayoutRow {
  partnerId: string
  name: string
  code: string
  accountCode: string
  planLabel: string
  plan: PartnerPlanInput
  deliveries: number
  salary: number
  fixed: number
  perDelivery: number
  commission: number
  bonus: number
  deductions: number
  earnings: number
  payoutStatus: string
}

export interface PartnerPayoutsData {
  cycle: FinanceCycle
  rows: PartnerPayoutRow[]
}

export interface AdminPlanInput {
  monthlySalary: number
  commissionPercent: number
  incentiveAmount: number
  onTimeThreshold: number
}

export interface AdminPayoutRow {
  adminId: string
  name: string
  location: string
  accountCode: string
  planLabel: string
  plan: AdminPlanInput
  partners: number
  onTimePercent: number
  salary: number
  commission: number
  incentive: number | null
  bonus: number
  deductions: number
  earnings: number
  payoutStatus: string
}

export interface AdminPayoutsData {
  cycle: FinanceCycle
  rows: AdminPayoutRow[]
}

export interface PayoutRecord {
  id: string
  code: string
  kind: "PARTNER" | "ADMIN"
  accountId: string
  accountName: string
  accountRef: string
  cycle: string
  cycleLabel: string
  amount: number
  dueDate: string
  status: string
  rawStatus: string
  note: string
  generatedAt: string
  approvedAt: string | null
  approvedBy: string | null
  paidAt: string | null
}

export interface PaymentsData {
  summary: Record<
    "paid" | "pending" | "approved" | "overdue" | "settled",
    { amount: number; count: number }
  >
  accounts: Array<{ id: string; name: string }>
  cycles: Array<{ key: string; label: string }>
  rows: PayoutRecord[]
}

export interface FinanceReportRow {
  label: string
  collections: number
  platformRevenue: number
  partnerPayouts: number
  adminSalaries: number
  netProfit: number
}

export interface FinanceReportsData {
  period: "daily" | "weekly" | "monthly"
  rows: FinanceReportRow[]
  total: Omit<FinanceReportRow, "label">
}

export interface ChangeRequestRow {
  id: string
  code: string
  partnerName: string
  requestedBy: string
  requestedByLocation: string
  createdAt: string
  currentPlan: string
  proposedPlan: string
  reason: string
  status: "PENDING" | "APPROVED" | "REJECTED"
}

export interface ApprovalsData {
  payouts: PayoutRecord[]
  payoutsTotal: number
  requests: ChangeRequestRow[]
  pendingCount: number
  audit: Array<{ id: string; actor: string; action: string; detail: string; at: string }>
}
