"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { DEMO_WORKSPACES } from "@/lib/workspace-api"

const food = {
  label: "ZOAURO FOOD",
  revenue: "₹12.6L",
  orders: "15,284",
  vendors: "184",
  menu: [
    "Global dashboard",
    "Business overview",
    "Food revenue",
    "Vendors",
    "Delivery partners",
    "Orders",
    "Complaints & exceptions",
    "Live tracking",
  ],
}
const mart = {
  label: "GLOARO MART",
  revenue: "₹12.1L",
  orders: "9,608",
  vendors: "244",
  menu: [
    "Global dashboard",
    "Business overview",
    "Mart revenue",
    "Vendors",
    "Delivery partners",
    "Orders",
    "Products & inventory",
    "Complaints & exceptions",
    "Live tracking",
  ],
}

export default function AdministrationPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const data = workspaceId === "gloaro-mart" ? mart : food
  const workspace = DEMO_WORKSPACES.find((item) => item.id === workspaceId)

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/workspace/select" className="admin-logo">
          <b>G</b> GO<span>KART</span>
        </Link>
        <div className="admin-profile">
          <strong>SA</strong>
          <div>
            <b>Super Admin</b>
            <small>Full platform access</small>
          </div>
        </div>
        <p className="admin-section">OVERVIEW</p>
        {data.menu.map((item, index) => (
          <div className={`admin-nav ${index === 0 ? "active" : ""}`} key={item}>
            {item}
          </div>
        ))}
        <Link href="/workspace/select" className="admin-signout">
          ← Select workspace
        </Link>
      </aside>
      <section className="admin-main">
        <header className="admin-header">
          <span>Search orders, vendors, partners...</span>
          <strong>▥ {workspace?.name ?? data.label}⌄</strong>
          <span>◯ ♧ AM Arjun Menon</span>
        </header>
        <div className="admin-content">
          <small className="admin-kicker">{data.label}</small>
          <h1>Command Center</h1>
          <p className="admin-subtitle">A live view of performance across your entire platform.</p>
          <div className="admin-live">
            <b>{data.label} view</b>
            <span>● Live data</span>
          </div>
          <div className="admin-stats">
            {[
              ["Total orders", data.orders, "+12.4%"],
              ["Gross order value", data === food ? "₹74.2L" : "₹1.10Cr", "+8.7%"],
              ["Platform revenue", data.revenue, "+10.8%"],
              ["Active vendors", data.vendors, "+18"],
              ["Delivery partners", "186", "+9"],
              ["Pending orders", "146", "-4.1%"],
              ["Open complaints", "23", "+3"],
              ["Pending approvals", data === food ? "—" : "16", "Review"],
            ].map(([label, value, change]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>
                  {change} <em>vs last period</em>
                </small>
              </article>
            ))}
          </div>
          <div className="admin-panels">
            <div>
              <h2>Revenue trend</h2>
              <p>Platform revenue, excluding vendor gross sales</p>
            </div>
            <div>
              <h2>Order distribution</h2>
              <p>Current order statuses</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
