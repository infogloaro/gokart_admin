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

export interface LedgerSummary {
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

export interface LedgerTransactionsPage {
  items: LedgerTransactionRow[]
  total: number
  page: number
  pageSize: number
}

export interface LedgerSummaryResponse {
  data: LedgerSummary
}

export interface LedgerTransactionsResponse {
  data: LedgerTransactionsPage
}

export interface LedgerFilters {
  type?: TransactionTypeFilter
  paymentMethod?: PaymentMethodFilter
  search?: string
}

export const TRANSACTION_TYPE_OPTIONS: Array<{ value: TransactionTypeFilter; label: string }> = [
  { value: "ORDER_PAYMENT", label: "Order Payment" },
  { value: "COD_COLLECTION", label: "COD Collection" },
  { value: "REFUND", label: "Refund" },
  { value: "VENDOR_SETTLEMENT", label: "Vendor Settlement" },
  { value: "PARTNER_EARNINGS", label: "Partner Earnings" },
  { value: "PAYOUT_HISTORY", label: "Payout History" },
  { value: "CREDIT_NOTE", label: "Credit Note" },
]

export const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethodFilter; label: string }> = [
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "COD", label: "Cash on Delivery" },
  { value: "NET_BANKING", label: "Net Banking" },
  { value: "WALLET", label: "Wallet / Credit" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "STORE_CREDIT", label: "Store Credit" },
]
