import type { PrismaClient } from "../../generated/client/index.js"
import { createDashboardRepository } from "./dashboard.repository.js"
import {
  DISTRIBUTION_LABELS,
  WORKSPACE_COLORS,
  WORKSPACE_TAGS,
  buildPeriodBuckets,
  buildTrendBuckets,
  distributionBucket,
  formatChange,
  formatInr,
  previousRange,
  titleCase,
} from "./dashboard.util.js"
import type {
  AttentionItem,
  DashboardResponse,
  DateRange,
  NotificationItem,
  NotificationsResponse,
  OverviewResponse,
  ReportPeriod,
  ReportsResponse,
  ResolveAccessibleWorkspaceIds,
  ResolvedWorkspace,
  RevenueResponse,
  TransactionRow,
  TrendSeries,
  WorkspacePrincipal,
} from "./dashboard.types.js"

const PREP_SLA_MINUTES = 25
const DELIVERY_SLA_MINUTES = 45
const PARTNER_DOC_WINDOW_DAYS = 30
const RECENT_TRANSACTIONS_LIMIT = 5
const REVENUE_TRANSACTIONS_LIMIT = 10
const REVENUE_CHART_BUCKETS = 11
const TOP_VENDORS_LIMIT = 5
const NOTIFICATIONS_PER_SOURCE = 8
const NOTIFICATIONS_LIMIT = 20

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

  async function buildRevenueMetrics(workspaceIds: string[], range: DateRange) {
    const [current, previous] = await Promise.all([
      repository.aggregateRevenue(workspaceIds, range),
      repository.aggregateRevenue(workspaceIds, previousRange(range)),
    ])

    const read = (aggregate: typeof current) => {
      const orders = aggregate._count._all
      const gross = toNumber(aggregate._sum.grossValue)
      return {
        orders,
        gross,
        platformRevenue: toNumber(aggregate._sum.platformRevenue),
        commission: toNumber(aggregate._sum.commissionAmount),
        deliveryFees: toNumber(aggregate._sum.deliveryFeeAmount),
        averageOrder: orders > 0 ? gross / orders : 0,
      }
    }
    const now = read(current)
    const before = read(previous)

    const metrics = [
      {
        label: "Gross order value",
        value: formatInr(now.gross),
        change: formatChange(now.gross, before.gross),
      },
      {
        label: "Platform revenue",
        value: formatInr(now.platformRevenue),
        change: formatChange(now.platformRevenue, before.platformRevenue),
      },
      {
        label: "Orders",
        value: now.orders.toLocaleString("en-IN"),
        change: formatChange(now.orders, before.orders),
      },
      {
        label: "Avg order value",
        value: formatInr(now.averageOrder),
        change: formatChange(now.averageOrder, before.averageOrder),
      },
      {
        label: "Commission earned",
        value: formatInr(now.commission),
        change: formatChange(now.commission, before.commission),
      },
      {
        label: "Delivery fees",
        value: formatInr(now.deliveryFees),
        change: formatChange(now.deliveryFees, before.deliveryFees),
      },
    ]

    const total = now.platformRevenue
    const commissionShare = total > 0 ? Math.round((now.commission / total) * 100) : 0
    const deliveryShare = total > 0 ? Math.round((now.deliveryFees / total) * 100) : 0
    const composition = [
      { label: "Commission", value: commissionShare },
      { label: "Delivery fees", value: deliveryShare },
      {
        label: "Other fees",
        value: total > 0 ? Math.max(0, 100 - commissionShare - deliveryShare) : 0,
      },
    ]

    return { metrics, composition }
  }

  async function buildRevenueSales(workspaceIds: string[], range: DateRange) {
    const orders = await repository.listOrdersForSales(workspaceIds, range)
    const buckets = buildTrendBuckets(range, REVENUE_CHART_BUCKETS)

    const sums = buckets.map((bucket) => {
      const inBucket = orders.filter(
        (order) => order.placedAt >= bucket.start && order.placedAt <= bucket.end,
      )
      return {
        gross: inBucket.reduce((total, order) => total + toNumber(order.grossValue), 0),
        platformRevenue: inBucket.reduce(
          (total, order) => total + toNumber(order.platformRevenue),
          0,
        ),
      }
    })

    const series: TrendSeries[] = [
      {
        label: "Gross value",
        color: "#08224b",
        points: sums.map((sum) => sum.gross / 1_00_000),
        values: sums.map((sum) => formatInr(sum.gross)),
      },
      {
        label: "Platform revenue",
        color: "#d99700",
        points: sums.map((sum) => sum.platformRevenue / 1_00_000),
        values: sums.map((sum) => formatInr(sum.platformRevenue)),
      },
    ]

    return { days: buckets.map((bucket) => bucket.label), series }
  }

  async function buildRevenueTransactions(workspaceIds: string[], range: DateRange) {
    const orders = await repository.listRecentRevenueOrders(
      workspaceIds,
      range,
      REVENUE_TRANSACTIONS_LIMIT,
    )
    return orders.map((order) => ({
      id: order.orderNumber,
      customer: order.customerName,
      business: order.workspace.name,
      vendor: order.vendor?.name ?? "Unknown vendor",
      partner: order.deliveryPartner?.name ?? "Unassigned",
      payment: titleCase(order.paymentStatus),
      status: titleCase(order.status),
      amount: formatInr(toNumber(order.grossValue)),
    }))
  }

  async function buildReportMetrics(workspaceIds: string[], range: DateRange) {
    const [current, previous] = await Promise.all([
      repository.aggregateRevenue(workspaceIds, range),
      repository.aggregateRevenue(workspaceIds, previousRange(range)),
    ])
    const read = (aggregate: typeof current) => {
      const orders = aggregate._count._all
      const gross = toNumber(aggregate._sum.grossValue)
      return {
        orders,
        gross,
        platformRevenue: toNumber(aggregate._sum.platformRevenue),
        averageOrder: orders > 0 ? gross / orders : 0,
      }
    }
    const now = read(current)
    const before = read(previous)
    return [
      {
        label: "Total orders",
        value: now.orders.toLocaleString("en-IN"),
        change: formatChange(now.orders, before.orders),
      },
      {
        label: "Combined GTV",
        value: formatInr(now.gross),
        change: formatChange(now.gross, before.gross),
      },
      {
        label: "Platform revenue",
        value: formatInr(now.platformRevenue),
        change: formatChange(now.platformRevenue, before.platformRevenue),
      },
      {
        label: "Average order",
        value: formatInr(now.averageOrder),
        change: formatChange(now.averageOrder, before.averageOrder),
      },
    ]
  }

  async function buildReportComparison(
    workspaces: ResolvedWorkspace[],
    range: DateRange,
    period: ReportPeriod,
  ) {
    const orders = await repository.listOrdersForTrend(
      workspaces.map((workspace) => workspace.id),
      range,
    )
    const periodBuckets = buildPeriodBuckets(range, period)
    // A period wider than the range (e.g. monthly over 30 days) yields a single
    // point, which cannot draw a line, so fall back to an even split of the range.
    const buckets = periodBuckets.length >= 2 ? periodBuckets : buildTrendBuckets(range)
    const series: TrendSeries[] = workspaces.map((workspace) => {
      const sums = buckets.map((bucket) =>
        orders
          .filter(
            (order) =>
              order.workspaceId === workspace.id &&
              order.placedAt >= bucket.start &&
              order.placedAt <= bucket.end,
          )
          .reduce((total, order) => total + toNumber(order.platformRevenue), 0),
      )
      return {
        label: workspace.name,
        color: WORKSPACE_COLORS[workspace.slug] ?? "#08224b",
        points: sums.map((sum) => sum / 1_00_000),
        values: sums.map((sum) => formatInr(sum)),
      }
    })
    return { days: buckets.map((bucket) => bucket.label), series }
  }

  async function buildTopVendors(workspaces: ResolvedWorkspace[], range: DateRange) {
    const grouped = await repository.groupOrdersByVendor(
      workspaces.map((workspace) => workspace.id),
      range,
      TOP_VENDORS_LIMIT,
    )
    const vendorIds = grouped.flatMap((row) => (row.vendorId ? [row.vendorId] : []))
    const vendors = await repository.findVendorsByIds(vendorIds)
    const slugById = new Map(workspaces.map((workspace) => [workspace.id, workspace.slug]))

    return grouped.flatMap((row) => {
      const vendor = vendors.find((item) => item.id === row.vendorId)
      if (!vendor) return []
      return [
        {
          id: vendor.id,
          name: vendor.name,
          status:
            vendor.approvalStatus === "APPROVED" ? "Active" : titleCase(vendor.approvalStatus),
          orders: row._count._all,
          tag: WORKSPACE_TAGS[slugById.get(vendor.workspaceId) ?? ""] ?? "FOOD",
          amount: formatInr(toNumber(row._sum.grossValue)),
        },
      ]
    })
  }

  async function buildNotifications(workspaceIds: string[]): Promise<NotificationItem[]> {
    const startOfToday = new Date()
    startOfToday.setUTCHours(0, 0, 0, 0)

    const [orders, vendors, partners, complaints, refunds, expiringDocs] = await Promise.all([
      repository.listRecentOrdersForNotifications(workspaceIds, NOTIFICATIONS_PER_SOURCE),
      repository.listRecentVendors(workspaceIds, NOTIFICATIONS_PER_SOURCE),
      repository.listRecentDeliveryPartners(workspaceIds, NOTIFICATIONS_PER_SOURCE),
      repository.listRecentComplaints(workspaceIds, NOTIFICATIONS_PER_SOURCE),
      repository.listEscalatedRefunds(workspaceIds, NOTIFICATIONS_PER_SOURCE),
      repository.countExpiringPartnerDocuments(
        workspaceIds,
        new Date(Date.now() + PARTNER_DOC_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      ),
    ])

    const items: NotificationItem[] = [
      ...orders.map((order) => ({
        id: `order-${order.id}`,
        kind: "order" as const,
        title: "New order received",
        message: `${order.customerName} placed an order worth ${formatInr(toNumber(order.grossValue))}${order.vendor ? ` at ${order.vendor.name}` : ""}.`,
        tags: [order.orderNumber, order.workspace.name],
        createdAt: order.placedAt.toISOString(),
        target: "Orders",
      })),
      ...vendors.map((vendor) => ({
        id: `vendor-${vendor.id}`,
        kind: "vendor" as const,
        title: vendor.approvalStatus === "PENDING" ? "New vendor application" : "Vendor added",
        message:
          vendor.approvalStatus === "PENDING"
            ? `${vendor.name} has applied to join. Your approval is required.`
            : `${vendor.name} was added as a ${titleCase(vendor.approvalStatus)} vendor.`,
        tags: [vendor.name, vendor.workspace.name],
        createdAt: vendor.createdAt.toISOString(),
        target: "Vendors",
      })),
      ...partners.map((partner) => ({
        id: `partner-${partner.id}`,
        kind: "partner" as const,
        title: "New delivery partner",
        message: `${partner.name} was added as a delivery partner (${titleCase(partner.status)}).`,
        tags: [partner.name, partner.workspace.name],
        createdAt: partner.createdAt.toISOString(),
        target: "Delivery partners",
      })),
      ...complaints.map((complaint) => ({
        id: `complaint-${complaint.id}`,
        kind: "complaint" as const,
        title: "New complaint",
        message: complaint.title,
        tags: [complaint.workspace.name],
        createdAt: complaint.createdAt.toISOString(),
        target: "Complaints & exceptions",
      })),
      ...refunds.map((refund) => ({
        id: `refund-${refund.id}`,
        kind: "refund" as const,
        title: "Refund escalated",
        message: `${refund.order?.orderNumber ?? "A refund"} for ${formatInr(toNumber(refund.amount))} requires Finance review.`,
        tags: [refund.order?.orderNumber ?? "Refund", refund.workspace.name],
        createdAt: refund.createdAt.toISOString(),
        target: "Finance & payouts",
      })),
    ]

    if (expiringDocs > 0) {
      items.push({
        id: `documents-${startOfToday.toISOString().slice(0, 10)}`,
        kind: "document",
        title: "Partner documents expiring",
        message: `${expiringDocs} document${expiringDocs === 1 ? "" : "s"} expire within ${PARTNER_DOC_WINDOW_DAYS} days.`,
        tags: [],
        createdAt: startOfToday.toISOString(),
        target: "Delivery partners",
      })
    }

    return items
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, NOTIFICATIONS_LIMIT)
  }

  return {
    async getNotifications(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
    ): Promise<NotificationsResponse> {
      const workspaces = await resolveWorkspaces(principal, workspaceSlug)
      const items = await buildNotifications(workspaces.map((workspace) => workspace.id))
      return { items }
    },

    async getReports(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      range: DateRange,
      period: ReportPeriod,
    ): Promise<ReportsResponse> {
      const workspaces = await resolveWorkspaces(principal, workspaceSlug)
      const workspaceIds = workspaces.map((workspace) => workspace.id)

      const [metrics, comparison, topVendors] = await Promise.all([
        buildReportMetrics(workspaceIds, range),
        buildReportComparison(workspaces, range, period),
        buildTopVendors(workspaces, range),
      ])

      return { period, metrics, comparison, topVendors }
    },

    async getRevenue(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      businessSlug: string,
      range: DateRange,
    ): Promise<RevenueResponse> {
      const workspaces = await resolveWorkspaces(principal, workspaceSlug)
      const business = workspaces.find((workspace) => workspace.slug === businessSlug)
      if (!business) {
        fail("Business not found or access denied", 404)
      }
      const workspaceIds = [business.id]

      const [{ metrics, composition }, sales, transactions] = await Promise.all([
        buildRevenueMetrics(workspaceIds, range),
        buildRevenueSales(workspaceIds, range),
        buildRevenueTransactions(workspaceIds, range),
      ])

      return {
        business: { slug: business.slug, name: business.name },
        metrics,
        sales,
        composition,
        transactions,
      }
    },

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
