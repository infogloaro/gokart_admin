import type {
  DashboardData,
  DashboardResponse,
  DateRangeInput,
  OverviewData,
  OverviewResponse,
  ReportPeriod,
  ReportsData,
  ReportsResponse,
  RevenueData,
  RevenueResponse,
} from "@/types/dashboard"

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

function rangeQuery(range: DateRangeInput) {
  const params = new URLSearchParams({ start: range.start, end: range.end })
  return `?${params.toString()}`
}

export async function fetchDashboard(
  workspaceId: string,
  range: DateRangeInput,
): Promise<DashboardData> {
  const result = await request<DashboardResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/dashboard${rangeQuery(range)}`,
  )
  return result.data
}

export async function fetchOverview(
  workspaceId: string,
  range: DateRangeInput,
): Promise<OverviewData> {
  const result = await request<OverviewResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/overview${rangeQuery(range)}`,
  )
  return result.data
}

export async function fetchRevenue(
  workspaceId: string,
  businessSlug: string,
  range: DateRangeInput,
): Promise<RevenueData> {
  const params = new URLSearchParams({ start: range.start, end: range.end, business: businessSlug })
  const result = await request<RevenueResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/revenue?${params.toString()}`,
  )
  return result.data
}

export async function fetchReports(
  workspaceId: string,
  period: ReportPeriod,
  range: DateRangeInput,
): Promise<ReportsData> {
  const params = new URLSearchParams({ start: range.start, end: range.end, period })
  const result = await request<ReportsResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/reports?${params.toString()}`,
  )
  return result.data
}
