import type { PrismaClient } from "../../generated/client/index.js"
import type { DateRange } from "./dashboard.types.js"

const PENDING_ORDER_STATUSES = ["PLACED", "PREPARING", "ON_THE_WAY"] as const

export function createDashboardRepository(prisma: PrismaClient) {
  return {
    findWorkspacesBySlugs(slugs: string[]) {
      return prisma.workspace.findMany({
        where: { slug: { in: slugs }, status: "ACTIVE" },
        select: { id: true, slug: true, name: true },
      })
    },

    findWorkspacesByIds(ids: string[]) {
      if (ids.length === 0) return Promise.resolve([])
      return prisma.workspace.findMany({
        where: { id: { in: ids }, status: "ACTIVE" },
        select: { id: true, slug: true, name: true },
        orderBy: { name: "asc" },
      })
    },

    countOrders(workspaceIds: string[], range: DateRange) {
      return prisma.order.count({
        where: {
          workspaceId: { in: workspaceIds },
          placedAt: { gte: range.start, lte: range.end },
        },
      })
    },

    aggregateOrderValues(workspaceIds: string[], range: DateRange) {
      return prisma.order.aggregate({
        where: {
          workspaceId: { in: workspaceIds },
          placedAt: { gte: range.start, lte: range.end },
        },
        _sum: { grossValue: true, platformRevenue: true },
      })
    },

    countVendorsByStatus(workspaceIds: string[], status: "APPROVED" | "PENDING" | "REJECTED") {
      return prisma.vendor.count({
        where: { workspaceId: { in: workspaceIds }, approvalStatus: status },
      })
    },

    countDeliveryPartners(workspaceIds: string[], status: "ACTIVE" | "INACTIVE") {
      return prisma.deliveryPartner.count({
        where: { workspaceId: { in: workspaceIds }, status },
      })
    },

    countPendingOrders(workspaceIds: string[], range: DateRange) {
      return prisma.order.count({
        where: {
          workspaceId: { in: workspaceIds },
          placedAt: { gte: range.start, lte: range.end },
          status: { in: [...PENDING_ORDER_STATUSES] },
        },
      })
    },

    countOpenComplaints(workspaceIds: string[]) {
      return prisma.complaint.count({
        where: { workspaceId: { in: workspaceIds }, status: "OPEN" },
      })
    },

    groupOrdersByStatus(workspaceIds: string[], range: DateRange) {
      return prisma.order.groupBy({
        by: ["status"],
        where: {
          workspaceId: { in: workspaceIds },
          placedAt: { gte: range.start, lte: range.end },
        },
        _count: { _all: true },
      })
    },

    listOrdersForTrend(workspaceIds: string[], range: DateRange) {
      return prisma.order.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          placedAt: { gte: range.start, lte: range.end },
        },
        select: { workspaceId: true, placedAt: true, platformRevenue: true },
      })
    },

    listRecentOrders(workspaceIds: string[], limit: number) {
      return prisma.order.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { placedAt: "desc" },
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          grossValue: true,
          workspace: { select: { slug: true } },
          vendor: { select: { name: true } },
        },
      })
    },

    aggregateRevenue(workspaceIds: string[], range: DateRange) {
      return prisma.order.aggregate({
        where: {
          workspaceId: { in: workspaceIds },
          placedAt: { gte: range.start, lte: range.end },
        },
        _count: { _all: true },
        _sum: {
          grossValue: true,
          platformRevenue: true,
          commissionAmount: true,
          deliveryFeeAmount: true,
        },
      })
    },

    listOrdersForSales(workspaceIds: string[], range: DateRange) {
      return prisma.order.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          placedAt: { gte: range.start, lte: range.end },
        },
        select: { placedAt: true, grossValue: true, platformRevenue: true },
      })
    },

    listRecentRevenueOrders(workspaceIds: string[], range: DateRange, limit: number) {
      return prisma.order.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          placedAt: { gte: range.start, lte: range.end },
        },
        orderBy: { placedAt: "desc" },
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          status: true,
          paymentStatus: true,
          grossValue: true,
          workspace: { select: { name: true } },
          vendor: { select: { name: true } },
          deliveryPartner: { select: { name: true } },
        },
      })
    },

    groupOrdersByVendor(workspaceIds: string[], range: DateRange, limit: number) {
      return prisma.order.groupBy({
        by: ["vendorId"],
        where: {
          workspaceId: { in: workspaceIds },
          vendorId: { not: null },
          placedAt: { gte: range.start, lte: range.end },
        },
        _count: { _all: true },
        _sum: { grossValue: true },
        orderBy: { _sum: { grossValue: "desc" } },
        take: limit,
      })
    },

    findVendorsByIds(ids: string[]) {
      if (ids.length === 0) return Promise.resolve([])
      return prisma.vendor.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, approvalStatus: true, workspaceId: true },
      })
    },

    listRecentOrdersForNotifications(workspaceIds: string[], limit: number) {
      return prisma.order.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { placedAt: "desc" },
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          grossValue: true,
          placedAt: true,
          workspace: { select: { name: true } },
          vendor: { select: { name: true } },
        },
      })
    },

    listRecentVendors(workspaceIds: string[], limit: number) {
      return prisma.vendor.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          approvalStatus: true,
          createdAt: true,
          workspace: { select: { name: true } },
        },
      })
    },

    listRecentDeliveryPartners(workspaceIds: string[], limit: number) {
      return prisma.deliveryPartner.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          workspace: { select: { name: true } },
        },
      })
    },

    listRecentComplaints(workspaceIds: string[], limit: number) {
      return prisma.complaint.findMany({
        where: { workspaceId: { in: workspaceIds }, status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          createdAt: true,
          workspace: { select: { name: true } },
        },
      })
    },

    listEscalatedRefunds(workspaceIds: string[], limit: number) {
      return prisma.refundCase.findMany({
        where: { workspaceId: { in: workspaceIds }, status: "ESCALATED" },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          amount: true,
          createdAt: true,
          workspace: { select: { name: true } },
          order: { select: { orderNumber: true } },
        },
      })
    },

    listPendingVendorApprovals(workspaceIds: string[]) {
      return prisma.vendor.findMany({
        where: { workspaceId: { in: workspaceIds }, approvalStatus: "PENDING" },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    },

    aggregateEscalatedRefunds(workspaceIds: string[]) {
      return prisma.refundCase.aggregate({
        where: { workspaceId: { in: workspaceIds }, status: "ESCALATED" },
        _count: { _all: true },
        _sum: { amount: true },
      })
    },

    countExpiringPartnerDocuments(workspaceIds: string[], within: Date) {
      return prisma.partnerDocument.count({
        where: { workspaceId: { in: workspaceIds }, expiresAt: { lte: within, gte: new Date() } },
      })
    },

    listOrderFunnel(workspaceIds: string[], range: DateRange) {
      return prisma.order.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          placedAt: { gte: range.start, lte: range.end },
        },
        select: {
          status: true,
          placedAt: true,
          acceptedAt: true,
          readyAt: true,
          deliveredAt: true,
          rating: true,
        },
      })
    },
  }
}
