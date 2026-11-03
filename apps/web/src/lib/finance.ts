"use client"
// Hooks for Finance & payouts, the Transaction ledger and Reports & Analytics.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import type {
  AccountType,
  AdminPlan,
  Business,
  DashboardRange,
  LedgerMethod,
  LedgerType,
  PartnerPlan,
  PayoutDisplayStatus,
  ReportPeriod,
} from "@zoauro/shared"

// ---------- finance ----------

export const useCycles = () =>
  useQuery({
    queryKey: ["finance", "cycles"],
    queryFn: () => api("get", "/finance/cycles"),
    staleTime: 60_000,
  })

/** State / District chosen in the Finance and Reports filter; empty means all India. */
export type Geo = { state?: string; district?: string }

export const useGeography = () =>
  useQuery({
    queryKey: ["geography"],
    queryFn: () => api("get", "/zones/geography"),
    staleTime: 5 * 60_000,
  })

export const useFinanceOverview = (cycle: string | undefined, geo: Geo = {}) =>
  useQuery({
    queryKey: ["finance", "overview", cycle, geo],
    queryFn: () => api("get", "/finance/overview", { query: { cycle, ...geo } }),
    enabled: Boolean(cycle),
    placeholderData: keepPreviousData,
  })

export const useAccount = (
  type: AccountType | null,
  id: string | null,
  cycle: string | undefined,
) =>
  useQuery({
    queryKey: ["finance", "account", type, id, cycle],
    queryFn: () =>
      api("get", "/finance/accounts/{type}/{id}", {
        params: { type: type!, id: id! },
        query: { cycle },
      }),
    enabled: Boolean(type && id && cycle),
  })

export const usePayouts = (q: {
  cycle?: string | undefined
  accountType?: AccountType | undefined
  status?: PayoutDisplayStatus | undefined
  state?: string | undefined
  district?: string | undefined
}) =>
  useQuery({
    queryKey: ["finance", "payouts", q],
    queryFn: () => api("get", "/finance/payouts", { query: q }),
    placeholderData: keepPreviousData,
  })

export const usePayout = (id: string | null) =>
  useQuery({
    queryKey: ["finance", "payout", id],
    queryFn: () => api("get", "/finance/payouts/{id}", { params: { id: id! } }),
    enabled: Boolean(id),
  })

export const usePayRequests = () =>
  useQuery({ queryKey: ["finance", "requests"], queryFn: () => api("get", "/finance/requests") })
export const useMovements = () =>
  useQuery({ queryKey: ["finance", "movements"], queryFn: () => api("get", "/finance/movements") })
export const useReconciliation = (range: { from?: string; to?: string }) =>
  useQuery({
    queryKey: ["finance", "reconciliation", range],
    queryFn: () => api("get", "/finance/reconciliation", { query: range }),
    placeholderData: keepPreviousData,
  })
export const useFinanceReport = (period: ReportPeriod, geo: Geo = {}) =>
  useQuery({
    queryKey: ["finance", "report", period, geo],
    queryFn: () => api("get", "/finance/report", { query: { period, ...geo } }),
    placeholderData: keepPreviousData,
  })
export const useFinanceAudit = () =>
  useQuery({ queryKey: ["finance", "audit"], queryFn: () => api("get", "/finance/audit") })

type FinanceAction =
  | { kind: "generate"; cycle: string }
  | { kind: "approve"; id: string; version: number }
  | { kind: "reject"; id: string; version: number; reason: string }
  | { kind: "pay"; id: string; version: number; reference: string; method: string }
  | { kind: "recalculate"; id: string; version: number }
  | {
      kind: "remit"
      partnerId: string
      cycle: string
      amountPaise: number
      method: "Cash deposit" | "UPI to GloAro" | "Bank transfer"
    }
  | {
      kind: "adjust"
      accountType: AccountType
      accountId: string
      bonus: boolean
      amountPaise: number
      reason: string
    }
  | {
      kind: "plan"
      accountType: AccountType
      accountId: string
      plan: PartnerPlan | AdminPlan
      reason: string
    }
  | { kind: "approveRequest" | "rejectRequest"; id: string; reason?: string }

/** Every finance write goes through here; afterwards all finance data is refetched. */
export function useFinanceAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (a: FinanceAction) => {
      switch (a.kind) {
        case "generate":
          await api("post", "/finance/payouts/generate", { body: { cycle: a.cycle } })
          return
        case "approve":
          await api("post", "/finance/payouts/{id}/approve", {
            params: { id: a.id },
            body: { version: a.version },
          })
          return
        case "reject":
          await api("post", "/finance/payouts/{id}/reject", {
            params: { id: a.id },
            body: { version: a.version, reason: a.reason },
          })
          return
        case "pay":
          await api("post", "/finance/payouts/{id}/pay", {
            params: { id: a.id },
            body: { version: a.version, reference: a.reference, method: a.method },
          })
          return
        case "recalculate":
          await api("post", "/finance/payouts/{id}/recalculate", {
            params: { id: a.id },
            body: { version: a.version },
          })
          return
        case "remit":
          await api("post", "/finance/remittances", {
            body: {
              partnerId: a.partnerId,
              cycle: a.cycle,
              amountPaise: a.amountPaise,
              method: a.method,
            },
          })
          return
        case "adjust":
          await api("post", "/finance/adjustments", {
            body: {
              accountType: a.accountType,
              accountId: a.accountId,
              kind: a.bonus ? "bonus" : "deduction",
              amountPaise: a.amountPaise,
              reason: a.reason,
            },
          })
          return
        case "plan":
          await api("put", "/finance/plans/{type}/{id}", {
            params: { type: a.accountType, id: a.accountId },
            body: { plan: a.plan, reason: a.reason },
          })
          return
        default:
          await api(
            "post",
            a.kind === "approveRequest"
              ? "/finance/requests/{id}/approve"
              : "/finance/requests/{id}/reject",
            {
              params: { id: a.id },
              body: a.reason ? { reason: a.reason } : {},
            },
          )
      }
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["finance"] })
      void client.invalidateQueries({ queryKey: ["ledger"] })
    },
  })
}

// ---------- ledger ----------

export type LedgerFilters = {
  range: DashboardRange
  business?: Business | undefined
  type?: LedgerType | undefined
  method?: LedgerMethod | undefined
  search?: string | undefined
  page: number
  pageSize: number
}

export const useLedgerSummary = (range: DashboardRange, business?: Business) =>
  useQuery({
    queryKey: ["ledger", "summary", range, business],
    queryFn: () => api("get", "/ledger/summary", { query: { range, business } }),
    placeholderData: keepPreviousData,
  })

export const useLedger = (q: LedgerFilters) =>
  useQuery({
    queryKey: ["ledger", "list", q],
    queryFn: () => api("get", "/ledger/transactions", { query: q }),
    placeholderData: keepPreviousData,
  })

// ---------- reports ----------

export const useAnalytics = (period: ReportPeriod, geo: Geo = {}) =>
  useQuery({
    queryKey: ["reports", "analytics", period, geo],
    queryFn: () => api("get", "/reports/analytics", { query: { period, ...geo } }),
    placeholderData: keepPreviousData,
  })

/** ₹12,480 with a proper minus sign; whole rupees, as in the prototype. */
export const inr = (paise: number) =>
  `${paise < 0 ? "−" : ""}₹${Math.abs(Math.round(paise / 100)).toLocaleString("en-IN")}`

export const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(iso.length === 10 && { timeZone: "UTC" }),
      })
    : "—"
export const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
