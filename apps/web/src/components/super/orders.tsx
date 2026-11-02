"use client"
// Live order management for the Super Admin portal (prototype "Management" screen, orders tab).
import { ApiError } from "@zoauro/api-client"
import {
  businessName,
  formatINR,
  nextStatuses,
  ORDER_STATUSES,
  orderStatusLabel,
  vehicleLabel,
  type Order,
  type OrderStatus,
} from "@zoauro/shared"
import {
  AlertTriangle,
  Bike,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
} from "lucide-react"
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
  useOrderFilterOptions,
  useOrders,
} from "@/lib/orders"
import { useOrderSummary } from "@/lib/session"
import { useBusinessFilter } from "./shell"
import { Badge, Button, ErrorBox, IconButton, Input, Modal, Select } from "./ui"

const PAGE_SIZE = 10

export function SuperOrders() {
  const p = useSearchParams()
  // DIAGNOSTIC: GO-KART-SUPER-ORDERS-2026-11-02-B
  return <OrdersScreen key={`${p.get("search")}|${p.get("status")}|${p.get("delayed")}`} />
}

function OrdersScreen() {
  const business = useBusinessFilter()
  // Some labels differ per business; with both businesses shown, use neutral wording.
  const statusText = (s: OrderStatus) =>
    business !== "all"
      ? orderStatusLabel(business, s)
      : s === "ready"
        ? "Ready"
        : s === "out_for_delivery"
          ? "Out for delivery"
          : orderStatusLabel("food", s)
  // Dashboard and search links open the list pre-filtered (?search=, ?status=, ?delayed=true).
  const params = useSearchParams()
  const initialSearch = params.get("search") ?? ""
  const linkedStatus = params.get("status")
  const [search, setSearch] = useState(initialSearch)
  const [status, setStatus] = useState<OrderStatus | "">(
    ORDER_STATUSES.find((s) => s === linkedStatus) ?? "",
  )
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Order | null>(null)
  const [delayedOnly, setDelayedOnly] = useState(params.get("delayed") === "true")
  const [adminId, setAdminId] = useState<string | null>(null)
  const [deliveryPartnerId, setDeliveryPartnerId] = useState<string | null>(null)
  const filterOptions = useOrderFilterOptions(business === "all" ? undefined : business)
  const orders = useOrders({
    business: business === "all" ? undefined : business,
    status: status || undefined,
    delayed: delayedOnly ? "true" : undefined,
    search: search.trim() || undefined,
    adminId: adminId || undefined,
    deliveryPartnerId: deliveryPartnerId || undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  const summary = useOrderSummary()
  const counts = (summary.data ?? []).filter((s) => business === "all" || s.business === business)
  const total = counts.reduce((t, s) => t + s.total, 0)
  const open = counts.reduce((t, s) => t + s.open, 0)
  const delayed = counts.reduce((t, s) => t + s.delayed, 0)
  const pages = Math.max(1, Math.ceil((orders.data?.total ?? 0) / PAGE_SIZE))

  return (
    <>
      <div className="summary">
        <div>
          <i className="navy" />
          <span>
            Total <b>{summary.data ? total.toLocaleString("en-IN") : "—"}</b>
          </span>
        </div>
        <div>
          <i className="gold" />
          <span>
            Open <b>{summary.data ? open.toLocaleString("en-IN") : "—"}</b>
          </span>
        </div>
        <div>
          <i className="green" />
          <span>
            Closed <b>{summary.data ? (total - open).toLocaleString("en-IN") : "—"}</b>
          </span>
        </div>
        <button
          type="button"
          className={`summary-filter${delayedOnly ? " active" : ""}`}
          aria-pressed={delayedOnly}
          onClick={() => (setDelayedOnly(!delayedOnly), setPage(1))}
          title="Orders still being fulfilled after their time limit (food 45 min, mart 4 h)"
        >
          <i className="red" />
          <span>
            Delayed <b>{summary.data ? delayed.toLocaleString("en-IN") : "—"}</b>
          </span>
        </button>
      </div>
      <section className="panel table-panel">
        <div className="filters">
          <Input
            icon={Search}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search order, customer or vendor…"
            aria-label="Search orders"
          />
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v as OrderStatus | "")
              setPage(1)
            }}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option value={s} key={s}>
                {statusText(s)}
              </option>
            ))}
          </Select>
          <select
            className="filter-button"
            value={adminId || ""}
            aria-label="Admin"
            onChange={(e) => {
              const newAdmin = e.target.value === "" ? null : (e.target.value as string)
              setAdminId(newAdmin)
              setPage(1)
            }}
          >
            <option value="">All admins</option>
            <option value="unassigned">Unassigned</option>
            {filterOptions.data?.admins.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
          <select
            className="filter-button"
            value={deliveryPartnerId || ""}
            aria-label="Delivery partner"
            onChange={(e) => {
              const newPartner = e.target.value === "" ? null : (e.target.value as string)
              setDeliveryPartnerId(newPartner)
              setPage(1)
            }}
          >
            <option value="">All delivery partners</option>
            <option value="unassigned">Unassigned</option>
            {filterOptions.data?.deliveryPartners.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
        {orders.isError ? (
          <div className="modal-body">
            <ErrorBox icon={AlertTriangle}>
              {orders.error instanceof ApiError ? orders.error.message : "Couldn't load orders."}
            </ErrorBox>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Order / Shipment",
                    "Business",
                    "Customer",
                    "Vendor",
                    "Admin",
                    "Delivery Partner",
                    "Payment",
                    "Status",
                    "Amount",
                    "",
                  ].map((h, i) => (
                    <th key={h + i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.data?.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <button type="button" className="entity" onClick={() => setSelected(o)}>
                        <b className={o.business}>{o.code.slice(0, 2)}</b>
                        <span>
                          <strong>{o.code}</strong>
                          <small>{placedLabel(o.placedAt)}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <Badge tone={o.business}>{businessName[o.business]}</Badge>
                    </td>
                    <td>{o.customerName}</td>
                    <td>{o.vendorName}</td>
                    <td>
                      <span>{o.responsibleAdminName ?? "Unassigned"}</span>
                    </td>
                    <td>
                      <span>{o.partnerName ?? "Unassigned"}</span>
                    </td>
                    <td>
                      <Badge tone={paymentTone(o.paymentStatus)}>{paymentLabel(o)}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone(o.status)}>
                        {orderStatusLabel(o.business, o.status)}
                      </Badge>
                      {o.delayed && <Badge tone="danger">Delayed</Badge>}
                    </td>
                    <td>
                      <strong>{formatINR(o.totalPaise)}</strong>
                    </td>
                    <td>
                      <IconButton
                        icon={MoreHorizontal}
                        label={`Open ${o.code}`}
                        onClick={() => setSelected(o)}
                      />
                    </td>
                  </tr>
                ))}
                {orders.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      {delayedOnly
                        ? "No delayed orders right now."
                        : "No orders match these filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {orders.data
              ? `Showing ${orders.data.total ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, orders.data.total)} of ${orders.data.total} orders`
              : "Loading orders…"}
          </span>
          <div>
            <IconButton
              icon={ChevronLeft}
              label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            />
            <b>{page}</b>
            <span>of {pages}</span>
            <IconButton
              icon={ChevronRight}
              label="Next page"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            />
          </div>
        </div>
      </section>
      {selected && (
        <OrderModal order={selected} close={() => setSelected(null)} onChanged={setSelected} />
      )}
    </>
  )
}

function OrderModal({
  order,
  close,
  onChanged,
}: {
  order: Order
  close: () => void
  onChanged: (o: Order) => void
}) {
  const change = useChangeOrderStatus()
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState("")
  const next = nextStatuses(order.business, order.status)
  const run = (to: OrderStatus, why?: string) =>
    change.mutate(
      { order, to, ...(why && { reason: why }) },
      { onSuccess: (o) => (onChanged(o), setCancelling(false)) },
    )

  return (
    <Modal
      title={order.code}
      subtitle={`${businessName[order.business]} · placed ${placedLabel(order.placedAt)}`}
      close={close}
    >
      <div
        className="modal-body"
        style={{ display: "flex", flexDirection: "column", gap: ".8rem" }}
      >
        {change.isError && (
          <ErrorBox icon={AlertTriangle}>
            {change.error instanceof ApiError ? change.error.message : "Couldn't update the order."}
          </ErrorBox>
        )}
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <Badge tone={statusTone(order.status)}>
            {orderStatusLabel(order.business, order.status)}
          </Badge>
          <Badge tone={paymentTone(order.paymentStatus)}>{paymentLabel(order)}</Badge>
        </div>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: ".35rem 1rem",
            margin: 0,
            fontSize: ".8rem",
          }}
        >
          <dt>Customer</dt>
          <dd style={{ margin: 0 }}>
            {order.customerName} · {order.customerPhone}
          </dd>
          <dt>{order.business === "food" ? "Restaurant" : "Seller"}</dt>
          <dd style={{ margin: 0 }}>{order.vendorName}</dd>
          <dt>Partner</dt>
          <dd style={{ margin: 0 }}>{order.partnerName ?? "Unassigned"}</dd>
        </dl>
        <table>
          <tbody>
            {order.items.map((i, k) => (
              <tr key={k}>
                <td>
                  {i.quantity} × {i.name}
                </td>
                <td style={{ textAlign: "right" }}>{formatINR(i.quantity * i.unitPricePaise)}</td>
              </tr>
            ))}
            <tr>
              <td>Delivery fee</td>
              <td style={{ textAlign: "right" }}>{formatINR(order.deliveryFeePaise)}</td>
            </tr>
            <tr>
              <td>
                <strong>Total</strong>
              </td>
              <td style={{ textAlign: "right" }}>
                <strong>{formatINR(order.totalPaise)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        {(order.status === "ready" || order.status === "assigned") && (
          <AssignPartner order={order} onAssigned={onChanged} />
        )}
        <OrderHistory id={order.id} business={order.business} />
        {cancelling && (
          <Input
            label="Reason for cancelling"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Restaurant closed early"
          />
        )}
      </div>
      <footer>
        {next.length === 0 && <span>No further steps for this order.</span>}
        {cancelling ? (
          <>
            <Button onClick={() => setCancelling(false)}>Keep order</Button>
            <Button
              danger
              disabled={!reason.trim() || change.isPending}
              onClick={() => run("cancelled", reason.trim())}
            >
              Cancel order
            </Button>
          </>
        ) : (
          // Assigning needs a partner, so it happens in the picker above, not here.
          next
            .filter((to) => to !== "assigned")
            .map((to) =>
              to === "cancelled" ? (
                <Button danger key={to} onClick={() => setCancelling(true)}>
                  Cancel order
                </Button>
              ) : (
                <Button
                  primary={
                    !(order.status === "assigned" && to === "ready") &&
                    !(order.status === "refund_requested" && to === "delivered")
                  }
                  key={to}
                  disabled={change.isPending}
                  onClick={() => run(to)}
                >
                  {order.status === "assigned" && to === "ready"
                    ? "Unassign partner"
                    : order.status === "refund_requested" && to === "delivered"
                      ? "Decline refund"
                      : `Mark ${orderStatusLabel(order.business, to).toLowerCase()}`}
                </Button>
              ),
            )
        )}
      </footer>
    </Modal>
  )
}

