"use client"

import { businessName, roleName, type Business } from "@zoauro/shared"
import {
  ArrowRight,
  Coffee,
  Gift,
  IceCreamCone,
  Lock,
  LockKeyhole,
  LogOut,
  Package,
  Pizza,
  Sandwich,
  Shirt,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Soup,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { AdminBrand } from "@/components/admin/ui"
import { LoginToast } from "@/components/login-toast"
import { Badge, IconButton, Logo } from "@/components/super/ui"
import { useDashboardOverview } from "@/lib/dashboard"
import { useLogout, useMe, useOrderSummary } from "@/lib/session"

const copy: Record<Business, string> = {
  food: "Restaurant orders, preparation, food delivery partners, revenue and customer issues.",
  mart: "Marketplace orders, sellers, inventory, parcel shipments, revenue and returns.",
}
const icon: Record<Business, LucideIcon> = { food: UtensilsCrossed, mart: ShoppingBag }
// Decorative background: food icons drift on the left, mart icons on the right.
const art: LucideIcon[] = [
  Pizza,
  Coffee,
  Soup,
  Sandwich,
  IceCreamCone,
  UtensilsCrossed,
  ShoppingCart,
  Package,
  Shirt,
  Smartphone,
  Gift,
  ShoppingBag,
]

export default function WorkspacePage() {
  const me = useMe()
  const summary = useOrderSummary()
  const logout = useLogout()
  const router = useRouter()
  if (!me.data) return <div className="super-ui" />

  const counts = (b: Business) => summary.data?.find((s) => s.business === b)
  const stat = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("en-IN"))

  if (me.data.role === "super_admin")
    return (
      <div className="super-ui">
        <main className="workspace-page">
          <header className="workspace-header">
            <Logo />
            <span>
              <ShieldCheck size={16} /> Secure Super Admin session
            </span>
            <IconButton icon={LogOut} label="Sign out" onClick={() => logout.mutate()} />
          </header>
          <div className="workspace-bg" aria-hidden="true">
            {art.map((ArtIcon, i) => (
              <ArtIcon key={i} />
            ))}
          </div>
          <section className="workspace-content">
            <small>STEP 2 OF 2</small>
            <div className="workspace-title">Select your workspace</div>
            <p>
              Revenue, notifications, dashboards and operational records remain separated by
              business.
            </p>
            <div className="workspace-grid">
              {me.data.businesses.map((b) => {
                const Icon = icon[b]
                return (
                  <button
                    type="button"
                    className={`workspace-card ${b}`}
                    onClick={() => router.push(`/super/dashboard?business=${b}`)}
                    key={b}
                  >
                    <div className="workspace-card-top">
                      <span>
                        <Icon size={23} />
                      </span>
                      <Badge tone="success">● Access granted</Badge>
                    </div>
                    <strong>{businessName[b]}</strong>
                    <p>{copy[b]}</p>
                    <div className="workspace-stats">
                      <span>
                        <b>{stat(counts(b)?.open)}</b> open orders
                      </span>
                      <span>
                        <b>{stat(counts(b)?.total)}</b> orders on record
                      </span>
                    </div>
                    <footer>
                      Open {businessName[b]} Administration
                      <ArrowRight size={17} />
                    </footer>
                  </button>
                )
              })}
            </div>
            <div className="workspace-security">
              <LockKeyhole size={15} />
              Business dashboards, revenue and alerts update to the selected workspace.
            </div>
          </section>
        </main>
        <LoginToast />
      </div>
    )

  return (
    <div className="admin-ui">
      <main className="select-shell">
        <header>
          <AdminBrand />
          <div className="secure-user">
            <ShieldCheck className="icon" size={17} /> Secure session{" "}
            <span>{me.data.initials}</span>
          </div>
        </header>
        <section className="select-content">
          <div className="step-label">STEP 2 OF 2</div>
          <h1>Select your workspace</h1>
          <p>Your access is role-based. Business records and operations remain fully separated.</p>
          <div className="business-grid">
            {me.data.businesses.map((b) => {
              const Icon = b === "food" ? UtensilsCrossed : Package
              return (
                <button
                  key={b}
                  onClick={() => router.push(`/admin/${b}/dashboard`)}
                  className={`business-card ${b}-card`}
                >
                  <span className="business-logo">
                    <Icon className="icon" size={30} />
                  </span>
                  <span className="badge badge-success">
                    <i />
                    Access granted
                  </span>
                  <h2>{businessName[b]}</h2>
                  <p>{copy[b]}</p>
                  <WorkspaceStats business={b} />
                  <div className="enter">
                    Open {b === "food" ? "Food" : "Mart"} Administration{" "}
                    <ArrowRight className="icon" size={18} />
                  </div>
                </button>
              )
            })}
          </div>
          <div className="access-note">
            <Lock className="icon" size={18} />
            <span>
              You’ll only see modules and actions permitted for your{" "}
              <strong>{roleName[me.data.role]}</strong> role.
            </span>
          </div>
        </section>
      </main>
      <LoginToast />
    </div>
  )
}

/** Orders placed today and partners online for one business, within the admin's zones. */
function WorkspaceStats({ business }: { business: Business }) {
  const q = useDashboardOverview(business, "today")
  const m = q.data?.metrics
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString("en-IN"))
  return (
    <div className="business-stats">
      <span>
        <b>{n(m?.orders.value)}</b> orders today
      </span>
      <span>
        <b>{n(m?.partnersOnline.value)}</b> active partners
      </span>
    </div>
  )
}
