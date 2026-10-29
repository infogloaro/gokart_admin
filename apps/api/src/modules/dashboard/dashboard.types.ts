export type { ResolveAccessibleWorkspaceIds, WorkspacePrincipal } from "../workspace.types.js"

export interface DateRange {
  start: Date
  end: Date
}

export interface DashboardQuery {
  workspaceSlug: string
  range: DateRange
}

export interface MetricRow {
  label: string
  value: string
  change: string
}

export interface TrendSeries {
  label: string
  color: string
  points: number[]
  values: string[]
}

export interface OrderSlice {
  label: string
  value: number
  color: string
}

export interface TransactionRow {
  id: string
  vendor: string
  status: string
  tag: string
  amount: string
}

export type AttentionIcon = "warning" | "refund" | "docs"

export interface AttentionItem {
  icon: AttentionIcon
  title: string
  subtitle: string
  target: string
}

export interface TrendData {
  days: string[]
  series: TrendSeries[]
}

export interface DashboardResponse {
  metrics: MetricRow[]
  trend: TrendData
  orderDistribution: OrderSlice[]
  transactions: TransactionRow[]
  attention: AttentionItem[]
}

export interface OverviewMetric {
  key: "acceptance" | "prepSla" | "deliveryCompletion" | "satisfaction"
  value: string
  barPercent: number
}

export interface OverviewResponse {
  metrics: OverviewMetric[]
  insight: string
}

export interface ResolvedWorkspace {
  id: string
  slug: string
  name: string
}
