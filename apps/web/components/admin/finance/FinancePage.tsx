"use client"
import { useCallback, useEffect, useState } from "react"
import { financeGet } from "@/lib/finance-api"
import type { DateRangeInput } from "@/types/dashboard"
import type { ApprovalsData, FinanceCycle } from "@/types/finance"
import ApprovalsTab from "./ApprovalsTab"
import CollectionsTab from "./CollectionsTab"
import { FinanceReportsTab, PaymentTrackingTab } from "./PaymentsReportsTabs"
import { AdminPayoutsTab, PartnerPayoutsTab } from "./PayoutTabs"
import PlatformRevenueTab from "./PlatformRevenueTab"
import SettlementsTab from "./SettlementsTab"

const TABS = [
  "Settlements",
  "Customer collections",
  "Partner payouts",
  "Admin payouts",
  "Payment tracking",
  "Reports",
  "Approvals",
  "Platform revenue",
] as const

type Tab = (typeof TABS)[number]

export default function FinancePage({
  workspaceId,
  dateRange,
  refreshKey,
}: {
  workspaceId: string
  dateRange: DateRangeInput
  refreshKey: string | null
}) {
  const [tab, setTab] = useState<Tab>("Settlements")
  const [cycles, setCycles] = useState<FinanceCycle[]>([])
  const [cycle, setCycle] = useState<string | undefined>(undefined)
  const [version, setVersion] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const onChanged = useCallback(() => setVersion((value) => value + 1), [])

  useEffect(() => {
    if (refreshKey) onChanged()
  }, [refreshKey, onChanged])

  useEffect(() => {
    let cancelled = false
    financeGet<{ cycles: FinanceCycle[] }>(workspaceId, "cycles")
      .then((result) => {
        if (cancelled) return
        setCycles(result.cycles)
        setCycle((current) => current ?? result.cycles[0]?.key)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Unable to load cycles.")
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  useEffect(() => {
    let cancelled = false
    financeGet<ApprovalsData>(workspaceId, "approvals")
      .then((result) => {
        if (!cancelled) setPendingCount(result.pendingCount)
      })
      .catch(() => {
        if (!cancelled) setPendingCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, version])

  const shared = { workspaceId, cycle, version, onChanged }
  const hasCycle =
    tab !== "Payment tracking" &&
    tab !== "Reports" &&
    tab !== "Approvals" &&
    tab !== "Platform revenue"

  return (
    <>
      {loadError && <div className="revenue-error">⚠ {loadError}</div>}
      <div className="fin-approver">
        <span className="fin-approver-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6ZM9 12l2 2 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <b>Finance approver · Arjun Menon (Super Admin)</b>
          <p>
            Only authorized Super Admins can approve payouts or change salary and commission
            settings. Every action is written to the audit trail.
          </p>
        </div>
        {hasCycle && cycles.length > 0 && (
          <div className="fin-cycle">
            <select
              aria-label="Payout cycle"
              value={cycle ?? ""}
              onChange={(event) => setCycle(event.target.value)}
            >
              {cycles.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                  {item.open ? " (open)" : ""}
                </option>
              ))}
            </select>
            <button type="button" aria-label="Reload cycle" onClick={onChanged}>
              ↻
            </button>
          </div>
        )}
      </div>

      <div className="fin-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === tab}
            className={item === tab ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item === "Approvals" && pendingCount > 0 ? `Approvals (${pendingCount})` : item}
          </button>
        ))}
      </div>

      {tab === "Settlements" && <SettlementsTab {...shared} goTo={(next) => setTab(next as Tab)} />}
      {tab === "Customer collections" && <CollectionsTab {...shared} />}
      {tab === "Partner payouts" && <PartnerPayoutsTab {...shared} />}
      {tab === "Admin payouts" && <AdminPayoutsTab {...shared} />}
      {tab === "Payment tracking" && <PaymentTrackingTab {...shared} />}
      {tab === "Reports" && <FinanceReportsTab {...shared} />}
      {tab === "Approvals" && <ApprovalsTab {...shared} />}
      {tab === "Platform revenue" && (
        <PlatformRevenueTab
          workspaceId={workspaceId}
          dateRange={dateRange}
          refreshKey={refreshKey}
        />
      )}
    </>
  )
}
