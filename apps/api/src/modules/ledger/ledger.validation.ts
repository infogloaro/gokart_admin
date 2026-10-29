import type {
  LedgerQuery,
  PaymentMethodFilter,
  SummaryQuery,
  TransactionTypeFilter,
} from "./ledger.types.js"

const DEFAULT_RANGE_DAYS = 30
const DEFAULT_PAGE_SIZE = 8
const MAX_PAGE_SIZE = 1000

const TRANSACTION_TYPES: TransactionTypeFilter[] = [
  "ORDER_PAYMENT",
  "COD_COLLECTION",
  "REFUND",
  "VENDOR_SETTLEMENT",
  "PARTNER_EARNINGS",
  "PAYOUT_HISTORY",
  "CREDIT_NOTE",
]

const PAYMENT_METHODS: PaymentMethodFilter[] = [
  "UPI",
  "CARD",
  "COD",
  "NET_BANKING",
  "WALLET",
  "BANK_TRANSFER",
  "STORE_CREDIT",
]

function fail(message: string): never {
  throw Object.assign(new Error(message), { status: 400 })
}

function parseDate(value: string, label: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    fail(`${label} must be a valid date (YYYY-MM-DD)`)
  }
  return parsed
}

function parseWorkspaceSlug(params: Record<string, unknown>): string {
  const workspaceSlug = params.workspaceId
  if (typeof workspaceSlug !== "string" || workspaceSlug.trim().length === 0) {
    fail("workspaceId is required")
  }
  return workspaceSlug.trim()
}

function parseRange(query: Record<string, unknown>): { start: Date; end: Date } {
  const { start, end } = query

  if (start === undefined && end === undefined) {
    const endDate = new Date()
    endDate.setUTCHours(23, 59, 59, 999)
    const startDate = new Date(endDate)
    startDate.setUTCDate(startDate.getUTCDate() - (DEFAULT_RANGE_DAYS - 1))
    startDate.setUTCHours(0, 0, 0, 0)
    return { start: startDate, end: endDate }
  }

  if (typeof start !== "string" || typeof end !== "string") {
    fail("start and end must both be provided as YYYY-MM-DD")
  }

  const startDate = parseDate(start, "start")
  const endDate = parseDate(end, "end")
  endDate.setUTCHours(23, 59, 59, 999)

  if (startDate.getTime() > endDate.getTime()) {
    fail("start must be on or before end")
  }

  return { start: startDate, end: endDate }
}

export function parseSummaryQuery(
  params: Record<string, unknown>,
  query: Record<string, unknown>,
): SummaryQuery {
  return { workspaceSlug: parseWorkspaceSlug(params), range: parseRange(query) }
}

export function parseLedgerQuery(
  params: Record<string, unknown>,
  query: Record<string, unknown>,
): LedgerQuery {
  const workspaceSlug = parseWorkspaceSlug(params)
  const range = parseRange(query)

  const { type, method, search, page, pageSize } = query

  let typeFilter: TransactionTypeFilter | undefined
  if (type !== undefined) {
    if (typeof type !== "string" || !TRANSACTION_TYPES.includes(type as TransactionTypeFilter)) {
      fail("type is not a recognised transaction type")
    }
    typeFilter = type as TransactionTypeFilter
  }

  let methodFilter: PaymentMethodFilter | undefined
  if (method !== undefined) {
    if (typeof method !== "string" || !PAYMENT_METHODS.includes(method as PaymentMethodFilter)) {
      fail("method is not a recognised payment method")
    }
    methodFilter = method as PaymentMethodFilter
  }

  const searchTerm =
    typeof search === "string" && search.trim().length > 0 ? search.trim() : undefined

  let pageNumber = 1
  if (page !== undefined) {
    const parsed = Number(page)
    if (!Number.isInteger(parsed) || parsed < 1) {
      fail("page must be a positive integer")
    }
    pageNumber = parsed
  }

  let pageSizeNumber = DEFAULT_PAGE_SIZE
  if (pageSize !== undefined) {
    const parsed = Number(pageSize)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
      fail(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`)
    }
    pageSizeNumber = parsed
  }

  return {
    workspaceSlug,
    range,
    type: typeFilter,
    paymentMethod: methodFilter,
    search: searchTerm,
    page: pageNumber,
    pageSize: pageSizeNumber,
  }
}
