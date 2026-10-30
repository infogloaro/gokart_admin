"use client"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { fetchNotifications } from "@/lib/dashboard-api"
import type { NotificationItem, NotificationKind } from "@/types/dashboard"

const POLL_INTERVAL_MS = 30_000

const KIND_ICON_PATHS: Record<NotificationKind, string> = {
  order: "M12 3 4 7v10l8 4 8-4V7ZM4 7l8 4 8-4M12 11v10",
  vendor:
    "M4 10 5.5 4h13L20 10M4 10a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5 12v8h14v-8M10 20v-5h4v5",
  partner:
    "M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 16l3-6h5l4 6M9 10 8 7H6M13 6h3l1 4",
  complaint: "M5 5h14v10h-7l-4 4v-4H5ZM12 8v3M12 13h.01",
  refund: "M12 3 2 20h20ZM12 9v5M12 17h.01",
  document: "M7 3h7l4 4v14H7ZM14 3v4h4M10 12h5M10 16h5",
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function readSeenAt(key: string): number {
  try {
    return Number(window.localStorage.getItem(key)) || 0
  } catch {
    return 0
  }
}

function writeSeenAt(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Read state is a per-browser convenience; ignore storage failures.
  }
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, close])
  return ref
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function HeaderActions({
  workspaceId,
  workspaceLabel,
  refreshKey,
}: {
  workspaceId: string
  workspaceLabel: string
  refreshKey: string | null
}) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [seenAt, setSeenAt] = useState(0)
  const seenKey = `gokart:notifications-seen:${workspaceId}`

  const closeNotifications = useCallback(() => setNotificationsOpen(false), [])
  const closeProfile = useCallback(() => setProfileOpen(false), [])
  const notificationsRef = useDismiss(notificationsOpen, closeNotifications)
  const profileRef = useDismiss(profileOpen, closeProfile)

  useEffect(() => {
    setSeenAt(readSeenAt(seenKey))
  }, [seenKey])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetchNotifications(workspaceId)
        .then((result) => {
          if (cancelled) return
          setItems(result.items)
          setError(null)
        })
        .catch((err) => {
          if (!cancelled)
            setError(err instanceof Error ? err.message : "Unable to load notifications.")
        })
    void load()
    const timer = window.setInterval(load, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [workspaceId, refreshKey])

  const unread = items.filter((item) => new Date(item.createdAt).getTime() > seenAt)

  function markAllRead() {
    const now = Date.now()
    writeSeenAt(seenKey, now)
    setSeenAt(now)
  }

  return (
    <div className="admin-header-actions">
      <div className="admin-popover-anchor" ref={notificationsRef}>
        <button
          type="button"
          className="admin-icon-btn"
          aria-label={`Notifications${unread.length > 0 ? `, ${unread.length} unread` : ""}`}
          aria-expanded={notificationsOpen}
          onClick={() => {
            setProfileOpen(false)
            setNotificationsOpen((open) => !open)
          }}
        >
          <Icon path="M6 16V11a6 6 0 1 1 12 0v5l2 2H4ZM10 21h4" />
          {unread.length > 0 && <b className="admin-badge">{Math.min(unread.length, 9)}</b>}
        </button>
        {notificationsOpen && (
          <div className="admin-popover admin-notifications" role="dialog">
            <div className="admin-notifications-head">
              <div>
                <h3>{workspaceLabel} notifications</h3>
                <small>
                  {unread.length > 0 ? `${unread.length} unread updates` : "You're all caught up"}
                </small>
              </div>
              <button type="button" aria-label="Close" onClick={closeNotifications}>
                ✕
              </button>
            </div>
            {unread.length > 0 && (
              <button type="button" className="admin-notifications-markall" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
            <ul>
              {error && <li className="admin-notifications-empty">⚠ {error}</li>}
              {!error && items.length === 0 && (
                <li className="admin-notifications-empty">No notifications yet.</li>
              )}
              {items.map((item) => {
                const isUnread = new Date(item.createdAt).getTime() > seenAt
                return (
                  <li key={item.id} className={isUnread ? "is-unread" : ""}>
                    <Link
                      href={`/admin/${workspaceId}/${slugify(item.target)}`}
                      onClick={closeNotifications}
                    >
                      <i className={`admin-notification-icon admin-notification-${item.kind}`}>
                        <Icon path={KIND_ICON_PATHS[item.kind]} />
                      </i>
                      <div>
                        <b>{item.title}</b>
                        <p>{item.message}</p>
                        {item.tags.length > 0 && (
                          <div className="admin-notification-tags">
                            {item.tags.map((tag) => (
                              <em key={tag}>{tag}</em>
                            ))}
                          </div>
                        )}
                        <small>{timeAgo(item.createdAt)}</small>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="admin-popover-anchor" ref={profileRef}>
        <button
          type="button"
          className="admin-profile-btn"
          aria-expanded={profileOpen}
          onClick={() => {
            setNotificationsOpen(false)
            setProfileOpen((open) => !open)
          }}
        >
          <i className="admin-avatar">AM</i>
          <div>
            <b>Arjun Menon</b>
            <small>Super Admin</small>
          </div>
          <em aria-hidden="true">⌄</em>
        </button>
        {profileOpen && (
          <div className="admin-popover admin-profile-menu" role="menu">
            <div className="admin-profile-menu-head">
              <i className="admin-avatar">AM</i>
              <div>
                <b>Arjun Menon</b>
                <small>admin@gokart.in</small>
              </div>
            </div>
            <Link href={`/admin/${workspaceId}/audit-logs`} role="menuitem" onClick={closeProfile}>
              <Icon path="M3 12h4l3-8 4 16 3-8h4" />
              My activity
            </Link>
            <Link href="/workspace/select" role="menuitem">
              <Icon path="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" />
              Sign out
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
