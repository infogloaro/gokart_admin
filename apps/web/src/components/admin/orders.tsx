"use client"
// Live orders for the Admin portal, with delivery boy assignment and Admin/Partner filters.
import * as Dialog from "@radix-ui/react-dialog"
import { ApiError } from "@zoauro/api-client"
import {
  businessName,
  formatINR,
  ORDER_STATUSES,
  orderStatusLabel,
  type Business,
  type Order,
  type OrderStatus,
} from "@zoauro/shared"
import { Search, X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { useRouter } from "next/router"
import {
  paymentLabel,
  statusTone,
  placedLabel,
  useOrderFilterOptions,
  useOrders,
} from "@/lib/orders"
import { useDeliveryBoys } from "@/lib/delivery"
import { useZones } from "@/lib/session"
import { AdminBadge, AdminButton, PageHeader } from "./ui"

const PAGE_SIZE = 10

import { RiderAssignment } from "./rider-assignment"

function OrderDrawer({ order, close }: { order: Order; close: () => void }) {
  return (
    <Dialog.Root open={true} onOpenChange={() => {}}>
      <Dialog.Content className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="head">
          <small>ORDER DETAILS</small>
          <h2>{order.code}</h2>
          <button onClick={close} className="close-btn">
            <X size={20} />
          </button>
        </div>
        <div className="body">
          <div className="details">
            <strong>Customer:</strong> {order.customerName}
            <br />
            <strong>Vendor:</strong> {order.vendorName}
            <br />
            <strong>Status:</strong> <span>{orderStatusLabel(order.business, order.status)}</span>
            <br />
            <strong>Amount:</strong> {formatINR(order.totalPaise)}
            <br />
            <strong>Placed:</strong> {placedLabel(order.placedAt)}
            <br />
            <strong>Admin:</strong> {order.responsibleAdminName ?? "Unassigned"}
            <br />
            <strong>Delivery Partner:</strong> {order.partnerName ?? "Unassigned"}
          </div>
          <RiderAssignment order={order} />
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}

export function AdminOrders({ business }: { business: Business }) {
  const p = useSearchParams()
  return (
    <OrdersScreen
      key={`${p.get("search")}|${p.get("status")}|${p.get("delayed")}|${p.get("adminId")}|${p.get("deliveryPartnerId")}`}
      business={business}
      linked={{
        search: p.get("search") ?? "",
        status: ORDER_STATUSES.find((s) => s === p.get("status")) ?? "",
        delayed: p.get("delayed") === "true",
        adminId: p.get("adminId") ?? null,
        zoneId: p.get("zoneId") ?? null,
        deliveryPartnerId: p.get("deliveryPartnerId") ?? null,
        boyId: p.get("boyId") ?? null,
        fromDate: p.get("fromDate") ?? null,
        toDate: p.get("toDate") ?? null,
      }}
    />
  )
}

function OrdersScreen({
  business,
  linked,
}: {
  business: Business
  linked: {
    search: string
    status: OrderStatus | ""
    delayed: boolean
    adminId: string | null
    zoneId: string | null
    deliveryPartnerId: string | null
    boyId: string | null
    fromDate: string | null
    toDate: string | null
  }
}) {
  const router = useRouter()
  const [query, setQuery] = useState(linked.search)
  const [status, setStatus] = useState<OrderStatus | "">(linked.status)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Order | null>(null)
  const [adminId, setAdminId] = useState<string | null>(linked.adminId ?? null)
  const [zoneId, setZoneId] = useState<string | null>(linked.zoneId ?? null)
  const [deliveryPartnerId, setDeliveryPartnerId] = useState<string | null>(
    linked.deliveryPartnerId ?? null,
  )
  const [fromDate, setFromDate] = useState<string | null>(linked.fromDate ?? null)
  const [toDate, setToDate] = useState<string | null>(linked.toDate ?? null)
  const [boyId, setBoyId] = useState<string | null>(linked.boyId ?? null)
  const filterOptions = useOrderFilterOptions(business)
  const zones = useZones()
  const riders = useDeliveryBoys({ status: "active", page: 1, pageSize: 100 })

  const orders = useOrders({
    business,
    status: status || undefined,
    search: query.trim() || undefined,
    zoneId: zoneId || undefined,
    adminId: adminId || undefined,
    deliveryPartnerId: deliveryPartnerId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const total = orders.data?.total ?? 0

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
            value={status || ""}
            aria-label="Status"
            onChange={(e) => {
              setStatus(e.target.value === "" ? "" : (e.target.value as OrderStatus))
              setPage(1)
            }}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {orderStatusLabel(business, s)}
              </option>
            ))}
          </select>
          <select
            className="filter-button"
            value={adminId || ""}
            onChange={(e) => {
              const newAdmin = e.target.value === "" ? null : (e.target.value as string)
              setAdminId(newAdmin)
              setPage(1)
            }}
            aria-label="Admin"
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
          <select
            className="filter-button"
            value={zoneId || ""}
            aria-label="Zone"
            onChange={(e) => {
              setZoneId(e.target.value === "" ? null : (e.target.value as string))
              setPage(1)
            }}
          >
            <option value="">All zones</option>
            {zones.data?.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.location}, {zone.city}
              </option>
            ))}
          </select>
          <select
            className="filter-button"
            value={boyId || ""}
            aria-label="Delivery boy"
            onChange={(e) => {
              setBoyId(e.target.value === "" ? null : (e.target.value as string))
              setPage(1)
            }}
          >
            <option value="">All delivery boys</option>
            {riders.data?.items
              ?.map((boy) => ({
                id: boy.id,
                name: boy.name,
                code: boy.code,
              }))
              .map((boy) => (
                <option key={boy.id} value={boy.id}>
                  {boy.name} · {boy.code}
                </option>
              ))}
          </select>
          <label className="filter-button">
            From{" "}
            <input
              type="date"
              value={fromDate || ""}
              onChange={(e) => {
                setFromDate(e.target.value as string)
                setPage(1)
              }}
            />
          </label>
          <label className="filter-button">
            To{" "}
            <input
              type="date"
              value={toDate || ""}
              onChange={(e) => {
                setToDate(e.target.value as string)
                setPage(1)
              }}
            />
          </label>
          <button
            type="button"
            className="filter-button"
            onClick={() => {
              setQuery("")
              setStatus("")
              setAdminId(null)
              setZoneId(null)
              setDeliveryPartnerId(null)
              setBoyId(null)
              setFromDate(null)
              setToDate(null)
              setPage(1)
            }}
          >
            Reset
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
                  <th>Business</th>
                  <th>Vendor</th>
                  <th>Admin</th>
                  <th>Delivery Partner</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.data?.items.map((o) => (
                  <tr key={o.id} onClick={() => setSelected(o)}>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => (e.stopPropagation(), setSelected(o))}
                        style={{ all: "unset", cursor: "pointer" }}
                      >
                        <strong>{o.code}</strong>
                      </button>
                      <small>{businessName[o.business]}</small>
                      <small>{placedLabel(o.placedAt)}</small>
                    </td>
                    <td>{o.customerName}</td>
                    <td>
                      <AdminBadge tone={o.business}>{businessName[o.business]}</AdminBadge>
                    </td>
                    <td>
                      <strong className="vendor-name">{o.vendorName}</strong>
                    </td>
                    <td>
                      <span>{o.responsibleAdminName ?? "Unassigned"}</span>
                    </td>
                    <td>
                      <span>{o.partnerName ?? "Unassigned"}</span>
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
                      {o.sos && <AdminBadge tone="danger">SOS</AdminBadge>}
                    </td>
                    <td>
                      <strong>{formatINR(o.totalPaise)}</strong>
                    </td>
                    <td>
                      {o.deliveryBoyId || o.partnerId ? (
                        <>
                          {o.deliveryBoyId && (
                            <AdminButton
                              kind="secondary"
                              onClick={() => {
                                router.push(`/admin/${business}/orders/${o.id}/assign-boy`)
                              }}
                            >
                              Reassign boy
                            </AdminButton>
                          )}
                          {o.partnerId && (
                            <AdminButton
                              kind="secondary"
                              onClick={() => {
                                router.push(`/admin/${business}/orders/${o.id}/assign`)
                              }}
                            >
                              Reassign partner
                            </AdminButton>
                          )}
                        </>
                      ) : (
                        <AdminButton
                          kind="primary"
                          onClick={() => {
                            router.push(`/admin/${business}/orders/${o.id}/assign`)
                          }}
                        >
                          Assign partner
                        </AdminButton>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={10}>No orders match these filters.</td>
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
      {selected && <OrderDrawer order={selected} close={() => setSelected(null)} />}
    </>
  )
}
