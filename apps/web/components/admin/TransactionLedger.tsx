"use client"
import { useEffect, useState } from "react"
import { fetchLedgerSummary, fetchLedgerTransactions } from "@/lib/ledger-api"
import { downloadCsv } from "@/lib/csv"
import {
  PAYMENT_METHOD_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
  type LedgerFilters,
  type LedgerSummary,
  type LedgerTransactionRow,
  type LedgerTransactionsPage,
  type PaymentMethodFilter,
  type TransactionTypeFilter,
} from "@/types/ledger"
import type { DateRangeInput } from "@/types/dashboard"

const PAGE_SIZE = 8
const EXPORT_LIMIT = 1000

export default function TransactionLedger({
  workspaceId,
  dateRange,
}: {
  workspaceId: string
  dateRange: DateRangeInput
}) {
  const [summary, setSummary] = useState<LedgerSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [type, setType] = useState<TransactionTypeFilter | "">("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodFilter | "">("")
  const [page, setPage] = useState(1)

  const [transactions, setTransactions] = useState<LedgerTransactionsPage | null>(null)
  const [transactionsLoading, setTransactionsLoading] = useState(true)
  const [transactionsError, setTransactionsError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const [selectedRow, setSelectedRow] = useState<LedgerTransactionRow | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [workspaceId, dateRange.start, dateRange.end, type, paymentMethod, search])

  useEffect(() => {
    let cancelled = false
    setSummaryLoading(true)
    setSummaryError(null)
    fetchLedgerSummary(workspaceId, dateRange)
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch((err) => {
        if (!cancelled)
          setSummaryError(err instanceof Error ? err.message : "Unable to load summary.")
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, dateRange.start, dateRange.end])

  useEffect(() => {
    let cancelled = false
    const filters: LedgerFilters = {
      type: type || undefined,
      paymentMethod: paymentMethod || undefined,
      search: search || undefined,
    }
    setTransactionsLoading(true)
    setTransactionsError(null)
    fetchLedgerTransactions(workspaceId, dateRange, filters, page, PAGE_SIZE)
      .then((data) => {
        if (!cancelled) setTransactions(data)
      })
      .catch((err) => {
        if (!cancelled)
          setTransactionsError(err instanceof Error ? err.message : "Unable to load transactions.")
      })
      .finally(() => {
        if (!cancelled) setTransactionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, dateRange.start, dateRange.end, type, paymentMethod, search, page])

  useEffect(() => {
    if (!selectedRow) return
    setCopyFeedback(false)
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedRow(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedRow])

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopyFeedback(true)
    } catch {
      setCopyFeedback(false)
    }
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const filters: LedgerFilters = {
        type: type || undefined,
        paymentMethod: paymentMethod || undefined,
        search: search || undefined,
      }
      const full = await fetchLedgerTransactions(workspaceId, dateRange, filters, 1, EXPORT_LIMIT)
      downloadCsv(
        `${workspaceId}-transaction-ledger`,
        ["ID", "Tag", "Reference", "Type", "Counterparty", "Method", "Gross", "Fee", "Net"],
        full.items.map((item) => [
          item.code,
          item.tag,
          item.reference,
          item.typeLabel,
          item.counterparty,
          item.paymentMethod,
          item.gross,
          item.fee,
          item.net,
        ]),
      )
    } catch (err) {
      setTransactionsError(err instanceof Error ? err.message : "Unable to export transactions.")
    } finally {
      setExporting(false)
    }
  }

  const totalPages = transactions
    ? Math.max(1, Math.ceil(transactions.total / transactions.pageSize))
    : 1
  const rangeStart = transactions && transactions.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0
  const rangeEnd = transactions ? Math.min(page * PAGE_SIZE, transactions.total) : 0

  return (
    <>
      <div className="ledger-banner">
        <span className="ledger-banner-icon" aria-hidden="true">
          🔒
        </span>
        <div className="ledger-banner-text">
          <b>Restricted financial view</b>
          <p>Gross sales are never presented as platform profit.</p>
        </div>
        <span className="ledger-banner-badge">Authorized</span>
      </div>

      {summaryError && <p className="ledger-error">⚠ {summaryError}</p>}

      <div className="ledger-summary">
        {[
          { label: "Gross order value", card: summary?.grossOrderValue },
          { label: "Platform commission", card: summary?.platformCommission },
          { label: "Delivery fees", card: summary?.deliveryFees },
          { label: "Refunds", card: summary?.refunds },
          { label: "Net platform revenue", card: summary?.netPlatformRevenue },
        ].map(({ label, card }) => (
          <article key={label} className="ledger-summary-card">
            <span>{label}</span>
            <strong>{summaryLoading ? "…" : (card?.value ?? "—")}</strong>
            <small>{summaryLoading ? "" : (card?.caption ?? "")}</small>
          </article>
        ))}
      </div>

      <div className="ledger-payment-grid">
        {(summary?.paymentMethods ?? []).map((method) => (
          <article key={method.key} className="ledger-payment-tile">
            <span className="ledger-payment-icon" aria-hidden="true">
              🏦
            </span>
            <span className="ledger-payment-label">{method.label}</span>
            <strong>{method.percent}%</strong>
            <small>{method.amount}</small>
          </article>
        ))}
      </div>

      <div className="ledger-panel">
        <div className="ledger-panel-head">
          <div>
            <h2>Transactions</h2>
            <p>Permission-controlled actions · No actual transfers are performed</p>
          </div>
        </div>

        <div className="ledger-filters">
          <input
            className="ledger-search"
            placeholder="Transaction or order ID..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as TransactionTypeFilter | "")}
          >
            <option value="">All transaction types</option>
            {TRANSACTION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value as PaymentMethodFilter | "")}
          >
            <option value="">All payment methods</option>
            {PAYMENT_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin-action-btn"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "⭳ Export"}
          </button>
        </div>

        {transactionsError && <p className="ledger-error">⚠ {transactionsError}</p>}

        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tag</th>
                <th>Reference</th>
                <th>Type</th>
                <th>Counterparty</th>
                <th>Method</th>
                <th>Gross</th>
                <th>Fee</th>
                <th>Net</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {transactionsLoading ? (
                <tr>
                  <td colSpan={10} className="ledger-table-empty">
                    Loading transactions…
                  </td>
                </tr>
              ) : (transactions?.items.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={10} className="ledger-table-empty">
                    No transactions match these filters.
                  </td>
                </tr>
              ) : (
                transactions!.items.map((row) => (
                  <tr key={row.id}>
                    <td className="ledger-table-id">{row.code}</td>
                    <td>
                      <span className={`admin-tag admin-tag-${row.tag.toLowerCase()}`}>
                        {row.tag}
                      </span>
                    </td>
                    <td>{row.reference}</td>
                    <td>{row.typeLabel}</td>
                    <td>{row.counterparty}</td>
                    <td>{row.paymentMethod.replace(/_/g, " ")}</td>
                    <td>{row.gross}</td>
                    <td>{row.fee}</td>
                    <td className={row.isNegative ? "ledger-amount-negative" : undefined}>
                      {row.net}
                    </td>
                    <td className="ledger-table-actions">
                      <button
                        type="button"
                        className="ledger-row-menu"
                        aria-label={`View details for ${row.code}`}
                        onClick={() => setSelectedRow(row)}
                      >
                        ⋯
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="ledger-pagination">
          <span>
            {transactions && transactions.total > 0
              ? `Showing ${rangeStart}–${rangeEnd} of ${transactions.total}`
              : "No results"}
          </span>
          <div>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedRow && (
        <div className="ledger-modal-overlay">
          <button
            type="button"
            className="ledger-modal-backdrop"
            aria-label="Close transaction details"
            onClick={() => setSelectedRow(null)}
          />
          <div
            className="ledger-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Transaction ${selectedRow.code} details`}
          >
            <div className="ledger-modal-head">
              <div>
                <small className="ledger-table-id">{selectedRow.code}</small>
                <h2>{selectedRow.typeLabel}</h2>
              </div>
              <button
                type="button"
                className="ledger-modal-close"
                aria-label="Close"
                onClick={() => setSelectedRow(null)}
              >
                ✕
              </button>
            </div>
            <dl className="ledger-modal-grid">
              <div>
                <dt>Tag</dt>
                <dd>
                  <span className={`admin-tag admin-tag-${selectedRow.tag.toLowerCase()}`}>
                    {selectedRow.tag}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>{selectedRow.reference}</dd>
              </div>
              <div>
                <dt>Counterparty</dt>
                <dd>{selectedRow.counterparty}</dd>
              </div>
              <div>
                <dt>Payment method</dt>
                <dd>{selectedRow.paymentMethod.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt>Gross amount</dt>
                <dd>{selectedRow.gross}</dd>
              </div>
              <div>
                <dt>Fee</dt>
                <dd>{selectedRow.fee}</dd>
              </div>
              <div>
                <dt>Net amount</dt>
                <dd className={selectedRow.isNegative ? "ledger-amount-negative" : undefined}>
                  {selectedRow.net}
                </dd>
              </div>
            </dl>
            <div className="ledger-modal-actions">
              <button
                type="button"
                className="admin-action-btn"
                onClick={() => handleCopyCode(selectedRow.code)}
              >
                {copyFeedback ? "Copied!" : "Copy transaction ID"}
              </button>
              <button
                type="button"
                className="admin-action-btn admin-action-primary"
                onClick={() => setSelectedRow(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
