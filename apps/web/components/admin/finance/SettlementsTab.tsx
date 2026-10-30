"use client"
import { financeGet, financePost } from "@/lib/finance-api"
import { inr } from "@/lib/format"
import type { SettlementsData } from "@/types/finance"
import {
  ErrorNote,
  Kpi,
  Loading,
  Panel,
  useAction,
  useFinanceData,
  type FinanceTabProps,
} from "./shared"

export default function SettlementsTab({
  workspaceId,
  cycle,
  version,
  onChanged,
  goTo,
}: FinanceTabProps & { goTo: (tab: string) => void }) {
  const { data, loading, error } = useFinanceData(
    () => financeGet<SettlementsData>(workspaceId, "settlements", { cycle }),
    [workspaceId, cycle, version],
  )
  const action = useAction(onChanged)

  if (!data) {
    return (
      <>
        <ErrorNote message={error} />
        <Loading loading={loading} empty="No data." />
      </>
    )
  }

  const { kpis, profit, remittance } = data
  const pendingPayout = kpis.pendingPayout

  return (
    <>
      <ErrorNote message={error ?? action.error} />
      <div className="fin-kpis">
        <Kpi
          label="Customer collections"
          value={inr(kpis.collections)}
          caption="Cash collected by partners"
        />
        <Kpi
          label="Remitted to GloAro"
          value={inr(kpis.remitted)}
          caption={`${kpis.remittedPercent}% of collections`}
        />
        <Kpi
          label="Pending remittance"
          value={inr(kpis.pendingRemittance)}
          caption={`${kpis.partnersHoldingCash} partners hold unremitted cash`}
          tone="warn"
        />
        <Kpi
          label="Partner earnings"
          value={inr(kpis.partnerEarnings)}
          caption={`${kpis.partnerAccounts} partner accounts`}
        />
        <Kpi
          label="Admin salaries & incentives"
          value={inr(kpis.adminEarnings)}
          caption={`${kpis.adminAccounts} admin accounts`}
        />
        <Kpi label="Bonuses" value={inr(kpis.bonuses)} caption="Partners + admins" />
        <Kpi label="Deductions" value={inr(-kpis.deductions)} caption="Partners + admins" />
        <Kpi
          label="Pending payout balance"
          value={pendingPayout === null ? "Not generated" : inr(pendingPayout)}
          caption={
            pendingPayout === null ? "Generate payouts to track" : "Awaiting approval or payment"
          }
        />
        <Kpi
          label="Platform revenue"
          value={inr(kpis.platformRevenue)}
          caption="Delivery fees + order commission"
        />
        <Kpi
          label="GloAro net profit"
          value={inr(kpis.netProfit)}
          caption={`${kpis.marginPercent}% margin`}
          tone="good"
        />
      </div>

      <div className="fin-two">
        <Panel title="How GloAro's net profit is calculated" subtitle={data.rangeLabel}>
          <ul className="fin-lines">
            <li>
              <span>Delivery fees</span>
              <b>{inr(profit.deliveryFees)}</b>
            </li>
            <li>
              <span>Order commission</span>
              <b>{inr(profit.orderCommission)}</b>
            </li>
            <li className="fin-line-strong">
              <span>Platform revenue</span>
              <b>{inr(profit.platformRevenue)}</b>
            </li>
            <li>
              <span>Less: delivery partner earnings</span>
              <b className="fin-neg">{inr(-profit.partnerEarnings)}</b>
            </li>
            <li>
              <span>Less: admin salaries & incentives</span>
              <b className="fin-neg">{inr(-profit.adminEarnings)}</b>
            </li>
            <li className="fin-line-total">
              <span>GloAro net profit</span>
              <b>{inr(profit.netProfit)}</b>
            </li>
          </ul>
        </Panel>

        <Panel
          title="Cash remittance position"
          subtitle="Partner cash is a separate account from partner earnings"
        >
          <ul className="fin-lines">
            <li>
              <span>Cash collected from customers</span>
              <b>{inr(remittance.collected)}</b>
            </li>
            <li>
              <span>Less: remitted to GloAro</span>
              <b className="fin-neg">{inr(-remittance.remitted)}</b>
            </li>
            <li className="fin-line-total">
              <span>Still owed by partners</span>
              <b>{inr(remittance.owed)}</b>
            </li>
          </ul>
          <div className="fin-callout">
            <div>
              <b>{data.payoutsGenerated ? "Payouts generated" : "No payouts generated yet"}</b>
              <p>
                {data.payoutsGenerated
                  ? "Review and approve them in Approvals, then track them in Payment tracking."
                  : "Freeze this cycle's amounts and send them for approval."}
              </p>
            </div>
            {data.payoutsGenerated ? (
              <button type="button" className="admin-action-btn" onClick={() => goTo("Approvals")}>
                Open approvals
              </button>
            ) : (
              <button
                type="button"
                className="admin-action-btn admin-action-primary"
                disabled={action.busy}
                onClick={() =>
                  void action.run(() =>
                    financePost(workspaceId, "payouts/generate", { cycle: data.cycle.key }),
                  )
                }
              >
                {action.busy ? "Generating…" : "Generate payouts"}
              </button>
            )}
          </div>
        </Panel>
      </div>
    </>
  )
}
