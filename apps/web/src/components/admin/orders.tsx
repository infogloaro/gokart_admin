"use client"
// Live orders for the Admin portal (prototype Orders screen), limited to the admin's zones.
import * as Dialog from "@radix-ui/react-dialog"
import { ApiError } from "@zoauro/api-client"
import {
  formatINR,
  nextStatuses,
  ORDER_STATUSES,
  orderStatusLabel,
  type Business,
  type Order,
  type OrderStatus,
} from "@zoauro/shared"
import { Bike, Check, Package, Search, UtensilsCrossed, X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import {
  paymentLabel,
  paymentTone,
  placedLabel,
  statusTone,
  useAssignPartner,
  useChangeOrderStatus,
  useOrder,
  useOrderCandidates,
  useOrders,
} from "@/lib/orders"
import { AdminBadge, AdminButton, PageHeader } from "./ui"

const PAGE_SIZE = 10

export function AdminOrders({ business }: { business: Business }) {
  const p = useSearchParams()
  // Dashboard, notification and search links open the list pre-filtered; a new link starts over.
  return (
    <OrdersScreen
      key={`${p.get("search")}|${p.get("status")}|${p.get("delayed")}`}
      business={business}
      linked={{
        search: p.get("search") ?? "",
        status: ORDER_STATUSES.find((s) => s === p.get("status")) ?? "",
        delayed: p.get("delayed") === "true",
      }}
    />
  )
}

function OrdersScreen({
  business,
  linked,
}: {
  business: Business
  linked: { search: string; status: OrderStatus | ""; delayed: boolean }
}) {
  const [query, setQuery] = useState(linked.search)
  const [status, setStatus] = useState<OrderStatus | "">(linked.status)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Order | null>(null)
  const [delayedOnly, setDelayedOnly] = useState(linked.delayed)
  const orders = useOrders({
    business,
    status: status || undefined,
    delayed: delayedOnly ? "true" : undefined,
    search: query.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  const total = orders.data?.total ?? 0
  const statuses = ORDER_STATUSES.filter((s) =>
    business === "food" ? s !== "packed" : s !== "preparing",
  )

  return (
    <>
      <PageHeader
        title={`${business === "food" ? "Food" : "Marketplace"} orders`}
        subtitle={`Monitor and act on ${business === "food" ? "restaurant orders and delivery progress" : "seller fulfilment and parcel shipments"}.`}
        note={<span className="live-note">● Live data</span>}
      />
      <section className="panel full-panel">
        <div className="toolbar">
          <div className="search-field">
            <Search className="icon" size={17} />
            <input
              placeholder="Search order ID, customer, vendor…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              aria-label="Search orders"
            />
          </div>
          <select
            className="filter-button"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OrderStatus | "")
              setPage(1)
            }}
            aria-label="Status"
          >
            <option value="">Status: All</option>
            {statuses.map((s) => (
              <option value={s} key={s}>
                {orderStatusLabel(business, s)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`filter-button${delayedOnly ? " active" : ""}`}
            aria-pressed={delayedOnly}
            onClick={() => (setDelayedOnly(!delayedOnly), setPage(1))}
            title={`Still being fulfilled after ${business === "food" ? "45 minutes" : "4 hours"}`}
          >
            Delayed only
          </button>
        </div>
        <div className="table-summary">
          <span>
            Showing <strong>{orders.data?.items.length ?? 0}</strong> of {total} orders
          </span>
          <AdminBadge tone="info">Assigned zones only</AdminBadge>
        </div>
        {orders.isError ? (
          <p style={{ padding: "1rem" }}>
            {orders.error instanceof ApiError ? orders.error.message : "Couldn't load orders."}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>{business === "food" ? "Restaurant" : "Seller"}</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Partner</th>
                </tr>
              </thead>
              <tbody>
                {orders.data?.items.map((o) => (
                  // Whole row opens the drawer for mouse users; the order code button covers keyboards.
                  <tr key={o.id} onClick={() => setSelected(o)}>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => (e.stopPropagation(), setSelected(o))}
                        style={{ all: "unset", cursor: "pointer" }}
                      >
                        <strong>{o.code}</strong>
                      </button>
                      <small>{placedLabel(o.placedAt)}</small>
                    </td>
                    <td>{o.customerName}</td>
                    <td>
                      <strong className="vendor-name">{o.vendorName}</strong>
                    </td>
                    <td>
                      <strong>{formatINR(o.totalPaise)}</strong>
                      <small>{paymentLabel(o)}</small>
                    </td>
                    <td>
                      <AdminBadge tone={statusTone(o.status)}>
                        {orderStatusLabel(o.business, o.status)}
                      </AdminBadge>
                      {o.delayed && <AdminBadge tone="danger">Delayed</AdminBadge>}
                    </td>
                    <td>
                      <span>{o.partnerName ?? "Unassigned"}</span>
                    </td>
                  </tr>
                ))}
                {orders.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6}>No orders match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            Rows per page: <b>{PAGE_SIZE}</b>
          </span>
          <span>
            {total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
            ‹
          </button>
          <button
            disabled={page * PAGE_SIZE >= total}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      </section>
      {selected && (
        <OrderDrawer order={selected} close={() => setSelected(null)} onChanged={setSelected} />
      )}
    </>
  )
}

function OrderDrawer({
  order,
  close,
  onChanged,
}: {
  order: Order
  close: () => void
  onChanged: (o: Order) => void
}) {
  const change = useChangeOrderStatus()
  const [reason, setReason] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const next = nextStatuses(order.business, order.status)
  const run = (to: OrderStatus, why?: string) =>
    change.mutate(
      { order, to, ...(why && { reason: why }) },
      { onSuccess: (o) => (onChanged(o), setCancelling(false)) },
    )
  const ItemIcon = order.business === "food" ? UtensilsCrossed : Package

  return (
    // Radix Dialog gives Escape, focus trapping and outside-click closing; rendered in
    // place (no portal) so .admin-ui styles apply.
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Overlay className="drawer-backdrop">
        <Dialog.Content className="drawer" aria-describedby={undefined}>
          <div className="drawer-head">
            <div>
              <small>ORDER DETAILS</small>
              <Dialog.Title asChild>
                <h2>{order.code}</h2>
              </Dialog.Title>
            </div>
            <Dialog.Close aria-label="Close">
              <X className="icon" size={20} />
            </Dialog.Close>
          </div>
          <div className="drawer-status">
            <AdminBadge tone={statusTone(order.status)}>
              {orderStatusLabel(order.business, order.status)}
            </AdminBadge>
            <span>Placed {placedLabel(order.placedAt)}</span>
          </div>
          <div className="route-card">
            <div>
              <span className="route-dot start" />
              <div>
                <small>{order.business === "food" ? "RESTAURANT" : "SELLER PICKUP"}</small>
                <strong>{order.vendorName}</strong>
              </div>
            </div>
            <i />
            <div>
              <span className="route-dot end" />
              <div>
                <small>CUSTOMER</small>
                <strong>{order.customerName}</strong>
                <p>{order.customerPhone}</p>
              </div>
            </div>
          </div>
          <section className="drawer-section">
            <h3>{order.business === "food" ? "Items in this order" : "Product summary"}</h3>
            {order.items.map((i, k) => (
              <div className="item-row" key={k}>
                <span className="item-thumb">
                  <ItemIcon className="icon" size={20} />
                </span>
                <div>
                  <strong>{i.name}</strong>
                  <small>Quantity · {i.quantity}</small>
                </div>
                <b>{formatINR(i.quantity * i.unitPricePaise)}</b>
              </div>
            ))}
            <div className="item-row">
              <span />
              <div>
                <strong>Total incl. delivery fee {formatINR(order.deliveryFeePaise)}</strong>
              </div>
              <b>{formatINR(order.totalPaise)}</b>
            </div>
          </section>
          <section className="drawer-section split-info">
            <div>
              <small>PAYMENT</small>
              <AdminBadge tone={paymentTone(order.paymentStatus)}>{paymentLabel(order)}</AdminBadge>
            </div>
            <div>
              <small>DELIVERY PARTNER</small>
              <strong>{order.partnerName ?? "Not assigned"}</strong>
            </div>
          </section>
          {(order.status === "ready" || order.status === "assigned") && (
            <AdminAssign order={order} onAssigned={onChanged} />
          )}
          <AdminHistory id={order.id} business={order.business} />
          {change.isError && (
            <p role="alert" style={{ color: "#b42318", fontSize: 13 }}>
              {change.error instanceof ApiError
                ? change.error.message
                : "Couldn't update the order."}
            </p>
          )}
          {cancelling && (
            <label
              className="drawer-section"
              style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}
            >
              Reason for cancelling
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  height: 38,
                  border: "1px solid #e2e8f0",
                  borderRadius: 9,
                  padding: "0 10px",
                }}
              />
            </label>
          )}
          <div className="drawer-actions">
            {cancelling ? (
              <>
                <AdminButton kind="ghost" onClick={() => setCancelling(false)}>
                  Keep order
                </AdminButton>
                <AdminButton
                  kind="danger"
                  disabled={!reason.trim() || change.isPending}
                  onClick={() => run("cancelled", reason.trim())}
                >
                  Cancel order
                </AdminButton>
              </>
            ) : (
              // Assigning needs a partner, so it happens in the picker above.
              next
                .filter((to) => to !== "assigned")
                .map((to) =>
                  to === "cancelled" ? (
                    <AdminButton key={to} kind="ghost" onClick={() => setCancelling(true)}>
                      Cancel order
                    </AdminButton>
                  ) : (
                    <AdminButton
                      key={to}
                      kind={order.status === "assigned" && to === "ready" ? "secondary" : "primary"}
                      disabled={change.isPending}
                      onClick={() => run(to)}
                    >
                      {order.status === "assigned" && to === "ready"
                        ? "Unassign partner"
                        : order.status === "refund_requested" && to === "delivered"
                          ? "Decline refund"
                          : `Mark ${orderStatusLabel(order.business, to).toLowerCase()}`}
                    </AdminButton>
                  ),
                )
            )}
          </div>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  )
}

function AdminAssign({ order, onAssigned }: { order: Order; onAssigned: (o: Order) => void }) {
  const candidates = useOrderCandidates(order.id, true)
  const assign = useAssignPartner()
  const [partnerId, setPartnerId] = useState("")
  const list = candidates.data ?? []
  const free = list.filter((p) => p.availability === "available" && p.id !== order.partnerId)
  return (
    <section className="drawer-section assign-section">
      <h3>{order.partnerName ? "Reassign delivery partner" : "Assign a delivery partner"}</h3>
      <div>
        <select
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          aria-label="Delivery partner"
        >
          <option value="">
            {candidates.isLoading
              ? "Loading partners…"
              : free.length
                ? "Choose an online partner"
                : "No partner is free in this area"}
          </option>
          {free.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name} · {p.code}
            </option>
          ))}
          {list
            .filter((p) => p.availability !== "available")
            .map((p) => (
              <option value={p.id} key={p.id} disabled>
                {p.name} · on delivery ({p.carrying})
              </option>
            ))}
        </select>
        <AdminButton
          icon={Bike}
          disabled={!partnerId || assign.isPending}
          onClick={() =>
            assign.mutate(
              { order, partnerId },
              { onSuccess: (o) => (onAssigned(o), setPartnerId("")) },
            )
          }
        >
          {order.partnerName ? "Reassign" : "Assign"}
        </AdminButton>
      </div>
      {assign.isError && (
        <p role="alert" className="doc-error">
          {assign.error instanceof ApiError ? assign.error.message : "Couldn't assign the partner."}
        </p>
      )}
    </section>
  )
}

function AdminHistory({ id, business }: { id: string; business: Order["business"] }) {
  const detail = useOrder(id)
  const events = detail.data?.events ?? []
  const who = (e: (typeof events)[number]) =>
    e.actorName ??
    { app: "Customer app", partner: "Partner app", seed: "Demo data", system: "System" }[
      e.actorType
    ] ??
    e.actorType
  return (
    <section className="drawer-section">
      <h3>History</h3>
      {!detail.data && <p>Loading history…</p>}
      <div className="vertical-timeline">
        {events.map((e, i) => (
          <div key={i} className={i === events.length - 1 ? "current" : "done"}>
            <span>{i < events.length - 1 ? <Check className="icon" size={12} /> : ""}</span>
            <div>
              <strong>
                {orderStatusLabel(business, e.to)}
                {e.reason && ` · ${e.reason}`}
              </strong>
              <small>
                {placedLabel(e.at)} · {who(e)}
              </small>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
