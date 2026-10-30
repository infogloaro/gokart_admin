"use client"
// Transaction ledger (Super Admin) in the prototype's markup: restricted banner, totals,
// payment-method filters and the transactions table. Also the "Platform revenue" tab of
// Finance & payouts, where it gets the category tabs.
import { api, ApiError } from "@zoauro/api-client"
import {
  DASHBOARD_RANGES,
  ledgerMethodLabel,
  ledgerTypeLabel,
  LEDGER_TYPES,
  rangeName,
  type DashboardRange,
  type LedgerEntry,
  type LedgerMethod,
  type LedgerType,
} from "@zoauro/shared"
import {
  AlertTriangle,
  Download,
  LockKeyhole,
  MoreHorizontal,
  ReceiptText,
  Search,
  WalletCards,
} from "lucide-react"
import { useEffect, useState } from "react"
import { fmtStamp, inr, useLedger, useLedgerSummary } from "@/lib/finance"
import { useCsvExport } from "./export"
import { useBusinessFilter } from "./shell"
import { Badge, Button, ErrorBox, IconButton, Input, Modal, Panel, Select, Tabs, Toast } from "./ui"

const CATEGORY_TABS = [
  "Transactions",
  "Food Revenue",
  "Mart Revenue",
  "Refunds",
  "Partner Earnings",
  "Payout History",
] as const
type Category = (typeof CATEGORY_TABS)[number]
const PAGE_SIZE = 12

const tone = (status: string) =>
  status.includes("Pending")
    ? "warning"
    : status === "Processing"
      ? "info"
      : status === "Refunded"
        ? "danger"
        : "success"

