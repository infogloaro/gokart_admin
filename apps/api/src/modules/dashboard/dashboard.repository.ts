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
