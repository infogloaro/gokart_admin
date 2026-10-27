"use client"

import { businessName, roleName, type Business } from "@zoauro/shared"
import {
  Activity,
  Bell,
  Building2,
  ChevronDown,
  ChevronLeft,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
} from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { LoginToast } from "@/components/login-toast"
import { TwoStepSettings } from "@/components/two-step-settings"
import { superNav, superScreens } from "@/lib/navigation"
import { useLogout, useMe } from "@/lib/session"
import { IconButton, Input, Logo, Modal } from "./ui"

export type BusinessFilter = "all" | Business
const filterName: Record<BusinessFilter, string> = { all: "All Businesses", ...businessName }

export function useBusinessFilter(): BusinessFilter {
  const b = useSearchParams().get("business")
  return b === "food" || b === "mart" ? b : "all"
}

export function SuperShell({ children }: { children: ReactNode }) {
  const me = useMe()
  const logout = useLogout()
  const router = useRouter()
  const pathname = usePathname()
  const business = useBusinessFilter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [profile, setProfile] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const [search, setSearch] = useState(false)
  const [security, setSecurity] = useState(false)

  const page = pathname.split("/")[2] ?? "dashboard"
  const screen = superScreens.find((s) => s.key === page)
  const href = (key: string, b: BusinessFilter = business, extra = "") =>
    `/super/${key}${b === "all" ? (extra ? `?${extra}` : "") : `?business=${b}${extra ? `&${extra}` : ""}`}`
  const go = (key: string) => {
    router.push(href(key))
    setMobile(false)
    setProfile(false)
  }

  // Admins have their own portal.
  const wrongRole = me.data && me.data.role !== "super_admin"
  useEffect(() => {
    if (wrongRole) router.replace("/workspace")
  }, [wrongRole, router])

  if (!me.data || wrongRole) return null
  const can = (p: string) => me.data.permissions.includes(p as never)

  return (
    <div className="shell">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobile ? "open" : ""}`}>
        <div className="side-top">
          <Logo compact={collapsed} />
          <IconButton
            icon={collapsed ? Menu : ChevronLeft}
            label="Toggle sidebar"
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>
        <div className="admin-pill">
          <b>{me.data.initials}</b>
          {!collapsed && (
            <span>
              <strong>{roleName[me.data.role]}</strong>
              <small>Full platform access</small>
            </span>
          )}
        </div>
        <nav>
          {superNav.map((g) => (
            <div className="nav-group" key={g.group}>
              {!collapsed && <small>{g.group}</small>}
              {g.items
                .filter(
                  (s) =>
                    can(s.permission) &&
                    (business === "all" ||
                      (s.key !== (business === "food" ? "martRevenue" : "foodRevenue") &&
                        !(business === "food" && s.key === "inventory"))),
                )
                .map((s) => (
                  <button
                    type="button"
                    className={page === s.key ? "active" : ""}
                    onClick={() => go(s.key)}
                    title={s.label}
                    key={s.key}
                    aria-current={page === s.key ? "page" : undefined}
                  >
                    <s.icon size={18} />
                    {!collapsed && <span>{s.label}</span>}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="side-bottom">
          <button type="button" onClick={() => logout.mutate()}>
            <LogOut size={18} />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>
      <div className={`main ${collapsed ? "expanded" : ""}`}>
        <header className="topbar">
          <IconButton icon={Menu} label="Menu" onClick={() => setMobile(!mobile)} />
          <button type="button" className="search" onClick={() => setSearch(true)}>
            <Search size={17} />
            <span>Search orders, vendors, partners…</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="top-actions">
            <label className="business-switch">
              <Building2 size={16} />
              <select
                value={business}
                onChange={(e) => router.push(href(page, e.target.value as BusinessFilter))}
                aria-label="Business"
              >
                <option value="all">All Businesses</option>
                {me.data.businesses.map((b) => (
                  <option value={b} key={b}>
                    {businessName[b]}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <IconButton
              icon={Bell}
              label="Notifications"
              onClick={() => setNotifications(!notifications)}
            />
            <button
              type="button"
              className="profile"
              onClick={() => setProfile(!profile)}
              aria-expanded={profile}
            >
              <b>{me.data.initials}</b>
              <span>
                {me.data.name}
                <small>{roleName[me.data.role]}</small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        <main className="content">
          {screen && (
            <div className="page-head">
              <div>
                <small>{filterName[business].toUpperCase()}</small>
                <div>{screen.title}</div>
                <p>{screen.subtitle}</p>
              </div>
              {/* Screens render their header actions here through a portal. */}
              <aside id="page-head-actions" />
            </div>
          )}
          {children}
        </main>
      </div>
      {profile && (
        <div className="popover">
          <div>
            <b>{me.data.initials}</b>
            <span>
              {me.data.name}
              <small>{me.data.email}</small>
            </span>
          </div>
          <button type="button" onClick={() => go("audit")}>
            <Activity size={16} />
            My activity
          </button>
          <button
            type="button"
            onClick={() => {
              setProfile(false)
              setSecurity(true)
            }}
          >
            <ShieldCheck size={16} />
            Two-step verification
          </button>
          <button type="button" onClick={() => router.push("/workspace")}>
            <Building2 size={16} />
            Change workspace
          </button>
          <button type="button" onClick={() => logout.mutate()}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
      {notifications && (
        <div className="popover">
          <div>
            <span>
              Notifications
              <small>Nothing new. Alerts for approvals and exceptions will appear here.</small>
            </span>
          </div>
        </div>
      )}
      {security && (
        <Modal
          title="Two-step verification"
          subtitle="How you confirm it's you when signing in."
          close={() => setSecurity(false)}
          wide
        >
          <div className="modal-body">
            <TwoStepSettings />
          </div>
        </Modal>
      )}
      {search && (
        <SearchModal
          close={() => setSearch(false)}
          open={(q) => router.push(href("orders", business, `search=${encodeURIComponent(q)}`))}
        />
      )}
      <LoginToast />
    </div>
  )
}

function SearchModal({ close, open }: { close: () => void; open: (q: string) => void }) {
  const [q, setQ] = useState("")
  return (
    <Modal
      title="Search GoKart"
      subtitle="Find an order by code, customer or vendor."
      close={close}
    >
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault()
          if (!q.trim()) return
          open(q.trim())
          close()
        }}
      >
        <Input
          icon={Search}
          placeholder="Try “ZOF-88219” or “Saffron Table”"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
    </Modal>
  )
}
