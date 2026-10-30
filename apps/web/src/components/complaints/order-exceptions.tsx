"use client"

import { ApiError } from "@zoauro/api-client"
import {
  businessName,
  formatINR,
  ORDER_SLA_MINUTES,
  orderStatusLabel,
  type Business,
  type Order,
} from "@zoauro/shared"
import { AlertTriangle, ArrowUpRight, Clock3, RefreshCw, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useOrders } from "@/lib/orders"
import { useMe } from "@/lib/session"
import { useRefreshToast } from "@/components/refresh-toast"

type ExceptionFilter = "delayed" | "refund_requested" | "cancelled"
type Portal = "super" | "admin"

const categories: { value: ExceptionFilter; label: string }[] = [
  { value: "delayed", label: "Late delivery" },
  { value: "refund_requested", label: "Refund review" },
  { value: "cancelled", label: "Cancelled orders" },
]

const pageSize = 10

export function OrderExceptions({
  business,
  portal,
  embedded = false,
}: {
  business?: Business | undefined
  portal: Portal
  /** Inside the Complaints & exceptions screen, which has its own header. */
  embedded?: boolean
}) {
  const router = useRouter()
  const runRefresh = useRefreshToast()
  const me = useMe()
  const canViewOrders = Boolean(me.data?.permissions.includes("orders.view"))
  const [filter, setFilter] = useState<ExceptionFilter>("delayed")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const listQuery = useOrders(
    {
      business,
      ...(filter === "delayed" ? { delayed: "true" as const } : { status: filter }),
      search: search.trim() || undefined,
      page,
      pageSize,
    },
    canViewOrders,
  )
  const delayedCount = useOrders({ business, delayed: "true", page: 1, pageSize: 1 }, canViewOrders)
  const refundCount = useOrders(
    { business, status: "refund_requested", page: 1, pageSize: 1 },
    canViewOrders,
  )
  const cancelledCount = useOrders(
    { business, status: "cancelled", page: 1, pageSize: 1 },
    canViewOrders,
  )
  const counts = [delayedCount, refundCount, cancelledCount]
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const businessLabel = business ? businessName[business] : "All businesses"

  const openOrder = (order: Order) => {
    const query = new URLSearchParams({ search: order.code })
    if (portal === "admin" && business) {
      router.push(`/admin/${business}/orders?${query}`)
      return
    }
    if (business) query.set("business", business)
    router.push(`/super/orders?${query}`)
  }

  const reload = () =>
    void runRefresh(async () => {
      const results = await Promise.all([
        listQuery.refetch(),
        ...counts.map((query) => query.refetch()),
      ])
      if (results.some((result) => result.isError)) throw new Error("Refresh failed")
    })

  return (
    <section className="exception-center" aria-label="Complaints and order exceptions">
      {!embedded && (
        <>
          <header className="exception-context">
            <span className="exception-icon">
              <AlertTriangle size={21} />
            </span>
            <span>
              <strong>{businessLabel}</strong>
              <small>Review order exceptions and route cases to the existing order workflow.</small>
            </span>
            <span className="exception-context-badge">Operations</span>
          </header>

          <div className="exception-notice" role="note">
            Complaint records are not yet available in the system. This queue shows only verifiable
            order exceptions; it does not create or imply customer complaints.
          </div>
        </>
      )}

      <div className="exception-metrics" aria-label="Order exception counts">
        {categories.map((category, index) => {
          const query = counts[index]!
          return (
            <button
              type="button"
              key={category.value}
              className={filter === category.value ? "active" : ""}
              aria-pressed={filter === category.value}
              onClick={() => {
                setFilter(category.value)
                setPage(1)
              }}
            >
              <span>{category.label}</span>
              <strong>{canViewOrders ? (query.data?.total ?? "—") : "—"}</strong>
            </button>
          )
        })}
      </div>

      <section className="exception-panel">
        <header className="exception-panel-head">
          <div>
            <h2>Order exceptions</h2>
            <p>
              {filter === "delayed"
                ? "Fulfilment has passed the business delivery SLA."
                : filter === "refund_requested"
                  ? "Orders awaiting a refund decision."
                  : "Cancelled orders in your permitted scope."}
            </p>
          </div>
          <button type="button" className="exception-refresh" onClick={reload}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </header>

        <div className="exception-toolbar">
          <label>
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search order, customer or vendor…"
              aria-label="Search order exceptions"
            />
          </label>
          <span>{canViewOrders ? `${total} cases` : "Order access required"}</span>
        </div>

        {me.isError ? (
          <p className="exception-state error" role="alert">
            Could not verify your account permissions. Reload the page and try again.
          </p>
        ) : !canViewOrders && !me.isPending ? (
          <p className="exception-state" role="status">
            Your account does not have permission to view order details for these exceptions.
          </p>
        ) : listQuery.isPending || me.isPending ? (
          <p className="exception-state">Loading order exceptions…</p>
        ) : listQuery.isError ? (
          <p className="exception-state error" role="alert">
            {listQuery.error instanceof ApiError
              ? listQuery.error.message
              : "Could not load order exceptions."}
          </p>
        ) : rows.length === 0 ? (
          <p className="exception-state">
            {search
              ? "No exceptions match this search."
              : `No ${categories.find((category) => category.value === filter)?.label.toLowerCase()} cases right now.`}
          </p>
        ) : (
          <div className="exception-list">
            {rows.map((order) => (
              <ExceptionRow
                key={order.id}
                order={order}
                filter={filter}
                onReview={() => openOrder(order)}
              />
            ))}
          </div>
        )}

        <footer className="exception-pagination">
          <span>
            {canViewOrders
              ? total
                ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
                : "Showing 0 cases"
              : "Cases are restricted by order permissions"}
          </span>
          <div>
            <button
              type="button"
              aria-label="Previous page"
              disabled={page <= 1 || listQuery.isPending}
              onClick={() => setPage((current) => current - 1)}
            >
              ‹
            </button>
            <strong>{page}</strong>
            <span>of {pages}</span>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= pages || listQuery.isPending}
              onClick={() => setPage((current) => current + 1)}
            >
              ›
            </button>
          </div>
        </footer>
      </section>
    </section>
  )
}

function ExceptionRow({
  order,
  filter,
  onReview,
}: {
  order: Order
  filter: ExceptionFilter
  onReview: () => void
}) {
  const description =
    filter === "delayed"
      ? (() => {
          const elapsed = Math.floor((Date.now() - new Date(order.placedAt).getTime()) / 60_000)
          const overdue = Math.max(elapsed - ORDER_SLA_MINUTES[order.business], 0)
          return `${overdue} min beyond SLA · ${order.customerName} · ${order.vendorName}`
        })()
      : `${order.issue ?? (filter === "refund_requested" ? "Refund review required" : "Cancelled")} · ${order.customerName} · ${order.vendorName}`

  return (
    <article className="exception-row">
      <span className={`exception-row-icon ${filter}`}>
        {filter === "delayed" ? <Clock3 size={17} /> : <AlertTriangle size={17} />}
      </span>
      <span className="exception-row-copy">
        <strong>
          {categories.find((category) => category.value === filter)?.label} · #{order.code}
        </strong>
        <small>{description}</small>
      </span>
      <span className={`exception-status ${filter}`}>
        {filter === "delayed" ? "SLA exceeded" : orderStatusLabel(order.business, order.status)}
      </span>
      <strong className="exception-amount">{formatINR(order.totalPaise)}</strong>
      <button type="button" className="exception-review" onClick={onReview}>
        Review order <ArrowUpRight size={15} />
      </button>
    </article>
  )
}