/** Pick an on-shift partner in the order's area and business. */
function AssignPartner({ order, onAssigned }: { order: Order; onAssigned: (o: Order) => void }) {
  const candidates = useOrderCandidates(order.id, true)
  const assign = useAssignPartner()
  const [partnerId, setPartnerId] = useState("")
  const free = (candidates.data ?? []).filter((p) => p.availability === "available")
  const busy = (candidates.data ?? []).filter((p) => p.availability !== "available")
  return (
    <section className="assign-box">
      <strong>
        {order.partnerName ? "Reassign delivery partner" : "Assign a delivery partner"}
      </strong>
      <div>
        <Select label="Partner" value={partnerId} onChange={setPartnerId}>
          <option value="">
            {candidates.isLoading
              ? "Loading partners…"
              : free.length
                ? "Choose an online partner"
                : "No partner is free in this area"}
          </option>
          {free
            .filter((p) => p.id !== order.partnerId)
            .map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {p.code} ·{" "}
                {vehicleLabel[p.vehicleType as keyof typeof vehicleLabel] ?? p.vehicleType}
              </option>
            ))}
          {busy.map((p) => (
            <option value={p.id} key={p.id} disabled>
              {p.name} · on delivery ({p.carrying})
            </option>
          ))}
        </Select>
        <Button
          primary
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
        </Button>
      </div>
      {assign.isError && (
        <p className="rejection-error" role="alert">
          {assign.error instanceof ApiError ? assign.error.message : "Couldn't assign the partner."}
        </p>
      )}
    </section>
  )
}

/** Every status change, oldest first, with who made it. */
function OrderHistory({ id, business }: { id: string; business: Order["business"] }) {
  const detail = useOrder(id)
  const events = detail.data?.events ?? []
  const who = (e: (typeof events)[number]) =>
    e.actorName ??
    { app: "Customer app", partner: "Partner app", seed: "Demo data", system: "System" }[
      e.actorType
    ] ??
    e.actorType
  return (
    <section className="order-history">
      <strong>History</strong>
      {!detail.data && <small>Loading history…</small>}
      <ol className="timeline">
        {events.map((e, i) => (
          <li key={i}>
            <i />
            <b>
              {orderStatusLabel(business, e.to)}
              {e.reason && ` · ${e.reason}`}
            </b>
            <small>
              {placedLabel(e.at)} · {who(e)}
            </small>
          </li>
        ))}
      </ol>
    </section>
  )
}
