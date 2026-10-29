import type { Prisma, PrismaClient } from "../../generated/client/index.js"
import type { DateRange, PaymentMethodFilter, TransactionTypeFilter } from "./ledger.types.js"

export interface TransactionFilters {
  type?: TransactionTypeFilter
  paymentMethod?: PaymentMethodFilter
  search?: string
}

function buildWhere(
  workspaceIds: string[],
  range: DateRange,
  filters: TransactionFilters = {},
  types?: TransactionTypeFilter[],
): Prisma.TransactionWhereInput {
  return {
    workspaceId: { in: workspaceIds },
    createdAt: { gte: range.start, lte: range.end },
    ...(types ? { type: { in: types } } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.search
      ? {
          OR: [
            { transactionCode: { contains: filters.search, mode: "insensitive" } },
            { reference: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  }
}

export function createLedgerRepository(prisma: PrismaClient) {
  return {
    findWorkspacesByIds(ids: string[]) {
      if (ids.length === 0) return Promise.resolve([])
      return prisma.workspace.findMany({
        where: { id: { in: ids }, status: "ACTIVE" },
        select: { id: true, slug: true, name: true },
        orderBy: { name: "asc" },
      })
    },

    aggregateByTypes(workspaceIds: string[], range: DateRange, types: TransactionTypeFilter[]) {
      return prisma.transaction.aggregate({
        where: buildWhere(workspaceIds, range, {}, types),
        _sum: {
          grossAmount: true,
          commissionAmount: true,
          deliveryFeeAmount: true,
          netAmount: true,
        },
      })
    },

    aggregateByType(workspaceIds: string[], range: DateRange, type: TransactionTypeFilter) {
      return prisma.transaction.aggregate({
        where: buildWhere(workspaceIds, range, {}, [type]),
        _sum: { grossAmount: true },
      })
    },

    groupPaymentMethods(workspaceIds: string[], range: DateRange, types: TransactionTypeFilter[]) {
      return prisma.transaction.groupBy({
        by: ["paymentMethod"],
        where: buildWhere(workspaceIds, range, {}, types),
        _sum: { grossAmount: true },
      })
    },

    countTransactions(workspaceIds: string[], range: DateRange, filters: TransactionFilters) {
      return prisma.transaction.count({ where: buildWhere(workspaceIds, range, filters) })
    },

    listTransactions(
      workspaceIds: string[],
      range: DateRange,
      filters: TransactionFilters,
      skip: number,
      take: number,
    ) {
      return prisma.transaction.findMany({
        where: buildWhere(workspaceIds, range, filters),
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          transactionCode: true,
          reference: true,
          type: true,
          counterparty: true,
          paymentMethod: true,
          grossAmount: true,
          commissionAmount: true,
          deliveryFeeAmount: true,
          netAmount: true,
          workspace: { select: { slug: true } },
        },
      })
    },
  }
}
