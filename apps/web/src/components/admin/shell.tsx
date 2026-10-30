"use client"

import { businessName, roleName, type Business } from "@zoauro/shared"
import {
  Check,
  ChevronDown,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Search,
  ShieldCheck,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { LoginToast } from "@/components/login-toast"
import { NotificationCenter, useNotificationFeed } from "@/components/notification-center"
import { RefreshToastProvider } from "@/components/refresh-toast"
import { adminAccountNav, adminNav } from "@/lib/navigation"
import { useComplaintSummary } from "@/lib/operations"
import { useOrders } from "@/lib/orders"
import { useLogout, useMe } from "@/lib/session"
import { GlobalSearch } from "@/components/super/global-search"
import { AdminBrand } from "./ui"

export function AdminShell({ business, children }: { business: Business; children: ReactNode }) {
  const me = useMe()
  const logout = useLogout()
  const router = useRouter()
  const pathname = usePathname()
  const [mobile, setMobile] = useState(false)
  const [search, setSearch] = useState(false)
  const page = pathname.split("/")[3] ?? "dashboard"
  // Sidebar counts: open exceptions (same queries as the Complaints screen) and pending notifications.
  const canOrders = Boolean(me.data?.permissions.includes("orders.view"))
  const delayed = useOrders({ business, delayed: "true", page: 1, pageSize: 1 }, canOrders)
  const complaints = useComplaintSummary(
    business,
    Boolean(me.data?.permissions.includes("complaints.view")),
  )
  const c = complaints.data
  const feed = useNotificationFeed(business, me.data?.permissions ?? [], "admin")
  const badge: Record<string, number> = {
    complaints: (delayed.data?.total ?? 0) + (c ? c.open + c.inReview + c.escalated : 0),
    notifications: feed.count,
  }
  const count = (key: string) =>
    badge[key] ? (
      <b aria-label={`${badge[key]} pending`}>{badge[key]! > 99 ? "99+" : badge[key]}</b>
    ) : null

  // Ctrl+K / ⌘K opens search from anywhere in the portal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearch(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const noAccess = me.data && (me.data.role !== "admin" || !me.data.businesses.includes(business))
  useEffect(() => {
    if (noAccess) router.replace("/workspace")
  }, [noAccess, router])
  if (!me.data || noAccess) return null

  const go = (key: string) => {
    router.push(`/admin/${business}/${key}`)
    setMobile(false)
  }
  // Inventory is a GLOARO MART module.
  const items = adminNav.filter(
    (s) =>
      me.data.permissions.includes(s.permission) && (s.key !== "inventory" || business === "mart"),
  )
  const vendorLabel = business === "food" ? "Restaurants" : "Sellers"
  const BusinessIcon = business === "food" ? UtensilsCrossed : Package

  return (
    <RefreshToastProvider>
      <div className="portal">
        <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
          <div className="side-top">
            <AdminBrand />
            <button
              className="mobile-close"
              onClick={() => setMobile(false)}
              aria-label="Close menu"
            >
              <X className="icon" size={20} />
            </button>
          </div>
          <div className={`business-chip ${business}`}>
            <span>
              <BusinessIcon className="icon" size={18} />
            </span>
            <div>
              <small>CURRENT BUSINESS</small>
              <strong>{businessName[business]}</strong>
            </div>
          </div>
          <nav>
            <small className="nav-label">OPERATIONS</small>
            {items.map((s) => (
              <button
                key={s.key}
                className={page === s.key ? "active" : ""}
                onClick={() => go(s.key)}
                aria-current={page === s.key ? "page" : undefined}
              >
                <s.icon className="icon" size={20} />
                <span>{s.key === "vendors" ? vendorLabel : s.label}</span>
                {count(s.key)}
              </button>
            ))}
            <small className="nav-label support-label">ACCOUNT</small>
            {adminAccountNav.map((s) => (
              <button
                key={s.key}
                className={page === s.key ? "active" : ""}
                onClick={() => go(s.key)}
              >
                <s.icon className="icon" size={20} />
                <span>{s.label}</span>
                {count(s.key)}
              </button>
            ))}
          </nav>
          <div className="side-bottom">
            <button onClick={() => logout.mutate()}>
              <LogOut className="icon" size={20} />
              <span>Log out</span>
            </button>
            <div>
              <ShieldCheck className="icon" size={16} />
              <span>Protected admin session</span>
            </div>
          </div>
        </aside>
        {mobile && (
          <button
            type="button"
            className="mobile-overlay"
            aria-label="Close menu"
            onClick={() => setMobile(false)}
            style={{ border: 0, padding: 0 }}
          />
        )}
        <div className="app-area">
          <header className="topbar">
            <button className="menu-btn" onClick={() => setMobile(true)} aria-label="Open menu">
              <Menu className="icon" size={20} />
            </button>
            <WorkspaceSwitch
              business={business}
              businesses={me.data.businesses}
              open={(b) => router.push(`/admin/${b}/${page}`)}
              all={() => router.push("/workspace")}
            />
            <div className="top-actions">
              <button
                type="button"
                className="top-search"
                onClick={() => setSearch(true)}
                aria-label="Search orders, partners and records"
              >
                <Search className="icon" size={18} />
                <span>
                  Search orders, {business === "food" ? "restaurants" : "sellers"}, partners…
                </span>
                <kbd>Ctrl K</kbd>
              </button>
              <NotificationCenter
                business={business}
                permissions={me.data.permissions}
                portal="admin"
              />
              <button className="profile-button" onClick={() => go("profile")}>
                <span>{me.data.initials}</span>
                <div>
                  <strong>{me.data.name}</strong>
                  <small>{roleName[me.data.role]}</small>
                </div>
                <ChevronDown className="icon" size={14} />
              </button>
            </div>
          </header>
          <main className="content">{children}</main>
          <footer className="app-footer">
            <span>GoKart Operations Hub</span>
            <button onClick={() => router.push("/workspace")}>Switch workspace</button>
          </footer>
        </div>
        {search && (
          <GlobalSearch
            close={() => setSearch(false)}
            open={(to) => router.push(to)}
            screens={[...items, ...adminAccountNav].map((x) =>
              x.key === "vendors" ? { ...x, label: vendorLabel } : x,
            )}
            href={(key, extra) => `/admin/${business}/${key}${extra ? `?${extra}` : ""}`}
            record={(p, b, code) =>
              `/admin/${b ?? business}/${p}?search=${encodeURIComponent(code)}`
            }
          />
        )}
        <LoginToast />
      </div>
    </RefreshToastProvider>
  )
}

/** The topbar business switcher: both workspaces the admin may open, and the workspace page. */
function WorkspaceSwitch({
  business,
  businesses,
  open,
  all,
}: {
  business: Business
  businesses: Business[]
  open: (b: Business) => void
  all: () => void
}) {
  const [show, setShow] = useState(false)
  const Icon = (b: Business) => (b === "food" ? UtensilsCrossed : Package)
  const Current = Icon(business)
  useEffect(() => {
    if (!show) return
    const close = (e: KeyboardEvent) => e.key === "Escape" && setShow(false)
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [show])
  return (
    <div className="workspace-switch">
      <button
        type="button"
        className="current-business"
        onClick={() => setShow(!show)}
        aria-expanded={show}
        aria-haspopup="menu"
      >
        <span className={business}>
          <Current className="icon" size={17} />
        </span>
        <div>
          <small>Current business</small>
          <strong>{businessName[business]}</strong>
        </div>
        <ChevronDown className="icon" size={15} />
      </button>
      {show && (
        <>
          <button
            type="button"
            className="workspace-backdrop"
            aria-label="Close workspace menu"
            onClick={() => setShow(false)}
          />
          <div className="workspace-menu" role="menu">
            <small>Switch workspace</small>
            {businesses.map((b) => {
              const I = Icon(b)
              return (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={b === business}
                  key={b}
                  onClick={() => (setShow(false), b !== business && open(b))}
                >
                  <span className={b}>
                    <I className="icon" size={16} />
                  </span>
                  <span>
                    <strong>{businessName[b]}</strong>
                    <em>
                      {b === "food" ? "Restaurants and food delivery" : "Marketplace and parcels"}
                    </em>
                  </span>
                  {b === business && <Check className="icon" size={16} />}
                </button>
              )
            })}
            <button
              type="button"
              role="menuitem"
              className="all"
              onClick={() => (setShow(false), all())}
            >
              <LayoutGrid className="icon" size={16} />
              <span>
                <strong>All workspaces</strong>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
