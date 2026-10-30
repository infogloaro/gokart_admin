"use client"
import { useState } from "react"
import type { DateRangeInput } from "@/types/dashboard"
import type { TransactionTypeFilter } from "@/types/ledger"
import RevenuePage from "../RevenuePage"
import TransactionLedger from "../TransactionLedger"

const SUB_TABS: Array<{
  label: string
  revenue?: "zoauro-food" | "gloaro-mart"
  type?: TransactionTypeFilter
}> = [
  { label: "Food Revenue", revenue: "zoauro-food" },
  { label: "Mart Revenue", revenue: "gloaro-mart" },
  { label: "Transactions" },
  { label: "Refunds", type: "REFUND" },
  { label: "Vendor Settlements", type: "VENDOR_SETTLEMENT" },
  { label: "Partner Earnings", type: "PARTNER_EARNINGS" },
  { label: "Payout History", type: "PAYOUT_HISTORY" },
  { label: "Credit Notes", type: "CREDIT_NOTE" },
]

export default function PlatformRevenueTab({
  workspaceId,
  dateRange,
  refreshKey,
}: {
  workspaceId: string
  dateRange: DateRangeInput
  refreshKey: string | null
}) {
  const [active, setActive] = useState(SUB_TABS[0]!.label)
  const tab = SUB_TABS.find((item) => item.label === active) ?? SUB_TABS[0]!

  return (
    <>
      <div className="fin-callout fin-restricted">
        <div>
          <b>Restricted financial view</b>
          <p>Gross sales are never presented as platform profit.</p>
        </div>
        <span className="fin-pill fin-pill-good">Authorized</span>
      </div>
      <div className="fin-subtabs" role="tablist">
        {SUB_TABS.map((item) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={item.label === active}
            className={item.label === active ? "active" : ""}
            onClick={() => setActive(item.label)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab.revenue ? (
        <RevenuePage
          key={tab.revenue}
          workspaceId={workspaceId}
          businessSlug={tab.revenue}
          dateRange={dateRange}
          refreshKey={refreshKey}
        />
      ) : (
        <TransactionLedger
          key={tab.label}
          workspaceId={workspaceId}
          dateRange={dateRange}
          lockedType={tab.type}
        />
      )}
    </>
  )
}
