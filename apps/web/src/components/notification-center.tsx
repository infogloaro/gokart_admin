"use client"

import { businessName, type Business, type Permission } from "@zoauro/shared"
import { AlertCircle, Bell, Bike, Megaphone, PackageCheck, Store } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { useMarkRead, useStoredNotifications } from "@/lib/operations"
import { useOrders } from "@/lib/orders"
import { usePartners } from "@/lib/partners"
import { useVendors } from "@/lib/vendors"

const REFRESH_INTERVAL = 30_000
const ITEMS_PER_TYPE = 5

export type NotificationItem = {
  id: string
  title: string
  detail: string
  createdAt: string
  href: string
  kind: "vendor" | "partner" | "order" | "update"
  /** Stored notifications: marked read when opened. */
  storedId?: string
}

/** Pending approvals and new orders, shared by the bell, the sidebar badge and the Notifications page. */
export function useNotificationFeed(
  business: Business | "all",
  permissions: readonly Permission[],
  portal: "admin" | "super",
  perType = ITEMS_PER_TYPE,
) {
  const canViewVendors = permissions.includes("vendors.view")
  const canViewPartners = permissions.includes("partners.view")
  const canViewOrders = permissions.includes("orders.view")
  const vendorBusiness = business === "all" ? undefined : business
  const vendors = useVendors(
    {
      business: vendorBusiness,
      status: "pending_review",
      sort: "newest",
      page: 1,
      pageSize: perType,
    },
    REFRESH_INTERVAL,
    canViewVendors,
  )
  const partners = usePartners(
    {
      business: vendorBusiness,
      status: "pending_approval",
      sort: "newest",
      page: 1,
      pageSize: perType,
    },
    REFRESH_INTERVAL,
    canViewPartners,
  )
  const orders = useOrders(
    {
      business: vendorBusiness,
      status: "placed",
      page: 1,
      pageSize: perType,
    },
    canViewOrders,
    REFRESH_INTERVAL,
  )

  const stored = useStoredNotifications(true, perType)

  const items = useMemo(() => {
    const result: NotificationItem[] = []
    for (const n of stored.data?.items ?? [])
      result.push({
        id: `update:${n.id}`,
        kind: "update",
        storedId: n.id,
        title: n.title,
        detail: n.body,
        createdAt: n.createdAt,
        href:
          n.link ?? (portal === "admin" ? `/admin/${business}/notifications` : "/super/dashboard"),
      })
    for (const vendor of vendors.data?.items ?? []) {
      result.push({
        id: `vendor:${vendor.id}`,
        kind: "vendor",
        title: vendor.name,
        detail: `${vendor.code} · ${businessName[vendor.business]} · Awaiting review`,
        createdAt: vendor.createdAt,
        href:
          portal === "admin"
            ? `/admin/${business}/vendors?search=${encodeURIComponent(vendor.code)}`
            : `/super/vendors?business=${vendor.business}&search=${encodeURIComponent(vendor.code)}`,
      })
    }
    for (const partner of partners.data?.items ?? []) {
      result.push({
        id: `partner:${partner.id}`,
        kind: "partner",
        title: partner.name,
        detail: `${partner.code} · Delivery partner application`,
        createdAt: partner.createdAt,
        href:
          portal === "admin"
            ? `/admin/${business}/partners?search=${encodeURIComponent(partner.code)}`
            : `/super/partners?search=${encodeURIComponent(partner.code)}`,
      })
    }
    for (const order of orders.data?.items ?? []) {
      result.push({
        id: `order:${order.id}`,
        kind: "order",
        title: `New order ${order.code}`,
        detail: `${order.vendorName} · ${businessName[order.business]}`,
        createdAt: order.placedAt,
        href:
          portal === "admin"
            ? `/admin/${business}/orders?search=${encodeURIComponent(order.code)}`
            : `/super/orders?${business === "all" ? "" : `business=${business}&`}search=${encodeURIComponent(order.code)}`,
      })
    }
    return result.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }, [business, orders.data, partners.data, portal, vendors.data, stored.data])

  const count =
    (canViewVendors ? (vendors.data?.total ?? 0) : 0) +
    (canViewPartners ? (partners.data?.total ?? 0) : 0) +
    (canViewOrders ? (orders.data?.total ?? 0) : 0) +
    (stored.data?.unread ?? 0)
  const hasError =
    (canViewVendors && vendors.isError) ||
    (canViewPartners && partners.isError) ||
    (canViewOrders && orders.isError)
  const loading =
    (canViewVendors && vendors.isPending) ||
    (canViewPartners && partners.isPending) ||
    (canViewOrders && orders.isPending)
  return { items, count, hasError, loading }
}

export function NotificationCenter({
  business,
  permissions,
  portal,
}: {
  business: Business | "all"
  permissions: readonly Permission[]
  portal: "admin" | "super"
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { items, count, hasError, loading } = useNotificationFeed(business, permissions, portal)
  const markRead = useMarkRead()
  const Icon = portal === "super" ? "super" : "admin"

  const openItem = (item: NotificationItem) => {
    if (item.storedId) markRead.mutate(item.storedId)
    setOpen(false)
    router.push(item.href)
  }

  return (
    <div className={`notification-center ${Icon}`}>
      <button
        type="button"
        className={`notification-trigger${count > 0 && !open ? " has-unread" : ""}`}
        aria-label={`Notifications${count ? `, ${count} pending` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="notification-count" aria-live="polite">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="notification-dismiss-layer"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <section className="notification-panel" role="dialog" aria-label="Notifications">
            <header>
              <span>
                <strong>Notifications</strong>
                <small>
                  {count
                    ? `${count.toLocaleString("en-IN")} item${count === 1 ? "" : "s"} need attention`
                    : "New requests and orders"}
                </small>
              </span>
              {count > 0 && <b className="notification-header-count">{count}</b>}
            </header>
            <div className="notification-list" aria-live="polite">
              {loading && <p className="notification-state">Checking for new activity…</p>}
              {!loading && items.length === 0 && !hasError && (
                <p className="notification-state">
                  You’re all caught up. No new requests or orders.
                </p>
              )}
              {items.map((item) => {
                const ItemIcon =
                  item.kind === "vendor"
                    ? Store
                    : item.kind === "partner"
                      ? Bike
                      : item.kind === "update"
                        ? Megaphone
                        : PackageCheck
                return (
                  <button
                    type="button"
                    className="notification-item"
                    key={item.id}
                    onClick={() => openItem(item)}
                  >
                    <span className={`notification-item-icon ${item.kind}`}>
                      <ItemIcon size={17} />
                    </span>
                    <span className="notification-item-copy">
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </span>
                  </button>
                )
              })}
              {hasError && (
                <p className="notification-error" role="alert">
                  <AlertCircle size={16} />
                  Some notifications couldn’t be loaded. Check your access or try again.
                </p>
              )}
              {count > items.length && (
                <p className="notification-more">
                  {`${(count - items.length).toLocaleString("en-IN")} more pending items`}
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
