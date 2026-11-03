"use client"
// Finance & payouts (Super Admin), ported from the prototype's FinancePayouts screen and
// running on /finance/*: statements come from daily accruals of real deliveries, payouts are
// frozen at generation, and every action is version-checked and written to the audit trail.
import { ApiError } from "@zoauro/api-client"
import {
  type AccountType,
  type AdminAccount,
  type AdminPlan,
  type PartnerAccount,
  type PartnerPlan,
  type PayoutDisplayStatus,
  type PayoutLine,
  type PayoutSummary,
  type ReportPeriod,
  type Statement,
} from "@zoauro/shared"
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Bike,
  CalendarClock,
  Check,
  ClipboardCheck,
  Download,
  HandCoins,
  History,
  Info,
  Landmark,
  Pencil,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from "lucide-react"
import { useMemo, useState } from "react"
import { download } from "@/lib/motion"
import {
  fmtDate,
  fmtStamp,
  inr,
  useAccount,
  useCycles,
  useFinanceAction,
  useFinanceAudit,
  useFinanceOverview,
  type Geo,
  useFinanceReport,
  useMovements,
  usePayout,
  usePayouts,
  usePayRequests,
} from "@/lib/finance"
import { useMe } from "@/lib/session"
import { GeoFilter } from "./geo-filter"
import { TransactionLedger } from "./ledger"
import {
  Badge,
  Button,
  Drawer,
  ErrorBox,
  IconButton,
  Input,
  Modal,
  Panel,
  Select,
  Tabs,
  Toast,
  type ToastMessage,
} from "./ui"

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

const statusLabel: Record<PayoutDisplayStatus | "none", string> = {
  pending_approval: "Pending approval",
  approved: "Approved",
  overdue: "Overdue",
  paid: "Paid",
  settled: "Settled",
  rejected: "Rejected",
  none: "Not generated",
}
const statusTone: Record<PayoutDisplayStatus | "none", string> = {
  pending_approval: "warning",
  approved: "neutral",
  overdue: "danger",
  paid: "info",
  settled: "success",
  rejected: "danger",
  none: "neutral",
}

const partnerPlanText = (p: PartnerPlan) =>
  [
    p.salaryPaise && `${inr(p.salaryPaise)}/mo salary`,
    p.fixedPaise && `${inr(p.fixedPaise)}/mo fixed`,
    p.perDeliveryPaise && `${inr(p.perDeliveryPaise)}/delivery`,
    p.commissionPct && `${p.commissionPct}% of fees`,
  ]
    .filter(Boolean)
    .join(" + ") || "No pay configured"
const adminPlanText = (p: AdminPlan) =>
  `${inr(p.salaryPaise)}/mo + ${p.commissionPct}% commission + ${inr(p.incentivePaise)} at ≥${p.targetOnTimePct}% on-time`
const planText = (type: AccountType, p: PartnerPlan | AdminPlan) =>
  type === "partner" ? partnerPlanText(p as PartnerPlan) : adminPlanText(p as AdminPlan)

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0)
const message = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Try again."

function csvDownload(name: string, rows: (string | number)[][]) {
  const cell = (v: string | number) =>
    /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
  download(name, rows.map((r) => r.map(cell).join(",")).join("\n"))
}

type Dialog =
  | { kind: "config" | "adjust" | "account"; type: AccountType; id: string }
  | { kind: "remit"; id: string }
  | { kind: "pay" | "reject" | "payout"; id: string }
  | { kind: "rejectRequest"; id: string }
  | { kind: "generate" }

