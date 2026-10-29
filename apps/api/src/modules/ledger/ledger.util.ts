import type { PaymentMethodFilter, TransactionTypeFilter } from "./ledger.types.js"

export const TYPE_LABELS: Record<TransactionTypeFilter, string> = {
  ORDER_PAYMENT: "Order Payment",
  COD_COLLECTION: "COD Collection",
  REFUND: "Refund",
  VENDOR_SETTLEMENT: "Vendor Settlement",
  PARTNER_EARNINGS: "Partner Earnings",
  PAYOUT_HISTORY: "Payout History",
  CREDIT_NOTE: "Credit Note",
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodFilter, string> = {
  UPI: "UPI",
  CARD: "Card",
  COD: "Cash on Delivery",
  NET_BANKING: "Net Banking",
  WALLET: "Wallet / Credit",
  BANK_TRANSFER: "Bank Transfer",
  STORE_CREDIT: "Store Credit",
}

export const SUMMARY_PAYMENT_METHODS: PaymentMethodFilter[] = [
  "UPI",
  "CARD",
  "COD",
  "NET_BANKING",
  "WALLET",
]

export const REVENUE_TRANSACTION_TYPES: TransactionTypeFilter[] = [
  "ORDER_PAYMENT",
  "COD_COLLECTION",
]

export const CODE_PREFIXES: Partial<Record<TransactionTypeFilter, string>> = {
  ORDER_PAYMENT: "TXN",
  COD_COLLECTION: "TXN",
  REFUND: "REF",
  VENDOR_SETTLEMENT: "SET",
  PARTNER_EARNINGS: "PAY",
  PAYOUT_HISTORY: "PAY",
  CREDIT_NOTE: "CRN",
}
