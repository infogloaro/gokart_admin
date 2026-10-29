"use client"
import Link from "next/link"
import { useMemo, useState } from "react"

export type AdminWorkspace = {
  label: string
  revenue: string
  orders: string
  vendors: string
  menu: string[]
  metrics: Array<[string, string, string]>
}
export const FOOD: AdminWorkspace = {
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
  metrics: [
    ["Total orders", "15,284", "+12.4%"],
    ["Gross order value", "₹74.2L", "+8.7%"],
    ["Platform revenue", "₹12.6L", "+10.8%"],
    ["Active vendors", "184", "+18"],
    ["Delivery partners", "186", "+9"],
    ["Pending orders", "146", "-4.1%"],
    ["Open complaints", "23", "+3"],
    ["Pending approvals", "—", "Review"],
  ],
}
export const MART: AdminWorkspace = {
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
  metrics: [
    ["Total orders", "9,608", "+12.4%"],
    ["Gross order value", "₹1.10Cr", "+8.7%"],
    ["Platform revenue", "₹12.1L", "+10.8%"],
    ["Active vendors", "244", "+18"],
    ["Delivery partners", "186", "+9"],
    ["Pending orders", "146", "-4.1%"],
    ["Open complaints", "23", "+3"],
    ["Pending approvals", "16", "Review"],
  ],
}
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

export default function AdministrationView({
  workspaceId,
  section,
  data,
}: {
  workspaceId: string
  section?: string
  data: AdminWorkspace
}) {
  const [query, setQuery] = useState("")
  const current = section
    ? (data.menu.find((item) => slugify(item) === section) ?? data.menu[0] ?? "Global dashboard")
    : (data.menu[0] ?? "Global dashboard")
  const matches = useMemo(
    () =>
      query.trim()
        ? data.menu.filter((item) => item.toLowerCase().includes(query.toLowerCase()))
        : [],
    [data.menu, query],
  )
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
        {data.menu.map((item) => (
          <Link
            href={`/admin/${workspaceId}/${slugify(item)}`}
            className={`admin-nav ${item === current ? "active" : ""}`}
            key={item}
          >
            {item}
          </Link>
        ))}
        <Link href="/workspace/select" className="admin-signout">
          ← Select workspace
        </Link>
      </aside>
      <section className="admin-main">
        <header className="admin-header">
          <div className="admin-search-wrap">
            <input
              aria-label="Global search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders, vendors, partners..."
            />
            {matches.length > 0 && (
              <div className="admin-search-results">
                {matches.map((item) => (
                  <Link
                    key={item}
                    href={`/admin/${workspaceId}/${slugify(item)}`}
                    onClick={() => setQuery("")}
                  >
                    {item}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <strong>▥ {data.label}⌄</strong>
          <span>◯ ♧ AM Arjun Menon</span>
        </header>
        <div className="admin-content">
          <small className="admin-kicker">{data.label}</small>
          <h1>{current}</h1>
          <p className="admin-subtitle">
            A live view of {current.toLowerCase()} across your entire platform.
          </p>
          <div className="admin-live">
            <b>{data.label} view</b>
            <span>● Live data</span>
          </div>
          <div className="admin-stats">
            {data.metrics.map(([label, value, change]) => (
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
