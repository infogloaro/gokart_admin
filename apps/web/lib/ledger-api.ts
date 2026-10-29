import type {
  LedgerFilters,
  LedgerSummary,
  LedgerSummaryResponse,
  LedgerTransactionsPage,
  LedgerTransactionsResponse,
} from "@/types/ledger"
import type { DateRangeInput } from "@/types/dashboard"

const API_URL = process.env.NEXT_PUBLIC_API_URL

async function request<T>(path: string): Promise<T> {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.")
  }

  const response = await fetch(`${API_URL.replace(/\/+$/, "")}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? body?.message ?? `Request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

function buildQuery(range: DateRangeInput, extra: Record<string, string | number | undefined>) {
  const params = new URLSearchParams({ start: range.start, end: range.end })
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value))
  }
  return `?${params.toString()}`
}

export async function fetchLedgerSummary(
  workspaceId: string,
  range: DateRangeInput,
): Promise<LedgerSummary> {
  const result = await request<LedgerSummaryResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/summary${buildQuery(range, {})}`,
  )
  return result.data
}

export async function fetchLedgerTransactions(
  workspaceId: string,
  range: DateRangeInput,
  filters: LedgerFilters,
  page: number,
  pageSize: number,
): Promise<LedgerTransactionsPage> {
  const result = await request<LedgerTransactionsResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/transactions${buildQuery(range, {
      type: filters.type,
      method: filters.paymentMethod,
      search: filters.search,
      page,
      pageSize,
    })}`,
  )
  return result.data
}