export function FinancePayouts() {
  const me = useMe()
  const cycles = useCycles()
  const [tab, setTab] = useState<Tab>("Settlements")
  const [picked, setPicked] = useState<string | undefined>()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const cycle = picked ?? cycles.data?.at(-1)?.cycle
  const info = cycles.data?.find((c) => c.cycle === cycle)
  const [geo, setGeo] = useState<Geo>({})
  const overview = useFinanceOverview(cycle, geo)
  const payouts = usePayouts(geo)
  const requests = usePayRequests()
  const act = useFinanceAction()
  const can = (p: string) => Boolean(me.data?.permissions.includes(p as never))

  const ov = overview.data
  const partners = ov?.partners ?? []
  const admins = ov?.admins ?? []
  const pendingApproval = (payouts.data ?? []).filter((p) => p.status === "pending_approval")
  const pendingRequests = (requests.data ?? []).filter((r) => r.status === "pending")
  const waiting = pendingApproval.length + pendingRequests.length
  const accountName = (type: AccountType, id: string) =>
    (type === "partner" ? partners : admins).find((a) => a.id === id)?.name ?? "Account"

  /** Runs a finance action, closes the dialog and shows the prototype's toast. */
  const run = (a: Parameters<typeof act.mutate>[0], done: string) =>
    act.mutate(a, {
      onSuccess: () => {
        setDialog(null)
        setToast({ tone: "success", title: "Done", message: done })
      },
      onError: (e) => setToast({ tone: "error", title: "Not saved", message: message(e) }),
    })

  return (
    <>
      <div className="context fp-context">
        <ShieldCheck />
        <span>
          <b>Finance approver · {me.data?.name} (Super Admin)</b>
          Only authorized Super Admins can approve payouts or change salary and commission settings.
          Every action is written to the audit trail.
        </span>
        <Select value={cycle ?? ""} onChange={setPicked} label="Pay cycle">
          {(cycles.data ?? []).map((c) => (
            <option value={c.cycle} key={c.cycle}>
              {c.label}
              {c.closed ? "" : " (open)"}
            </option>
          ))}
        </Select>
        <GeoFilter value={geo} onChange={setGeo} />
        <IconButton
          icon={RotateCcw}
          label="Refresh finance data"
          onClick={() => void overview.refetch()}
        />
      </div>
      <Tabs
        items={TABS.map((t) =>
          t === "Approvals" && waiting ? (`Approvals (${waiting})` as Tab) : t,
        )}
        value={tab === "Approvals" && waiting ? (`Approvals (${waiting})` as Tab) : tab}
        onChange={(v) => setTab(v.replace(/ \(\d+\)$/, "") as Tab)}
      />
      {overview.isError && <ErrorBox icon={XCircle}>{message(overview.error)}</ErrorBox>}

      {tab === "Settlements" && ov && info && (
        <Settlements
          label={info.label}
          closed={info.closed}
          today={ov.today}
          partners={partners}
          admins={admins}
          payouts={(payouts.data ?? []).filter((p) => p.cycle === cycle && p.status !== "rejected")}
          canGenerate={can("finance.approve")}
          generate={() => setDialog({ kind: "generate" })}
          goTracking={() => setTab("Payment tracking")}
        />
      )}

      {tab === "Customer collections" && info && (
        <Panel
          title={`Customer collections · ${info.label}`}
          subtitle="Cash collected from customers by each delivery partner and the amount still to be remitted to GloAro"
        >
          <div className="table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Partner account</th>
                  <th>Business</th>
                  <th>Managed by</th>
                  <th className="num">Deliveries</th>
                  <th className="num">Cash collected</th>
                  <th className="num">Remitted</th>
                  <th className="num">To remit to GloAro</th>
                  <th>Last remittance</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => {
                  const st = p.statement
                  const status =
                    st.outstandingPaise <= 0 ? "Remitted" : info.closed ? "Overdue" : "Pending"
                  return (
                    <tr key={p.id}>
                      <td>
                        <Who name={p.name} sub={`${p.code} · ${p.bank}`} />
                      </td>
                      <td>
                        <Badge tone={p.business}>{p.business.toUpperCase()}</Badge>
                      </td>
                      <td>{p.managerName ?? "—"}</td>
                      <td className="num">{st.deliveries}</td>
                      <td className="num">{inr(st.codPaise)}</td>
                      <td className="num">{inr(st.remittedPaise)}</td>
                      <td className="num">
                        <strong className={st.outstandingPaise > 0 ? "fp-owed" : ""}>
                          {inr(st.outstandingPaise)}
                        </strong>
                      </td>
                      <td>
                        {p.lastRemittance
                          ? `${fmtDate(p.lastRemittance.day)} · ${p.lastRemittance.method}`
                          : "—"}
                      </td>
                      <td>
                        <Badge
                          tone={
                            status === "Remitted"
                              ? "success"
                              : status === "Overdue"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {status}
                        </Badge>
                      </td>
                      <td className="fp-actions">
                        <IconButton
                          icon={History}
                          label="Account history"
                          onClick={() => setDialog({ kind: "account", type: "partner", id: p.id })}
                        />
                        {st.outstandingPaise > 0 && can("finance.manage_plans") && (
                          <Button
                            icon={HandCoins}
                            onClick={() => setDialog({ kind: "remit", id: p.id })}
                          >
                            Record remittance
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total · {partners.length} partners</td>
                  <td className="num">{sum(partners, (r) => r.statement.deliveries)}</td>
                  <td className="num">{inr(sum(partners, (r) => r.statement.codPaise))}</td>
                  <td className="num">{inr(sum(partners, (r) => r.statement.remittedPaise))}</td>
                  <td className="num">{inr(sum(partners, (r) => r.statement.outstandingPaise))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}

      {tab === "Partner payouts" && info && (
        <Panel
          title={`Delivery partner earnings · ${info.label}`}
          subtitle="Separate partner ledger · earnings are recalculated from daily activity and the pay plan in effect each day"
        >
          <div className="table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Partner account</th>
                  <th>Pay plan</th>
                  <th className="num">Deliveries</th>
                  <th className="num">Salary</th>
                  <th className="num">Fixed</th>
                  <th className="num">Per-delivery</th>
                  <th className="num">Commission</th>
                  <th className="num">Bonus</th>
                  <th className="num">Deductions</th>
                  <th className="num">Earnings</th>
                  <th>Payout</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Who name={p.name} sub={`${p.code} · ${p.bank}`} />
                    </td>
                    <td className="fp-plan">{partnerPlanText(p.plan)}</td>
                    <td className="num">{p.statement.deliveries}</td>
                    <td className="num">{inr(p.statement.salaryPaise)}</td>
                    <td className="num">{inr(p.statement.fixedPaise)}</td>
                    <td className="num">{inr(p.statement.incentivePaise)}</td>
                    <td className="num">{inr(p.statement.commissionPaise)}</td>
                    <td className="num">{inr(p.statement.bonusPaise)}</td>
                    <td className="num">{inr(-p.statement.deductionPaise)}</td>
                    <td className="num">
                      <strong>{inr(p.statement.totalPaise)}</strong>
                    </td>
                    <td>
                      <PayoutBadge payout={p.payout} />
                    </td>
                    <td className="fp-actions">
                      <AccountActions
                        type="partner"
                        id={p.id}
                        open={setDialog}
                        canManage={can("finance.manage_plans")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total · partner ledger</td>
                  <td className="num">{sum(partners, (r) => r.statement.deliveries)}</td>
                  <td className="num">{inr(sum(partners, (r) => r.statement.salaryPaise))}</td>
                  <td className="num">{inr(sum(partners, (r) => r.statement.fixedPaise))}</td>
                  <td className="num">{inr(sum(partners, (r) => r.statement.incentivePaise))}</td>
                  <td className="num">{inr(sum(partners, (r) => r.statement.commissionPaise))}</td>
                  <td className="num">{inr(sum(partners, (r) => r.statement.bonusPaise))}</td>
                  <td className="num">{inr(-sum(partners, (r) => r.statement.deductionPaise))}</td>
                  <td className="num">{inr(sum(partners, (r) => r.statement.totalPaise))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}

      {tab === "Admin payouts" && info && (
        <Panel
          title={`Admin salaries & incentives · ${info.label}`}
          subtitle="Separate admin ledger · pay for the Admins who manage and monitor delivery partners"
        >
          <div className="table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Admin account</th>
                  <th>Pay plan</th>
                  <th className="num">Partners</th>
                  <th className="num">On-time</th>
                  <th className="num">Salary</th>
                  <th className="num">Commission</th>
                  <th className="num">Incentive</th>
                  <th className="num">Bonus</th>
                  <th className="num">Deductions</th>
                  <th className="num">Earnings</th>
                  <th>Payout</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Who name={a.name} sub={`${a.region} · ${a.bank}`} />
                    </td>
                    <td className="fp-plan">{adminPlanText(a.plan)}</td>
                    <td className="num">{a.statement.managedPartners}</td>
                    <td className="num">{(a.statement.onTimeRate * 100).toFixed(1)}%</td>
                    <td className="num">{inr(a.statement.salaryPaise)}</td>
                    <td className="num">{inr(a.statement.commissionPaise)}</td>
                    <td className="num">
                      {info.closed ? inr(a.statement.incentivePaise) : "At close"}
                    </td>
                    <td className="num">{inr(a.statement.bonusPaise)}</td>
                    <td className="num">{inr(-a.statement.deductionPaise)}</td>
                    <td className="num">
                      <strong>{inr(a.statement.totalPaise)}</strong>
                    </td>
                    <td>
                      <PayoutBadge payout={a.payout} />
                    </td>
                    <td className="fp-actions">
                      <AccountActions
                        type="admin"
                        id={a.id}
                        open={setDialog}
                        canManage={can("finance.manage_plans")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total · admin ledger</td>
                  <td className="num">{inr(sum(admins, (r) => r.statement.salaryPaise))}</td>
                  <td className="num">{inr(sum(admins, (r) => r.statement.commissionPaise))}</td>
                  <td className="num">{inr(sum(admins, (r) => r.statement.incentivePaise))}</td>
                  <td className="num">{inr(sum(admins, (r) => r.statement.bonusPaise))}</td>
                  <td className="num">{inr(-sum(admins, (r) => r.statement.deductionPaise))}</td>
                  <td className="num">{inr(sum(admins, (r) => r.statement.totalPaise))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}

      {tab === "Payment tracking" && (
        <PaymentTracking
          cycles={cycles.data ?? []}
          canApprove={can("finance.approve")}
          open={(id) => setDialog({ kind: "payout", id })}
          approve={(p) =>
            run({ kind: "approve", id: p.id, version: p.version }, `${p.code} approved.`)
          }
          reject={(id) => setDialog({ kind: "reject", id })}
          pay={(id) => setDialog({ kind: "pay", id })}
          recalculate={(p) =>
            run(
              { kind: "recalculate", id: p.id, version: p.version },
              "Payout recalculated and sent for approval.",
            )
          }
        />
      )}

      {tab === "Reports" && <Reports geo={geo} />}

      {tab === "Approvals" && (
        <div className="fp-stack">
          <Panel
            title="Payouts awaiting approval"
            subtitle={`${pendingApproval.length} payouts · ${inr(sum(pendingApproval, (p) => p.amountPaise))}`}
          >
            {pendingApproval.length === 0 ? (
              <Empty text="No payouts are waiting for approval." />
            ) : (
              <div className="fp-approvals">
                {pendingApproval.map((p) => (
                  <div key={p.id}>
                    <span>
                      <Badge tone={p.accountType === "partner" ? "info" : "gold"}>
                        {p.accountType === "partner" ? "PARTNER" : "ADMIN"}
                      </Badge>
                      <strong>{p.accountName}</strong>
                      <small>
                        {p.code} · {p.cycle} · due {fmtDate(p.dueDate)}
                      </small>
                    </span>
                    <b>{inr(p.amountPaise)}</b>
                    <Button onClick={() => setDialog({ kind: "payout", id: p.id })}>Review</Button>
                    {can("finance.approve") && (
                      <>
                        <Button danger onClick={() => setDialog({ kind: "reject", id: p.id })}>
                          Reject
                        </Button>
                        <Button
                          success
                          icon={Check}
                          disabled={act.isPending}
                          onClick={() =>
                            run(
                              { kind: "approve", id: p.id, version: p.version },
                              `${p.code} approved.`,
                            )
                          }
                        >
                          Approve
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel
            title="Pay setting change requests"
            subtitle="Admins can propose pay changes for their partners; only a Super Admin can apply them"
          >
            {(requests.data ?? []).length === 0 ? (
              <Empty text="No change requests." />
            ) : (
              <div className="table-wrap">
                <table className="fp-table">
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Account</th>
                      <th>Current plan</th>
                      <th>Proposed plan</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(requests.data ?? []).map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Who name={r.code} sub={`${r.requestedBy} · ${fmtStamp(r.createdAt)}`} />
                        </td>
                        <td>{r.accountName}</td>
                        <td className="fp-plan">
                          {r.currentPlan ? planText(r.accountType, r.currentPlan) : "—"}
                        </td>
                        <td className="fp-plan">
                          <strong>{planText(r.accountType, r.plan)}</strong>
                        </td>
                        <td className="fp-plan">{r.reason}</td>
                        <td>
                          <Badge
                            tone={
                              r.status === "pending"
                                ? "warning"
                                : r.status === "approved"
                                  ? "success"
                                  : "danger"
                            }
                          >
                            {r.status === "pending"
                              ? "Pending"
                              : r.status === "approved"
                                ? "Approved"
                                : "Rejected"}
                          </Badge>
                          {r.decidedBy && <small className="fp-sub">by {r.decidedBy}</small>}
                        </td>
                        <td className="fp-actions">
                          {r.status === "pending" && can("finance.approve") && (
                            <>
                              <Button
                                danger
                                onClick={() => setDialog({ kind: "rejectRequest", id: r.id })}
                              >
                                Reject
                              </Button>
                              <Button
                                success
                                icon={Check}
                                disabled={act.isPending}
                                onClick={() =>
                                  run(
                                    { kind: "approveRequest", id: r.id },
                                    `${r.code} approved. New rates apply from today.`,
                                  )
                                }
                              >
                                Approve
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <AuditTrail />
        </div>
      )}

      {tab === "Platform revenue" && <TransactionLedger withTabs />}

      {dialog?.kind === "account" && cycle && (
        <AccountDrawer
          type={dialog.type}
          id={dialog.id}
          cycle={cycle}
          close={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "config" && (
        <ConfigModal
          type={dialog.type}
          name={accountName(dialog.type, dialog.id)}
          current={
            (dialog.type === "partner" ? partners : admins).find((a) => a.id === dialog.id)?.plan
          }
          today={ov?.today ?? ""}
          busy={act.isPending}
          close={() => setDialog(null)}
          save={(plan, reason) =>
            run(
              { kind: "plan", accountType: dialog.type, accountId: dialog.id, plan, reason },
              "Pay settings saved. New rates apply from today.",
            )
          }
        />
      )}
      {dialog?.kind === "adjust" && cycle && (
        <AdjustModal
          name={accountName(dialog.type, dialog.id)}
          cycleLabel={cycles.data?.at(-1)?.label ?? ""}
          locked={Boolean(
            (payouts.data ?? []).some(
              (p) =>
                p.accountType === dialog.type &&
                p.accountId === dialog.id &&
                p.cycle === cycles.data?.at(-1)?.cycle &&
                p.status !== "rejected",
            ),
          )}
          busy={act.isPending}
          close={() => setDialog(null)}
          save={(bonus, amountPaise, reason) =>
            run(
              {
                kind: "adjust",
                accountType: dialog.type,
                accountId: dialog.id,
                bonus,
                amountPaise,
                reason,
              },
              `${bonus ? "Bonus" : "Deduction"} of ${inr(amountPaise)} recorded.`,
            )
          }
        />
      )}
      {dialog?.kind === "remit" && cycle && info && (
        <RemitModal
          name={accountName("partner", dialog.id)}
          outstanding={partners.find((p) => p.id === dialog.id)?.statement.outstandingPaise ?? 0}
          cycleLabel={info.label}
          busy={act.isPending}
          close={() => setDialog(null)}
          save={(amountPaise, method) =>
            run(
              { kind: "remit", partnerId: dialog.id, cycle, amountPaise, method },
              `Remittance of ${inr(amountPaise)} recorded.`,
            )
          }
        />
      )}
      {dialog?.kind === "pay" && (
        <PayModal
          id={dialog.id}
          busy={act.isPending}
          close={() => setDialog(null)}
          save={(p, method, reference) =>
            run(
              { kind: "pay", id: p.id, version: p.version, method, reference },
              `${p.code} marked as paid.`,
            )
          }
        />
      )}
      {(dialog?.kind === "reject" || dialog?.kind === "rejectRequest") && (
        <RejectModal
          title={dialog.kind === "reject" ? "Reject payout" : "Reject pay change request"}
          busy={act.isPending}
          close={() => setDialog(null)}
          save={(reason) => {
            if (dialog.kind === "rejectRequest")
              return run({ kind: "rejectRequest", id: dialog.id, reason }, "Request rejected.")
            const p = (payouts.data ?? []).find((x) => x.id === dialog.id)
            if (p)
              run({ kind: "reject", id: p.id, version: p.version, reason }, `${p.code} rejected.`)
          }}
        />
      )}
      {dialog?.kind === "payout" && <PayoutModal id={dialog.id} close={() => setDialog(null)} />}
      {dialog?.kind === "generate" && info && (
        <Modal
          title={`Generate payouts · ${info.label}`}
          subtitle="Creates one payout per partner and admin account, each awaiting Super Admin approval"
          close={() => setDialog(null)}
        >
          <div className="modal-body fp-modal-copy">
            {!info.closed && (
              <p className="fp-warn">
                This cycle is still open. Amounts are calculated to {fmtDate(ov?.today)} and
                performance incentives are not included until the cycle closes.
              </p>
            )}
            <p>
              Amounts are frozen at generation with their full calculation, so later rate changes do
              not alter them. Bonuses and deductions for this cycle are locked once its payouts
              exist.
            </p>
          </div>
          <footer>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              primary
              disabled={act.isPending}
              onClick={() =>
                cycle &&
                run({ kind: "generate", cycle }, "Payouts generated and sent for approval.")
              }
            >
              {act.isPending ? "Generating…" : "Generate payouts"}
            </Button>
          </footer>
        </Modal>
      )}
      {toast && <Toast toast={toast} close={() => setToast(null)} />}
    </>
  )
}

function AccountActions({
  type,
  id,
  open,
  canManage,
}: {
  type: AccountType
  id: string
  open: (d: Dialog) => void
  canManage: boolean
}) {
  return (
    <>
      <IconButton
        icon={Info}
        label="Calculation breakdown"
        onClick={() => open({ kind: "account", type, id })}
      />
      {canManage && (
        <>
          <IconButton
            icon={Pencil}
            label="Configure pay"
            onClick={() => open({ kind: "config", type, id })}
          />
          <IconButton
            icon={PlusCircle}
            label="Bonus or deduction"
            onClick={() => open({ kind: "adjust", type, id })}
          />
        </>
      )}
    </>
  )
}

function Who({ name, sub }: { name: string; sub: string }) {
  return (
    <span className="fp-who">
      <strong>{name}</strong>
      <small>{sub}</small>
    </span>
  )
}
function Empty({ text }: { text: string }) {
  return (
    <div className="fp-empty">
      <BadgeCheck size={22} />
      {text}
    </div>
  )
}
function PayoutBadge({ payout }: { payout: PayoutSummary | null }) {
  const s = payout ? payout.displayStatus : "none"
  return <Badge tone={statusTone[s]}>{statusLabel[s]}</Badge>
}
function Row({
  label,
  value,
  strong,
  total,
}: {
  label: string
  value: number
  strong?: boolean
  total?: boolean
}) {
  return (
    <div className={`${strong ? "strong" : ""} ${total ? "total" : ""}`}>
      <span>{label}</span>
      <b className={value < 0 ? "neg" : ""}>{inr(value)}</b>
    </div>
  )
}

function Settlements({
  label,
  closed,
  today,
  partners,
  admins,
  payouts,
  canGenerate,
  generate,
  goTracking,
}: {
  label: string
  closed: boolean
  today: string
  partners: PartnerAccount[]
  admins: AdminAccount[]
  payouts: PayoutSummary[]
  canGenerate: boolean
  generate: () => void
  goTracking: () => void
}) {
  const st = (rows: { statement: Statement }[], f: (s: Statement) => number) =>
    sum(rows, (r) => f(r.statement))
  const cod = st(partners, (s) => s.codPaise),
    remitted = st(partners, (s) => s.remittedPaise),
    outstanding = st(partners, (s) => s.outstandingPaise),
    fees = st(partners, (s) => s.feesPaise),
    revenue = st(partners, (s) => s.revenuePaise),
    partnerPay = st(partners, (s) => s.totalPaise),
    adminPay = st(admins, (s) => s.totalPaise),
    bonus = st(partners, (s) => s.bonusPaise) + st(admins, (s) => s.bonusPaise),
    deduction = st(partners, (s) => s.deductionPaise) + st(admins, (s) => s.deductionPaise),
    net = revenue - partnerPay - adminPay
  const unpaid = payouts.filter((p) => p.status === "pending_approval" || p.status === "approved")
  const owing = partners.filter((p) => p.statement.outstandingPaise > 0).length
  const kpis: [string, string, string, string?][] = [
    ["Customer collections", inr(cod), "Cash collected by partners"],
    [
      "Remitted to GloAro",
      inr(remitted),
      `${cod ? ((remitted / cod) * 100).toFixed(1) : "0"}% of collections`,
    ],
    [
      "Pending remittance",
      inr(outstanding),
      `${owing} partners hold unremitted cash`,
      outstanding > 0 ? "warn" : "",
    ],
    ["Partner earnings", inr(partnerPay), `${partners.length} partner accounts`],
    ["Admin salaries & incentives", inr(adminPay), `${admins.length} admin accounts`],
    ["Bonuses", inr(bonus), "Partners + admins"],
    ["Deductions", inr(-deduction), "Partners + admins"],
    [
      "Pending payout balance",
      payouts.length ? inr(sum(unpaid, (p) => p.amountPaise)) : "Not generated",
      payouts.length ? `${unpaid.length} payouts unpaid` : "Generate payouts to track",
      unpaid.length ? "warn" : "",
    ],
    ["Platform revenue", inr(revenue), "Delivery fees + order commission"],
    [
      "GloAro net profit",
      inr(net),
      `${revenue ? ((net / revenue) * 100).toFixed(1) : "0"}% margin`,
      net < 0 ? "bad" : "good",
    ],
  ]
  return (
    <>
      <div className="fp-kpis">
        {kpis.map(([k, value, note, tone]) => (
          <div className={`metric ${tone ?? ""}`} key={k}>
            <span>{k}</span>
            <strong>{value}</strong>
            <em>{note}</em>
          </div>
        ))}
      </div>
      <div className="fp-split">
        <Panel
          title="How GloAro's net profit is calculated"
          subtitle={`${label}${closed ? "" : ` · to ${fmtDate(today)}`}`}
        >
          <div className="fp-equation">
            <Row label="Delivery fees" value={fees} />
            <Row label="Order commission" value={revenue - fees} />
            <Row label="Platform revenue" value={revenue} strong />
            <Row label="Less: delivery partner earnings" value={-partnerPay} />
            <Row label="Less: admin salaries & incentives" value={-adminPay} />
            <Row label="GloAro net profit" value={net} strong total />
          </div>
        </Panel>
        <Panel
          title="Cash remittance position"
          subtitle="Partner cash is a separate account from partner earnings"
        >
          <div className="fp-equation">
            <Row label="Cash collected from customers" value={cod} />
            <Row label="Less: remitted to GloAro" value={-remitted} />
            <Row label="Still owed by partners" value={outstanding} strong total />
          </div>
          <div className="fp-run">
            {payouts.length ? (
              <>
                <CalendarClock size={18} />
                <span>
                  <b>
                    {payouts.length} payouts generated for {label}
                  </b>
                  {unpaid.length} unpaid · due {fmtDate(payouts[0]!.dueDate)}
                </span>
                <Button onClick={goTracking}>Track payments</Button>
              </>
            ) : (
              <>
                <ClipboardCheck size={18} />
                <span>
                  <b>No payouts generated yet</b>
                  Freeze this cycle&apos;s amounts and send them for approval.
                </span>
                {canGenerate && (
                  <Button primary onClick={generate}>
                    Generate payouts
                  </Button>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>
    </>
  )
}

function PaymentTracking({
  cycles,
  canApprove,
  open,
  approve,
  reject,
  pay,
  recalculate,
}: {
  cycles: { cycle: string; label: string }[]
  canApprove: boolean
  open: (id: string) => void
  approve: (p: PayoutSummary) => void
  reject: (id: string) => void
  pay: (id: string) => void
  recalculate: (p: PayoutSummary) => void
}) {
  const [type, setType] = useState<"" | AccountType>("")
  const [status, setStatus] = useState<"" | PayoutDisplayStatus>("")
  const [cycle, setCycle] = useState("")
  const [showAll, setShowAll] = useState(false)
  const all = usePayouts({}).data ?? []
  const movements = useMovements().data ?? []
  const rows = all.filter(
    (p) =>
      (!type || p.accountType === type) &&
      (!status || p.displayStatus === status) &&
      (!cycle || p.cycle === cycle),
  )
  const cycleLabel = (c: string) => cycles.find((x) => x.cycle === c)?.label ?? c
  const groups = (["paid", "pending_approval", "approved", "overdue", "settled"] as const).map(
    (s) => {
      const list = all.filter((p) => p.displayStatus === s)
      return { s, count: list.length, amount: sum(list, (p) => p.amountPaise) }
    },
  )
  const kindLabel = {
    partner_payout: "Payout to delivery partner",
    admin_payout: "Payout to admin",
    cash_remittance: "Cash remitted by partner",
  }
  return (
    <div className="fp-stack">
      <div className="fp-status-cards">
        {groups.map((g) => (
          <button
            type="button"
            className={`${status === g.s ? "active" : ""} ${g.s === "overdue" ? "overdue" : ""}`}
            onClick={() => setStatus(status === g.s ? "" : g.s)}
            aria-pressed={status === g.s}
            key={g.s}
          >
            <Badge tone={statusTone[g.s]}>{statusLabel[g.s]}</Badge>
            <b>{inr(g.amount)}</b>
            <small>{g.count} payouts · all cycles</small>
          </button>
        ))}
      </div>
      <Panel
        title="Payout records"
        subtitle="Partner payouts (PPO) and admin payouts (APO) are kept in separate ledgers"
      >
        <div className="filters fp-filters">
          <Select value={type} onChange={(v) => setType(v as "" | AccountType)}>
            <option value="">All accounts</option>
            <option value="partner">Delivery partners</option>
            <option value="admin">Admins</option>
          </Select>
          <Select value={status} onChange={(v) => setStatus(v as "" | PayoutDisplayStatus)}>
            <option value="">All statuses</option>
            {(Object.keys(statusLabel) as (keyof typeof statusLabel)[])
              .filter((s) => s !== "none")
              .map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
          </Select>
          <Select value={cycle} onChange={setCycle}>
            <option value="">All cycles</option>
            {cycles.map((c) => (
              <option value={c.cycle} key={c.cycle}>
                {c.label}
              </option>
            ))}
          </Select>
          <Button
            icon={Download}
            onClick={() =>
              csvDownload(`gloaro-payouts-${new Date().toISOString().slice(0, 10)}.csv`, [
                [
                  "Payout ID",
                  "Ledger",
                  "Account",
                  "Cycle",
                  "Amount (INR)",
                  "Status",
                  "Generated",
                  "Due",
                  "Approved by",
                  "Approved on",
                  "Paid on",
                  "Payment reference",
                  "Settled on",
                ],
                ...rows.map((p) => [
                  p.code,
                  p.accountType === "partner" ? "Delivery partner" : "Admin",
                  p.accountName,
                  cycleLabel(p.cycle),
                  (p.amountPaise / 100).toFixed(2),
                  statusLabel[p.displayStatus],
                  p.createdAt.slice(0, 10),
                  p.dueDate,
                  p.approvedBy ?? "",
                  p.approvedAt?.slice(0, 10) ?? "",
                  p.paidAt?.slice(0, 10) ?? "",
                  p.paidRef ?? "",
                  p.settledAt?.slice(0, 10) ?? "",
                ]),
              ])
            }
          >
            Export
          </Button>
        </div>
        <div className="table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Payout</th>
                <th>Account</th>
                <th>Cycle</th>
                <th className="num">Amount</th>
                <th>Due</th>
                <th>Status</th>
                <th>Approved</th>
                <th>Paid</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Who name={p.code} sub={`Generated ${fmtDate(p.createdAt)} · ${p.createdBy}`} />
                  </td>
                  <td>
                    <span className="fp-acct">
                      {p.accountType === "partner" ? <Bike size={15} /> : <Users size={15} />}
                      {p.accountName}
                    </span>
                  </td>
                  <td>{cycleLabel(p.cycle)}</td>
                  <td className="num">
                    <strong>{inr(p.amountPaise)}</strong>
                  </td>
                  <td>{fmtDate(p.dueDate)}</td>
                  <td>
                    <Badge tone={statusTone[p.displayStatus]}>{statusLabel[p.displayStatus]}</Badge>
                    {p.displayStatus === "overdue" && (
                      <small className="fp-sub">
                        {p.status === "approved" ? "Approved, unpaid" : "Awaiting approval"}
                      </small>
                    )}
                  </td>
                  <td>
                    {p.approvedAt ? (
                      <Who name={fmtDate(p.approvedAt)} sub={p.approvedBy ?? ""} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{p.paidAt ? <Who name={fmtDate(p.paidAt)} sub={p.paidRef ?? ""} /> : "—"}</td>
                  <td className="fp-actions">
                    <IconButton icon={Info} label="Payout details" onClick={() => open(p.id)} />
                    {canApprove && p.status === "pending_approval" && (
                      <>
                        <IconButton
                          icon={XCircle}
                          label="Reject payout"
                          onClick={() => reject(p.id)}
                        />
                        <Button success icon={Check} onClick={() => approve(p)}>
                          Approve
                        </Button>
                      </>
                    )}
                    {canApprove && p.status === "approved" && (
                      <Button primary icon={Landmark} onClick={() => pay(p.id)}>
                        Mark paid
                      </Button>
                    )}
                    {canApprove && p.status === "rejected" && (
                      <Button icon={RotateCcw} onClick={() => recalculate(p)}>
                        Recalculate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty text="No payouts match these filters." />}
        </div>
      </Panel>
      <Panel
        title="Transaction history"
        subtitle="Money paid out to partners and admins, and cash remitted to GloAro"
      >
        <div className="table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Type</th>
                <th>Account</th>
                <th>Details</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? movements : movements.slice(0, 15)).map((h) => (
                <tr key={h.reference + h.day + h.accountName}>
                  <td>{fmtDate(h.day)}</td>
                  <td>
                    <strong>{h.reference}</strong>
                  </td>
                  <td>
                    <span className={`fp-dir ${h.amountPaise < 0 ? "out" : "in"}`}>
                      {h.amountPaise < 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                      {kindLabel[h.kind]}
                    </span>
                  </td>
                  <td>{h.accountName}</td>
                  <td>{h.detail}</td>
                  <td className={`num ${h.amountPaise < 0 ? "fp-out" : "fp-in"}`}>
                    <strong>
                      {h.amountPaise < 0 ? inr(h.amountPaise) : `+${inr(h.amountPaise)}`}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {movements.length > 15 && (
          <div className="fp-more">
            <Button onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show recent only" : `Show all ${movements.length} transactions`}
            </Button>
          </div>
        )}
      </Panel>
    </div>
  )
}

function Reports({ geo }: { geo: Geo }) {
  const [period, setPeriod] = useState<"Daily" | "Weekly" | "Monthly">("Monthly")
  const q = useFinanceReport(period.toLowerCase() as ReportPeriod, geo)
  const rows = q.data ?? []
  const total = useMemo(
    () => ({
      collections: sum(rows, (r) => r.collectionsPaise),
      revenue: sum(rows, (r) => r.revenuePaise),
      partnerCost: sum(rows, (r) => r.partnerCostPaise),
      adminCost: sum(rows, (r) => r.adminCostPaise),
      net: sum(rows, (r) => r.netPaise),
    }),
    [rows],
  )
  const [toast, setToast] = useState<ToastMessage | null>(null)
  return (
    <Panel
      title={`${period} financial report`}
      subtitle="Accrual basis · every figure is summed from the same daily calculations used for payouts"
    >
      <div className="filters fp-filters">
        <Tabs items={["Daily", "Weekly", "Monthly"] as const} value={period} onChange={setPeriod} />
        <Button
          icon={Download}
          onClick={() => {
            const r = (p: number) => (p / 100).toFixed(2)
            csvDownload(
              `gloaro-${period.toLowerCase()}-finance-${new Date().toISOString().slice(0, 10)}.csv`,
              [
                [
                  "Period",
                  "From",
                  "To",
                  "Customer collections (INR)",
                  "Platform revenue (INR)",
                  "Partner payouts (INR)",
                  "Admin salaries (INR)",
                  "Net profit (INR)",
                ],
                ...rows.map((x) => [
                  x.label,
                  x.from,
                  x.to,
                  r(x.collectionsPaise),
                  r(x.revenuePaise),
                  r(x.partnerCostPaise),
                  r(x.adminCostPaise),
                  r(x.netPaise),
                ]),
                [
                  "Total",
                  rows[0]?.from ?? "",
                  rows.at(-1)?.to ?? "",
                  r(total.collections),
                  r(total.revenue),
                  r(total.partnerCost),
                  r(total.adminCost),
                  r(total.net),
                ],
              ],
            )
            setToast({ tone: "success", title: "Done", message: `${period} report downloaded.` })
          }}
        >
          Export CSV
        </Button>
      </div>
      <div className="table-wrap">
        <table className="fp-table">
          <thead>
            <tr>
              <th>Period</th>
              <th className="num">Customer collections</th>
              <th className="num">Platform revenue</th>
              <th className="num">Partner payouts</th>
              <th className="num">Admin salaries</th>
              <th className="num">GloAro net profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>
                  <strong>{r.label}</strong>
                </td>
                <td className="num">{inr(r.collectionsPaise)}</td>
                <td className="num">{inr(r.revenuePaise)}</td>
                <td className="num">{inr(-r.partnerCostPaise)}</td>
                <td className="num">{inr(-r.adminCostPaise)}</td>
                <td className={`num ${r.netPaise < 0 ? "fp-out" : "fp-in"}`}>
                  <strong>{inr(r.netPaise)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{inr(total.collections)}</td>
              <td className="num">{inr(total.revenue)}</td>
              <td className="num">{inr(-total.partnerCost)}</td>
              <td className="num">{inr(-total.adminCost)}</td>
              <td className="num">{inr(total.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="fp-footnote">
        Net profit = platform revenue (delivery fees + order commission) − partner payouts − admin
        salaries. Salaries and fixed pay accrue daily; admin performance incentives are paid at the
        close of a cycle. Customer collections are cash held for GloAro and are not counted as
        profit.
      </p>
      {toast && <Toast toast={toast} close={() => setToast(null)} />}
    </Panel>
  )
}

function AuditTrail() {
  const [all, setAll] = useState(false)
  const entries = useFinanceAudit().data ?? []
  const list = all ? entries : entries.slice(0, 12)
  return (
    <Panel
      title="Audit trail"
      subtitle={`${entries.length} recent entries · who changed what, and when`}
    >
      <div className="table-wrap">
        <table className="fp-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e, i) => (
              <tr key={e.at + i}>
                <td>{fmtStamp(e.at)}</td>
                <td>{e.actor}</td>
                <td>
                  <strong>{e.action}</strong>
                </td>
                <td className="fp-plan">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > 12 && (
        <div className="fp-more">
          <Button onClick={() => setAll(!all)}>
            {all ? "Show recent only" : "Show full audit trail"}
          </Button>
        </div>
      )}
    </Panel>
  )
}

function Lines({ lines, total }: { lines: PayoutLine[]; total: number }) {
  return (
    <div className="fp-lines">
      {lines.map((l, i) => (
        <div key={i}>
          <span>
            <b>{l.label}</b>
            <small>{l.formula}</small>
          </span>
          <strong className={l.amountPaise < 0 ? "neg" : ""}>{inr(l.amountPaise)}</strong>
        </div>
      ))}
      <div className="total">
        <span>
          <b>Total earnings</b>
        </span>
        <strong>{inr(total)}</strong>
      </div>
    </div>
  )
}

function AccountDrawer({
  type,
  id,
  cycle,
  close,
}: {
  type: AccountType
  id: string
  cycle: string
  close: () => void
}) {
  const q = useAccount(type, id, cycle)
  const a = q.data
  return (
    <Drawer label={a?.name ?? "Account"} className="fp-drawer" close={close}>
      <header>
        <span className="fp-who">
          <strong>{a?.name ?? "Loading…"}</strong>
          <small>
            {type === "partner" ? "Delivery partner account" : "Admin account"} · {a?.bank ?? ""}
          </small>
        </span>
        <IconButton icon={X} label="Close" onClick={close} />
      </header>
      <main>
        {q.isError && <ErrorBox icon={XCircle}>{message(q.error)}</ErrorBox>}
        {a && (
          <>
            <h4>Earnings calculation · {a.cycle.label}</h4>
            <Lines lines={a.statement.lines} total={a.statement.totalPaise} />
            {type === "partner" && (
              <>
                <h4>Cash account · {a.cycle.label}</h4>
                <div className="fp-equation">
                  <Row label="Cash collected from customers" value={a.statement.codPaise} />
                  <Row label="Less: remitted to GloAro" value={-a.statement.remittedPaise} />
                  <Row label="Still to remit" value={a.statement.outstandingPaise} strong total />
                </div>
              </>
            )}
            <h4>Pay plan history</h4>
            <div className="fp-lines">
              {a.planHistory.map((h, i) => (
                <div key={i}>
                  <span>
                    <b>{planText(type, h.plan)}</b>
                    <small>
                      From {fmtDate(h.from)} · {h.by} · {h.reason}
                    </small>
                  </span>
                  {i === 0 && <Badge tone="success">Current</Badge>}
                </div>
              ))}
            </div>
            <h4>Payouts</h4>
            <div className="fp-lines">
              {a.payouts.length === 0 && <Empty text="No payouts yet." />}
              {a.payouts.map((p) => (
                <div key={p.id}>
                  <span>
                    <b>
                      {p.code} · {p.cycle}
                    </b>
                    <small>
                      {p.paidAt
                        ? `Paid ${fmtDate(p.paidAt)} · ${p.paidRef}`
                        : `Due ${fmtDate(p.dueDate)}`}
                    </small>
                  </span>
                  <Badge tone={statusTone[p.displayStatus]}>{statusLabel[p.displayStatus]}</Badge>
                  <strong>{inr(p.amountPaise)}</strong>
                </div>
              ))}
            </div>
            {type === "partner" && a.remittances.length > 0 && (
              <>
                <h4>Cash remittances</h4>
                <div className="fp-lines">
                  {a.remittances.map((r) => (
                    <div key={r.id}>
                      <span>
                        <b>{fmtDate(r.day)}</b>
                        <small>
                          {r.cycle} collections · {r.method} · {r.receivedBy}
                        </small>
                      </span>
                      <strong>{inr(r.amountPaise)}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </Drawer>
  )
}

function PayoutModal({ id, close }: { id: string; close: () => void }) {
  const p = usePayout(id).data
  if (!p) return null
  const steps: [string, string | null, string][] = [
    ["Generated", p.createdAt, p.createdBy],
    ["Approved", p.approvedAt, p.approvedBy ?? ""],
    ["Paid", p.paidAt, p.paidAt ? `${p.paidMethod} · ${p.paidRef}` : ""],
    [
      "Settled",
      p.settledAt,
      p.settledAt
        ? "No open balance"
        : p.status === "paid"
          ? "Waiting for partner cash remittance"
          : "",
    ],
  ]
  return (
    <Modal
      title={`${p.code} · ${p.accountName}`}
      subtitle={`${p.accountType === "partner" ? "Delivery partner" : "Admin"} payout · ${p.cycle} · due ${fmtDate(p.dueDate)}`}
      close={close}
      wide
    >
      <div className="modal-body">
        <p className="fp-footnote">Amount frozen when the payout was generated.</p>
        <Lines lines={p.lines} total={p.amountPaise} />
        <div className="fp-timeline">
          {steps.map(([label, date, who]) => (
            <div className={date ? "done" : ""} key={label}>
              <i>{date ? <Check size={13} /> : null}</i>
              <span>
                <b>{label}</b>
                <small>{date ? `${fmtDate(date)} · ${who}` : who || "Not yet"}</small>
              </span>
            </div>
          ))}
          {p.status === "rejected" && (
            <div className="rejected">
              <i>
                <X size={13} />
              </i>
              <span>
                <b>Rejected</b>
                <small>
                  {p.rejectedBy} · {p.rejectedReason}
                </small>
              </span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v))
const toPaise = (rupees: number) => Math.round(rupees * 100)

function ConfigModal({
  type,
  name,
  current,
  today,
  busy,
  close,
  save,
}: {
  type: AccountType
  name: string
  current: PartnerPlan | AdminPlan | undefined
  today: string
  busy: boolean
  close: () => void
  save: (plan: PartnerPlan | AdminPlan, reason: string) => void
}) {
  // Rupee fields for paise amounts; percentages as they are.
  const fields: [string, string, number, boolean][] =
    type === "partner"
      ? [
          ["salaryPaise", "Monthly salary (₹)", 1e6, true],
          ["fixedPaise", "Fixed payment per month (₹)", 1e6, true],
          ["perDeliveryPaise", "Incentive per delivery (₹)", 1000, true],
          ["commissionPct", "Commission (% of delivery fees)", 100, false],
        ]
      : [
          ["salaryPaise", "Monthly salary (₹)", 1e7, true],
          ["commissionPct", "Commission (% of managed platform revenue)", 100, false],
          ["targetOnTimePct", "Performance target (on-time %)", 100, false],
          ["incentivePaise", "Performance incentive (₹ per cycle)", 1e6, true],
        ]
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      fields.map(([k, , , money]) => {
        const v = (current as Record<string, number> | undefined)?.[k] ?? 0
        return [k, String(money ? v / 100 : v)]
      }),
    ),
  )
  const [reason, setReason] = useState("")
  const [tried, setTried] = useState(false)
  const errors = Object.fromEntries(
    fields.map(([k, , max]) => {
      const n = num(values[k] ?? "")
      return [
        k,
        Number.isNaN(n) || n < 0
          ? "Enter 0 or more"
          : n > max
            ? `Must be ${max.toLocaleString("en-IN")} or less`
            : "",
      ]
    }),
  )
  const plan = Object.fromEntries(
    fields.map(([k, , , money]) => [
      k,
      money ? toPaise(num(values[k] ?? "")) : num(values[k] ?? ""),
    ]),
  ) as PartnerPlan | AdminPlan
  const ok = Object.values(errors).every((e) => !e)
  return (
    <Modal
      title={`Configure pay · ${name}`}
      subtitle={`${type === "partner" ? "Delivery partner" : "Admin"} account · Super Admin only`}
      close={close}
    >
      <div className="modal-body fp-form">
        <div className="fp-grid2">
          {fields.map(([k, label]) => (
            <Input
              key={k}
              label={label}
              type="number"
              value={values[k]}
              onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              error={tried ? errors[k] : ""}
            />
          ))}
        </div>
        <Input
          label="Reason for change (recorded in audit trail)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Annual revision approved by finance"
          error={tried && reason.trim().length < 5 ? "Give a reason of at least 5 characters" : ""}
        />
        <div className="fp-diff">
          <span>
            <small>Current</small>
            {current ? planText(type, current) : "—"}
          </span>
          <span>
            <small>New · effective {fmtDate(today)}</small>
            {ok ? planText(type, plan) : "—"}
          </span>
        </div>
        <p className="fp-footnote">
          Earlier days keep the rates that applied then. Generated payouts are not changed.
        </p>
      </div>
      <footer>
        <Button onClick={close}>Cancel</Button>
        <Button
          primary
          disabled={busy}
          onClick={() => {
            setTried(true)
            if (ok && reason.trim().length >= 5) save(plan, reason.trim())
          }}
        >
          Save pay settings
        </Button>
      </footer>
    </Modal>
  )
}

function AdjustModal({
  name,
  cycleLabel,
  locked,
  busy,
  close,
  save,
}: {
  name: string
  cycleLabel: string
  locked: boolean
  busy: boolean
  close: () => void
  save: (bonus: boolean, amountPaise: number, reason: string) => void
}) {
  const [kind, setKind] = useState("bonus")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [tried, setTried] = useState(false)
  const n = num(amount)
  const amountError =
    Number.isNaN(n) || n <= 0
      ? "Enter an amount above 0"
      : !Number.isInteger(n)
        ? "Use whole rupees"
        : ""
  return (
    <Modal
      title={`Bonus or deduction · ${name}`}
      subtitle={`Applies to ${cycleLabel}`}
      close={close}
    >
      <div className="modal-body fp-form">
        {locked ? (
          <p className="fp-warn">
            Payouts for {cycleLabel} have already been generated for this account, so its amounts
            are locked. Reject the payout first to make changes.
          </p>
        ) : (
          <>
            <Select label="Type" value={kind} onChange={setKind}>
              <option value="bonus">Bonus (adds to earnings)</option>
              <option value="deduction">Deduction (subtracts from earnings)</option>
            </Select>
            <Input
              label="Amount (₹)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={tried ? amountError : ""}
            />
            <Input
              label="Reason (shown on the payout statement)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={
                tried && reason.trim().length < 5 ? "Give a reason of at least 5 characters" : ""
              }
            />
          </>
        )}
      </div>
      <footer>
        <Button onClick={close}>{locked ? "Close" : "Cancel"}</Button>
        {!locked && (
          <Button
            primary
            disabled={busy}
            onClick={() => {
              setTried(true)
              if (!amountError && reason.trim().length >= 5)
                save(kind === "bonus", toPaise(n), reason.trim())
            }}
          >
            Record {kind}
          </Button>
        )}
      </footer>
    </Modal>
  )
}

function RemitModal({
  name,
  outstanding,
  cycleLabel,
  busy,
  close,
  save,
}: {
  name: string
  outstanding: number
  cycleLabel: string
  busy: boolean
  close: () => void
  save: (amountPaise: number, method: "Cash deposit" | "UPI to GloAro" | "Bank transfer") => void
}) {
  const [amount, setAmount] = useState(String(Math.floor(outstanding / 100)))
  const [method, setMethod] = useState("Cash deposit")
  const [tried, setTried] = useState(false)
  const n = num(amount)
  const paise = toPaise(n)
  const error =
    Number.isNaN(n) || n <= 0
      ? "Enter an amount above 0"
      : paise > outstanding
        ? `Cannot exceed ${inr(outstanding)} owed`
        : ""
  return (
    <Modal
      title={`Record cash remittance · ${name}`}
      subtitle={`${cycleLabel} · ${inr(outstanding)} still to remit`}
      close={close}
    >
      <div className="modal-body fp-form">
        <Input
          label="Amount received (₹)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={tried ? error : ""}
        />
        <Select label="Received via" value={method} onChange={setMethod}>
          <option>Cash deposit</option>
          <option>UPI to GloAro</option>
          <option>Bank transfer</option>
        </Select>
      </div>
      <footer>
        <Button onClick={close}>Cancel</Button>
        <Button
          primary
          disabled={busy}
          onClick={() => {
            setTried(true)
            if (!error) save(paise, method as "Cash deposit" | "UPI to GloAro" | "Bank transfer")
          }}
        >
          Record remittance
        </Button>
      </footer>
    </Modal>
  )
}

function PayModal({
  id,
  busy,
  close,
  save,
}: {
  id: string
  busy: boolean
  close: () => void
  save: (p: PayoutSummary, method: string, reference: string) => void
}) {
  const p = usePayout(id).data
  const [method, setMethod] = useState("Bank transfer (NEFT)")
  const [ref, setRef] = useState("")
  const [tried, setTried] = useState(false)
  const error =
    ref.trim().length < 6 ? "Enter the bank / UPI reference (at least 6 characters)" : ""
  if (!p) return null
  return (
    <Modal
      title={`Mark ${p.code} as paid`}
      subtitle={`${p.accountName} · ${inr(p.amountPaise)}`}
      close={close}
    >
      <div className="modal-body fp-form">
        <Select label="Payment method" value={method} onChange={setMethod}>
          <option>Bank transfer (NEFT)</option>
          <option>Bank transfer (IMPS)</option>
          <option>UPI</option>
        </Select>
        <Input
          label="Transaction reference (UTR)"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="e.g. UTR482915736"
          error={tried ? error : ""}
        />
        <p className="fp-footnote">
          This records a payment made outside the panel. No money is transferred from here.
        </p>
      </div>
      <footer>
        <Button onClick={close}>Cancel</Button>
        <Button
          primary
          disabled={busy}
          onClick={() => {
            setTried(true)
            if (!error) save(p, method, ref.trim())
          }}
        >
          Confirm payment
        </Button>
      </footer>
    </Modal>
  )
}

function RejectModal({
  title,
  busy,
  close,
  save,
}: {
  title: string
  busy: boolean
  close: () => void
  save: (reason: string) => void
}) {
  const [reason, setReason] = useState("")
  const [tried, setTried] = useState(false)
  return (
    <Modal title={title} subtitle="The reason is stored in the audit trail" close={close}>
      <div className="modal-body fp-form">
        <Input
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={tried && reason.trim().length < 5 ? "Give a reason of at least 5 characters" : ""}
        />
      </div>
      <footer>
        <Button onClick={close}>Cancel</Button>
        <Button
          danger
          disabled={busy}
          onClick={() => {
            setTried(true)
            if (reason.trim().length >= 5) save(reason.trim())
          }}
        >
          Reject
        </Button>
      </footer>
    </Modal>
  )
}
