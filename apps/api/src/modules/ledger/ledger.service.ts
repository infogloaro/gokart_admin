import type { PrismaClient } from "../../generated/client/index.js"
import { createLedgerRepository } from "./ledger.repository.js"
import type { TransactionFilters } from "./ledger.repository.js"
import {
  PAYMENT_METHOD_LABELS,
  REVENUE_TRANSACTION_TYPES,
  SUMMARY_PAYMENT_METHODS,
  TYPE_LABELS,
} from "./ledger.util.js"
import {
  WORKSPACE_TAGS,
  formatChange,
  formatInr,
  previousRange,
} from "../dashboard/dashboard.util.js"
import type {
  DateRange,
  LedgerSummaryResponse,
  LedgerTransactionRow,
  LedgerTransactionsResponse,
  PaymentMethodFilter,
  ResolveAccessibleWorkspaceIds,
  ResolvedWorkspace,
  WorkspacePrincipal,
} from "./ledger.types.js"

function fail(message: string, status: number): never {
  throw Object.assign(new Error(message), { status })
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  return Number(value)
}

export function createLedgerService(
  prisma: PrismaClient,
  resolveAccessibleWorkspaceIds: ResolveAccessibleWorkspaceIds,
) {
  const repository = createLedgerRepository(prisma)

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

  return {
    async getSummary(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      range: DateRange,
    ): Promise<LedgerSummaryResponse> {
      const workspaces = await resolveWorkspaces(principal, workspaceSlug)
      const workspaceIds = workspaces.map((workspace) => workspace.id)
      const prior = previousRange(range)

      const [revenue, previousRevenue, refunds, paymentGroups] = await Promise.all([
        repository.aggregateByTypes(workspaceIds, range, REVENUE_TRANSACTION_TYPES),
        repository.aggregateByTypes(workspaceIds, prior, REVENUE_TRANSACTION_TYPES),
        repository.aggregateByType(workspaceIds, range, "REFUND"),
        repository.groupPaymentMethods(workspaceIds, range, REVENUE_TRANSACTION_TYPES),
      ])

      const grossOrderValue = toNumber(revenue._sum.grossAmount)
      const platformCommission = toNumber(revenue._sum.commissionAmount)
      const previousPlatformCommission = toNumber(previousRevenue._sum.commissionAmount)
      const deliveryFees = toNumber(revenue._sum.deliveryFeeAmount)
      const previousDeliveryFees = toNumber(previousRevenue._sum.deliveryFeeAmount)
      const refundTotal = toNumber(refunds._sum.grossAmount)
      const netPlatformRevenue = platformCommission + deliveryFees - refundTotal

      const refundPctOfGtv = grossOrderValue > 0 ? (refundTotal / grossOrderValue) * 100 : 0

      const paymentTotalsByMethod = new Map<string, number>()
      for (const row of paymentGroups) {
        paymentTotalsByMethod.set(row.paymentMethod, toNumber(row._sum.grossAmount))
      }
      const paymentTotal = [...paymentTotalsByMethod.values()].reduce(
        (sum, value) => sum + value,
        0,
      )

      const paymentMethods = SUMMARY_PAYMENT_METHODS.map((method) => {
        const amount = paymentTotalsByMethod.get(method) ?? 0
        return {
          key: method as PaymentMethodFilter,
          label: PAYMENT_METHOD_LABELS[method],
          percent: paymentTotal > 0 ? Math.round((amount / paymentTotal) * 1000) / 10 : 0,
          amount: formatInr(amount),
        }
      })

      return {
        grossOrderValue: { value: formatInr(grossOrderValue), caption: "Not platform profit" },
        platformCommission: {
          value: formatInr(platformCommission),
          caption: formatChange(platformCommission, previousPlatformCommission),
        },
        deliveryFees: {
          value: formatInr(deliveryFees),
          caption: formatChange(deliveryFees, previousDeliveryFees),
        },
        refunds: {
          value: formatInr(refundTotal),
          caption: `${refundPctOfGtv.toFixed(1)}% of GTV`,
        },
        netPlatformRevenue: {
          value: formatInr(netPlatformRevenue),
          caption: "After refunds",
        },
        paymentMethods,
      }
    },

    async getTransactions(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      range: DateRange,
      filters: TransactionFilters,
      page: number,
      pageSize: number,
    ): Promise<LedgerTransactionsResponse> {
      const workspaces = await resolveWorkspaces(principal, workspaceSlug)
      const workspaceIds = workspaces.map((workspace) => workspace.id)

      const [total, rows] = await Promise.all([
        repository.countTransactions(workspaceIds, range, filters),
        repository.listTransactions(workspaceIds, range, filters, (page - 1) * pageSize, pageSize),
      ])

      const items: LedgerTransactionRow[] = rows.map((row) => {
        const net = toNumber(row.netAmount)
        return {
          id: row.id,
          code: row.transactionCode,
          tag: WORKSPACE_TAGS[row.workspace.slug] ?? "FOOD",
          reference: row.reference,
          type: row.type,
          typeLabel: TYPE_LABELS[row.type],
          counterparty: row.counterparty,
          paymentMethod: row.paymentMethod,
          gross: formatInr(toNumber(row.grossAmount)),
          fee: formatInr(toNumber(row.commissionAmount) + toNumber(row.deliveryFeeAmount)),
          net: formatInr(net),
          isNegative: net < 0,
        }
      })

      return { items, total, page, pageSize }
    },
  }
}
