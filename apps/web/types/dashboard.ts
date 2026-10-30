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

export interface CompositionRow {
  label: string
  value: number
}

export interface RevenueTransactionRow {
  id: string
  customer: string
  business: string
  vendor: string
  partner: string
  payment: string
  status: string
  amount: string
}

export interface RevenueData {
  business: { slug: string; name: string }
  metrics: MetricRow[]
  sales: TrendData
  composition: CompositionRow[]
  transactions: RevenueTransactionRow[]
}

export type ReportPeriod = "daily" | "weekly" | "monthly"

export interface TopVendorRow {
  id: string
  name: string
  status: string
  orders: number
  tag: string
  amount: string
}

export interface ReportsData {
  period: ReportPeriod
  metrics: MetricRow[]
  comparison: TrendData
  topVendors: TopVendorRow[]
}

export interface ReportsResponse {
  data: ReportsData
}

export type NotificationKind = "order" | "vendor" | "partner" | "complaint" | "refund" | "document"

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  message: string
  tags: string[]
  createdAt: string
  target: string
}

export interface NotificationsData {
  items: NotificationItem[]
}

export interface NotificationsResponse {
  data: NotificationsData
}

export interface RevenueResponse {
  data: RevenueData
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
