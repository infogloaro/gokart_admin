"use client"
// The notifications page for both portals: stored updates (mark as read, delete) and the
// approvals and orders that still need action. Same look in the Admin and Super Admin portals.
import type { Business } from "@zoauro/shared"
import { Bell, Bike, Check, CheckCheck, ShoppingBag, Store, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useNotificationFeed } from "@/components/notification-center"
import {
  useDeleteNotification,
  useDeleteReadNotifications,
  useMarkRead,
  useStoredNotifications,
} from "@/lib/operations"
import { useMe } from "@/lib/session"
import "./notifications-inbox.css"

const age = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} hr`
  return `${Math.round(minutes / (60 * 24))} d`
}

const KIND_ICON = { vendor: Store, partner: Bike, order: ShoppingBag, update: Bell } as const

export function NotificationsInbox({
  business,
  portal,
  title,
  subtitle,
}: {
  business: Business | "all"
  portal: "admin" | "super"
  title: string
  subtitle: string
}) {
  const me = useMe()
  const [tab, setTab] = useState<"updates" | "action">("updates")
  const [unreadOnly, setUnreadOnly] = useState(false)
  const stored = useStoredNotifications(unreadOnly, 50)
  const markRead = useMarkRead()
  const remove = useDeleteNotification()
  const removeRead = useDeleteReadNotifications()
  const feed = useNotificationFeed(business, me.data?.permissions ?? [], portal, 20)
  const pending = feed.items.filter((item) => item.kind !== "update")
  const unread = stored.data?.unread ?? 0
  const readCount = (stored.data?.items ?? []).filter((n) => n.readAt).length
  const updatesHome =
    portal === "admin" && business !== "all"
      ? `/admin/${business}/notifications`
      : "/super/dashboard"

  return (
    <div className="notifications-page">
      <header className="notifications-head">
        {/* The Super Admin shell already shows the screen title and subtitle. */}
        {portal === "admin" ? (
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        ) : (
          <span />
        )}
        <div className="notifications-head-actions">
          <span className={`notifications-unread${unread ? " has" : ""}`}>{unread} unread</span>
          {tab === "updates" && readCount > 0 && (
            <button
              type="button"
              className="notifications-action notifications-action-danger"
              disabled={removeRead.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${readCount} read notification${readCount === 1 ? "" : "s"}? Unread ones stay.`,
                  )
                )
                  removeRead.mutate()
              }}
            >
              <Trash2 size={15} /> Delete read
            </button>
          )}
          {tab === "updates" && unread > 0 && (
            <button
              type="button"
              className="notifications-action"
              onClick={() => markRead.mutate("all")}
            >
              <CheckCheck size={15} /> Mark all as read
            </button>
          )}
        </div>
      </header>

      <div className="gk-segment" role="tablist" aria-label="Notifications">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "updates"}
          className={tab === "updates" ? "active" : ""}
          onClick={() => setTab("updates")}
        >
          Updates {unread > 0 && <b>{unread}</b>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "action"}
          className={tab === "action" ? "active" : ""}
          onClick={() => setTab("action")}
        >
          Needs action {pending.length > 0 && <b>{pending.length}</b>}
        </button>
        {tab === "updates" && (
          <label className="gk-toggle">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            <span />
            Unread only
          </label>
        )}
      </div>

      {tab === "updates" ? (
        <ul className="gk-inbox">
          {stored.data?.items.map((n, i) => (
            <li
              key={n.id}
              className={n.readAt ? "" : "unread"}
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <Link href={n.link ?? updatesHome} onClick={() => !n.readAt && markRead.mutate(n.id)}>
                <span className="gk-inbox-icon">
                  <Bell className="icon" size={17} />
                </span>
                <span className="gk-inbox-copy">
                  <strong>{n.title}</strong>
                  <small>{n.body}</small>
                </span>
                <time dateTime={n.createdAt}>{age(n.createdAt)} ago</time>
              </Link>
              <div className="notifications-row-actions">
                {!n.readAt && (
                  <button
                    type="button"
                    className="gk-inbox-read"
                    onClick={() => markRead.mutate(n.id)}
                    aria-label={`Mark “${n.title}” as read`}
                    title="Mark as read"
                  >
                    <Check className="icon" size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="notifications-delete"
                  onClick={() => {
                    if (window.confirm(`Delete “${n.title}”? This cannot be undone.`))
                      remove.mutate(n.id)
                  }}
                  disabled={remove.isPending}
                  aria-label={`Delete “${n.title}”`}
                  title="Delete notification"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
          {stored.data && stored.data.items.length === 0 && (
            <li className="gk-inbox-empty">
              <CheckCheck size={26} />
              {unreadOnly ? "No unread notifications." : "No notifications yet."}
            </li>
          )}
        </ul>
      ) : (
        <>
          {feed.hasError && (
            <p className="notifications-error" role="alert">
              Some items couldn’t be loaded. Check your access or try again.
            </p>
          )}
          <ul className="gk-inbox">
            {pending.map((item) => {
              const Icon = KIND_ICON[item.kind]
              return (
                <li key={item.id}>
                  <Link href={item.href}>
                    <span className="gk-inbox-icon">
                      <Icon className="icon" size={17} />
                    </span>
                    <span className="gk-inbox-copy">
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <time dateTime={item.createdAt}>{age(item.createdAt)} ago</time>
                  </Link>
                </li>
              )
            })}
          </ul>
          {!feed.loading && pending.length === 0 && (
            <p className="admin-empty">Nothing is waiting on you.</p>
          )}
        </>
      )}
    </div>
  )
}
