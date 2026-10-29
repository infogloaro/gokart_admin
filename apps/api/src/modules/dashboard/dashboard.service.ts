import type { PrismaClient } from "../../generated/client/index.js"
import { createDashboardRepository } from "./dashboard.repository.js"
import {
  DISTRIBUTION_LABELS,
  WORKSPACE_COLORS,
  WORKSPACE_TAGS,
  buildTrendBuckets,
  distributionBucket,
  formatChange,
  formatInr,
  previousRange,
} from "./dashboard.util.js"
import type {
  AttentionItem,
  DashboardResponse,
  DateRange,
  OverviewResponse,
  ResolveAccessibleWorkspaceIds,
  ResolvedWorkspace,
  TransactionRow,
  TrendSeries,
  WorkspacePrincipal,
} from "./dashboard.types.js"

const PREP_SLA_MINUTES = 25
const DELIVERY_SLA_MINUTES = 45
const PARTNER_DOC_WINDOW_DAYS = 30
const RECENT_TRANSACTIONS_LIMIT = 5

function fail(message: string, status: number): never {
  throw Object.assign(new Error(message), { status })
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  return Number(value)
}

export function createDashboardService(
  prisma: PrismaClient,
  resolveAccessibleWorkspaceIds: ResolveAccessibleWorkspaceIds,
) {
  const repository = createDashboardRepository(prisma)

  async function resolveWorkspaces(
    principal: WorkspacePrincipal,
    workspaceSlug: string,
  ): Promise<ResolvedWorkspace[]> {
    const accessibleIds = await resolveAccessibleWorkspaceIds(principal)
    if (!Array.isArray(accessibleIds)) {
      fail("Unable to resolve workspace access", 500)
    }

    const accessible = await repository.findWorkspacesByIds([...new Set(accessibleIds)])

    if (workspaceSlug === "all") {
      if (accessible.length === 0) {
        fail("Workspace not found or access denied", 404)
      }
      return accessible
    }

    const match = accessible.find(
      (workspace) => workspace.slug === workspaceSlug || workspace.id === workspaceSlug,
    )
    if (!match) {
      fail("Workspace not found or access denied", 404)
    }
    return [match]
  }

  async function buildMetrics(workspaceIds: string[], range: DateRange) {
    const prior = previousRange(range)

    const [
      totalOrders,
      previousTotalOrders,
      values,
      previousValues,
      activeVendors,
      deliveryPartners,
      pendingOrders,
      previousPendingOrders,
      openComplaints,
      pendingApprovals,
    ] = await Promise.all([
      repository.countOrders(workspaceIds, range),
      repository.countOrders(workspaceIds, prior),
      repository.aggregateOrderValues(workspaceIds, range),
      repository.aggregateOrderValues(workspaceIds, prior),
      repository.countVendorsByStatus(workspaceIds, "APPROVED"),
      repository.countDeliveryPartners(workspaceIds, "ACTIVE"),
      repository.countPendingOrders(workspaceIds, range),
      repository.countPendingOrders(workspaceIds, prior),
      repository.countOpenComplaints(workspaceIds),
      repository.countVendorsByStatus(workspaceIds, "PENDING"),
    ])

    const grossValue = toNumber(values._sum.grossValue)
    const previousGrossValue = toNumber(previousValues._sum.grossValue)
    const platformRevenue = toNumber(values._sum.platformRevenue)
    const previousPlatformRevenue = toNumber(previousValues._sum.platformRevenue)

    return [
      {
        label: "Total orders",
        value: totalOrders.toLocaleString("en-IN"),
        change: formatChange(totalOrders, previousTotalOrders),
      },
      {
        label: "Gross order value",
        value: formatInr(grossValue),
        change: formatChange(grossValue, previousGrossValue),
      },
      {
        label: "Platform revenue",
        value: formatInr(platformRevenue),
        change: formatChange(platformRevenue, previousPlatformRevenue),
      },
      { label: "Active vendors", value: activeVendors.toLocaleString("en-IN"), change: "—" },
      { label: "Delivery partners", value: deliveryPartners.toLocaleString("en-IN"), change: "—" },
      {
        label: "Pending orders",
        value: pendingOrders.toLocaleString("en-IN"),
        change: formatChange(pendingOrders, previousPendingOrders),
      },
      { label: "Open complaints", value: openComplaints.toLocaleString("en-IN"), change: "—" },
      {
        label: "Pending approvals",
        value: pendingApprovals > 0 ? pendingApprovals.toLocaleString("en-IN") : "—",
        change: pendingApprovals > 0 ? "Review" : "All clear",
      },
    ]
  }

  async function buildTrend(workspaces: ResolvedWorkspace[], range: DateRange) {
    const orders = await repository.listOrdersForTrend(
      workspaces.map((workspace) => workspace.id),
      range,
    )
    const buckets = buildTrendBuckets(range)

    const series: TrendSeries[] = workspaces.map((workspace) => {
      const points = buckets.map((bucket) => {
        const sum = orders
          .filter(
            (order) =>
              order.workspaceId === workspace.id &&
              order.placedAt >= bucket.start &&
              order.placedAt <= bucket.end,
          )
          .reduce((total, order) => total + toNumber(order.platformRevenue), 0)
        return sum / 1_00_000
      })

      return {
        label: workspace.name,
        color: WORKSPACE_COLORS[workspace.slug] ?? "#08224b",
        points,
        values: points.map((point) => formatInr(point * 1_00_000)),
      }
    })

    return { days: buckets.map((bucket) => bucket.label), series }
  }

  async function buildOrderDistribution(workspaceIds: string[], range: DateRange) {
    const grouped = await repository.groupOrdersByStatus(workspaceIds, range)
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0)

    const bucketCounts = new Map<string, number>()
    for (const row of grouped) {
      const bucket = distributionBucket(row.status)
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + row._count._all)
    }

    return (Object.keys(DISTRIBUTION_LABELS) as Array<keyof typeof DISTRIBUTION_LABELS>).map(
      (key) => {
        const count = bucketCounts.get(key) ?? 0
        const { label, color } = DISTRIBUTION_LABELS[key]!
        return { label, color, value: total > 0 ? Math.round((count / total) * 100) : 0 }
      },
    )
  }

  async function buildTransactions(workspaceIds: string[]): Promise<TransactionRow[]> {
    const orders = await repository.listRecentOrders(workspaceIds, RECENT_TRANSACTIONS_LIMIT)
    return orders.map((order) => ({
      id: order.orderNumber,
      vendor: order.vendor?.name ?? "Unknown vendor",
      status: order.status
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      tag: WORKSPACE_TAGS[order.workspace.slug] ?? "FOOD",
      amount: formatInr(toNumber(order.grossValue)),
    }))
  }

  async function buildAttention(workspaceIds: string[]): Promise<AttentionItem[]> {
    const [pendingApprovals, escalatedRefunds, expiringDocs] = await Promise.all([
      repository.listPendingVendorApprovals(workspaceIds),
      repository.aggregateEscalatedRefunds(workspaceIds),
      repository.countExpiringPartnerDocuments(
        workspaceIds,
        new Date(Date.now() + PARTNER_DOC_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      ),
    ])

    const attention: AttentionItem[] = []

    if (pendingApprovals.length > 0) {
      const oldest = pendingApprovals[0]!
      const days = Math.max(
        1,
        Math.floor((Date.now() - oldest.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      )
      attention.push({
        icon: "warning",
        title: `${pendingApprovals.length} vendor approvals pending`,
        subtitle: `Oldest waiting ${days} day${days === 1 ? "" : "s"}`,
        target: "Vendors",
      })
    }

    const escalatedCount = escalatedRefunds._count._all
    if (escalatedCount > 0) {
      attention.push({
        icon: "refund",
        title: `${escalatedCount} refunds escalated`,
        subtitle: `Total exposure ${formatInr(toNumber(escalatedRefunds._sum.amount))}`,
        target: "Finance & payouts",
      })
    }

    if (expiringDocs > 0) {
      attention.push({
        icon: "docs",
        title: `${expiringDocs} partner documents expiring`,
        subtitle: `Within the next ${PARTNER_DOC_WINDOW_DAYS} days`,
        target: "Delivery partners",
      })
    }

    return attention
  }

  return {
    async getDashboard(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      range: DateRange,
    ): Promise<DashboardResponse> {
      const workspaces = await resolveWorkspaces(principal, workspaceSlug)
      const workspaceIds = workspaces.map((workspace) => workspace.id)

      const [metrics, trend, orderDistribution, transactions, attention] = await Promise.all([
        buildMetrics(workspaceIds, range),
        buildTrend(workspaces, range),
        buildOrderDistribution(workspaceIds, range),
        buildTransactions(workspaceIds),
        buildAttention(workspaceIds),
      ])

      return { metrics, trend, orderDistribution, transactions, attention }
    },

    async getOverview(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      range: DateRange,
    ): Promise<OverviewResponse> {
      const workspaces = await resolveWorkspaces(principal, workspaceSlug)
      const workspaceIds = workspaces.map((workspace) => workspace.id)

      const [funnel, totalOrders, previousTotalOrders, openComplaints] = await Promise.all([
        repository.listOrderFunnel(workspaceIds, range),
        repository.countOrders(workspaceIds, range),
        repository.countOrders(workspaceIds, previousRange(range)),
        repository.countOpenComplaints(workspaceIds),
      ])

      const total = funnel.length || 1
      const acceptedCount = funnel.filter((order) => order.acceptedAt !== null).length
      const acceptanceRate = (acceptedCount / total) * 100

      const withPrep = funnel.filter((order) => order.acceptedAt && order.readyAt)
      const withinPrepSla = withPrep.filter(
        (order) =>
          (order.readyAt!.getTime() - order.acceptedAt!.getTime()) / 60000 <= PREP_SLA_MINUTES,
      ).length
      const prepSlaRate = withPrep.length > 0 ? (withinPrepSla / withPrep.length) * 100 : 0

      const withDelivery = funnel.filter((order) => order.acceptedAt && order.deliveredAt)
      const withinDeliverySla = withDelivery.filter(
        (order) =>
          (order.deliveredAt!.getTime() - order.acceptedAt!.getTime()) / 60000 <=
          DELIVERY_SLA_MINUTES,
      ).length
      const deliveryCompletionRate =
        withDelivery.length > 0 ? (withinDeliverySla / withDelivery.length) * 100 : 0

      const ratings = funnel
        .map((order) => order.rating)
        .filter((rating): rating is number => rating !== null)
      const avgRating =
        ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0

      const insight =
        totalOrders >= previousTotalOrders
          ? `Order volume is trending above last period while exception rates remain within the assigned operational threshold.`
          : `Order volume is trending below last period; keep an eye on ${openComplaints} open complaint${openComplaints === 1 ? "" : "s"} as volume recovers.`

      return {
        insight,
        metrics: [
          {
            key: "acceptance",
            value: `${acceptanceRate.toFixed(1)}%`,
            barPercent: Math.round(acceptanceRate),
          },
          {
            key: "prepSla",
            value: `${prepSlaRate.toFixed(1)}%`,
            barPercent: Math.round(prepSlaRate),
          },
          {
            key: "deliveryCompletion",
            value: `${deliveryCompletionRate.toFixed(1)}%`,
            barPercent: Math.round(deliveryCompletionRate),
          },
          {
            key: "satisfaction",
            value: `${avgRating.toFixed(1)} / 5`,
            barPercent: Math.round((avgRating / 5) * 100),
          },
        ],
      }
    },
  }
}
