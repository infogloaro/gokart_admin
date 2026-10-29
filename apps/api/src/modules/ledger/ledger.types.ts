export type { ResolveAccessibleWorkspaceIds, WorkspacePrincipal } from "../workspace.types.js"

export interface DateRange {
  start: Date
  end: Date
}

export type TransactionTypeFilter =
  | "ORDER_PAYMENT"
  | "COD_COLLECTION"
  | "REFUND"
  | "VENDOR_SETTLEMENT"
  | "PARTNER_EARNINGS"
  | "PAYOUT_HISTORY"
  | "CREDIT_NOTE"

export type PaymentMethodFilter =
  "UPI" | "CARD" | "COD" | "NET_BANKING" | "WALLET" | "BANK_TRANSFER" | "STORE_CREDIT"

export interface LedgerQuery {
  workspaceSlug: string
  range: DateRange
  type?: TransactionTypeFilter
  paymentMethod?: PaymentMethodFilter
  search?: string
  page: number
  pageSize: number
}

export interface SummaryQuery {
  workspaceSlug: string
  range: DateRange
}

export interface SummaryCard {
  value: string
  caption: string
}

export interface PaymentMethodBreakdown {
  key: PaymentMethodFilter
  label: string
  percent: number
  amount: string
}

export interface LedgerSummaryResponse {
  grossOrderValue: SummaryCard
  platformCommission: SummaryCard
  deliveryFees: SummaryCard
  refunds: SummaryCard
  netPlatformRevenue: SummaryCard
  paymentMethods: PaymentMethodBreakdown[]
}

export interface LedgerTransactionRow {
  id: string
  code: string
  tag: string
  reference: string
  type: TransactionTypeFilter
  typeLabel: string
  counterparty: string
  paymentMethod: PaymentMethodFilter
  gross: string
  fee: string
  net: string
  isNegative: boolean
}

export interface LedgerTransactionsResponse {
  items: LedgerTransactionRow[]
  total: number
  page: number
  pageSize: number
}

export interface ResolvedWorkspace {
  id: string
  slug: string
  name: string
}
