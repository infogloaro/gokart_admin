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

export interface TrendData {
  days: string[]
  series: TrendSeries[]
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

export interface DashboardData {
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

export interface OverviewData {
  metrics: OverviewMetric[]
  insight: string
}

export interface DashboardResponse {
  data: DashboardData
}

export interface OverviewResponse {
  data: OverviewData
}

export interface DateRangeInput {
  start: string
  end: string
}
