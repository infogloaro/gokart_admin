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

export interface RevenueQuery extends DashboardQuery {
  businessSlug: string
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

export interface RevenueResponse {
  business: { slug: string; name: string }
  metrics: MetricRow[]
  sales: TrendData
  composition: CompositionRow[]
  transactions: RevenueTransactionRow[]
}

export type ReportPeriod = "daily" | "weekly" | "monthly"

export interface ReportsQuery extends DashboardQuery {
  period: ReportPeriod
}

export interface TopVendorRow {
  id: string
  name: string
  status: string
  orders: number
  tag: string
  amount: string
}

export interface ReportsResponse {
  period: ReportPeriod
  metrics: MetricRow[]
  comparison: TrendData
  topVendors: TopVendorRow[]
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

export interface NotificationsResponse {
  items: NotificationItem[]
}

export interface ResolvedWorkspace {
  id: string
  slug: string
  name: string
}