export function TransactionLedger({ withTabs = false }: { withTabs?: boolean }) {
  const filter = useBusinessFilter()
  const [tab, setTab] = useState<Category>("Transactions")
  const [range, setRange] = useState<DashboardRange>("30d")
  const [type, setType] = useState<LedgerType | "">("")
  const [method, setMethod] = useState<LedgerMethod | "">("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<LedgerEntry | null>(null)
  const csv = useCsvExport()

  // Category tabs pick a business or a transaction type; the header switcher still applies.
  const business =
    tab === "Food Revenue"
      ? "food"
      : tab === "Mart Revenue"
        ? "mart"
        : filter === "all"
          ? undefined
          : filter
  const tabType: LedgerType | undefined =
    tab === "Refunds"
      ? "refund"
      : tab === "Partner Earnings"
        ? "partner_payout"
        : tab === "Payout History"
          ? "admin_payout"
          : undefined
  const effectiveType = tabType ?? (type || undefined)
  useEffect(() => setPage(1), [tab, range, type, method, search, filter])

  const summary = useLedgerSummary(range, business)
  const q = {
    range,
    business,
    type: effectiveType,
    method: method || undefined,
    search: search.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  }
  const list = useLedger(q)
  const s = summary.data
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pct = (v: number) =>
    s?.grossPaise ? `${((v / s.grossPaise) * 100).toFixed(1)}% of GTV` : "—"

  const exportCsv = () =>
    csv.run("transaction-ledger", async () => {
      const all = await api("get", "/ledger/transactions", {
        query: { ...q, page: 1, pageSize: 100 },
      })
      const rows = [
        [
          "Transaction",
          "Business",
          "Order / Account",
          "Type",
          "Beneficiary",
          "Payment method",
          "Gross (INR)",
          "Fees / commission (INR)",
          "Net (INR)",
          "Status",
          "When",
        ],
        ...all.items.map((r) => [
          r.code,
          r.business ?? "",
          r.reference,
          ledgerTypeLabel[r.type],
          r.beneficiary,
          ledgerMethodLabel[r.method],
          (r.grossPaise / 100).toFixed(2),
          (r.feesPaise / 100).toFixed(2),
          (r.netPaise / 100).toFixed(2),
          r.status,
          r.at,
        ]),
      ]
      const cell = (v: string | number) =>
        /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
      return {
        csv: rows.map((r) => r.map(cell).join(",")).join("\n"),
        count: all.items.length,
        limited: all.total > 100,
      }
    })

  return (
    <>
      <div className="context restricted">
        <LockKeyhole />
        <span>
          <b>Restricted financial view</b>Gross sales are never presented as platform profit.
        </span>
        <Badge tone="success">Authorized</Badge>
      </div>
      {withTabs && <Tabs items={CATEGORY_TABS} value={tab} onChange={setTab} />}
      <div className="finance-totals">
        {[
          ["Gross order value", s ? inr(s.grossPaise) : "—", "Not platform profit"],
          ["Platform commission", s ? inr(s.commissionPaise) : "—", "Kept from vendor sales"],
          ["Delivery fees", s ? inr(s.deliveryFeesPaise) : "—", "Charged to customers"],
          ["Refunds", s ? inr(s.refundsPaise) : "—", s ? pct(s.refundsPaise) : "—"],
          ["Net platform revenue", s ? inr(s.netPaise) : "—", "After refunds"],
        ].map(([label, value, note]) => (
          <div key={label}>
            <small>{label}</small>
            <b>{value}</b>
            <span>{note}</span>
          </div>
        ))}
      </div>
      <div className="payment-methods">
        {(s?.methods ?? []).map((m) => (
          <button
            type="button"
            className={method === m.method ? "active" : ""}
            onClick={() => setMethod(method === m.method ? "" : m.method)}
            aria-pressed={method === m.method}
            key={m.method}
          >
            <span>
              <WalletCards size={16} />
              {ledgerMethodLabel[m.method]}
            </span>
            <b>{(m.share * 100).toFixed(1)}%</b>
            <small>{inr(m.amountPaise)}</small>
          </button>
        ))}
      </div>
      <Panel
        title={tab}
        subtitle={`${rangeName[range]} · permission-controlled · no transfers are made from here`}
      >
        <div className="filters">
          <Input
            icon={Search}
            placeholder="Transaction, order ID or beneficiary…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search transactions"
          />
          {!tabType && (
            <Select value={type} onChange={(v) => setType(v as LedgerType | "")}>
              <option value="">All transaction types</option>
              {LEDGER_TYPES.map((t) => (
                <option value={t} key={t}>
                  {ledgerTypeLabel[t]}
                </option>
              ))}
            </Select>
          )}
          <Select value={range} onChange={(v) => setRange(v as DashboardRange)}>
            {DASHBOARD_RANGES.map((r) => (
              <option value={r} key={r}>
                {rangeName[r]}
              </option>
            ))}
          </Select>
          <Button icon={Download} onClick={exportCsv} disabled={csv.exporting}>
            {csv.exporting ? "Exporting…" : "Export"}
          </Button>
        </div>
        {list.isError ? (
          <div className="modal-body">
            <ErrorBox icon={AlertTriangle}>
              {list.error instanceof ApiError ? list.error.message : "Couldn't load transactions."}
            </ErrorBox>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  {[
                    "Transaction",
                    "Business",
                    "Order / Account",
                    "Type",
                    "Beneficiary",
                    "Payment method",
                    "Gross amount",
                    "Fees / Commission",
                    "Net amount",
                    "Status",
                    "",
                  ].map((h, i) => (
                    <th key={h + i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.code}</strong>
                    </td>
                    <td>
                      {r.business ? (
                        <Badge tone={r.business}>{r.business === "food" ? "FOOD" : "MART"}</Badge>
                      ) : (
                        <Badge>PLATFORM</Badge>
                      )}
                    </td>
                    <td>{r.reference}</td>
                    <td>{ledgerTypeLabel[r.type]}</td>
                    <td>{r.beneficiary}</td>
                    <td>
                      <span className="method-cell">
                        <WalletCards size={14} />
                        {ledgerMethodLabel[r.method]}
                      </span>
                    </td>
                    <td>{inr(r.grossPaise)}</td>
                    <td>{inr(r.feesPaise)}</td>
                    <td className={r.netPaise < 0 ? "negative-amount" : ""}>
                      <strong>{inr(r.netPaise)}</strong>
                    </td>
                    <td>
                      <Badge tone={tone(r.status)}>{r.status}</Badge>
                    </td>
                    <td>
                      <IconButton
                        icon={MoreHorizontal}
                        label={`Details of ${r.code}`}
                        onClick={() => setOpen(r)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.data?.items.length === 0 && (
              <div className="finance-empty">
                <ReceiptText size={28} />
                <b>No matching records</b>
                <span>Try another payment method, category or date range.</span>
              </div>
            )}
          </div>
        )}
        <div className="pagination">
          <span>
            Showing {list.data?.items.length ?? 0} of {total.toLocaleString("en-IN")} records
          </span>
          <div>
            <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <b>{page}</b>
            <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Panel>
      {open && (
        <Modal
          title={open.code}
          subtitle={`${ledgerTypeLabel[open.type]} · ${fmtStamp(open.at)}`}
          close={() => setOpen(null)}
        >
          <div className="modal-body">
            <div className="fp-lines">
              {[
                ["Order / account", open.reference],
                ["Beneficiary", open.beneficiary],
                ["Payment method", ledgerMethodLabel[open.method]],
                ["Gross amount", inr(open.grossPaise)],
                ["Fees / commission", inr(open.feesPaise)],
                ["Net amount", inr(open.netPaise)],
                ["Status", open.status],
              ].map(([k, v]) => (
                <div key={k}>
                  <span>
                    <b>{k}</b>
                  </span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {csv.toast && <Toast toast={csv.toast} close={csv.dismiss} />}
    </>
  )
}
