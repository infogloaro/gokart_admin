"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

export type AdminMenuSection = {
  title: string
  items: string[]
}
export type AdminTransaction = {
  id: string
  vendor: string
  status: string
  tag: "FOOD" | "MART"
  amount: string
}
export type AdminAttentionItem = {
  icon: "warning" | "refund" | "docs"
  title: string
  subtitle: string
  target: string
}
export type AdminTrendSeries = {
  label: string
  color: string
  points: number[]
  values: string[]
}
export type AdminOrderSlice = {
  label: string
  value: number
  color: string
}
export type AdminOverviewMetric = {
  label: string
  value: string
  barPercent: number
}
export type AdminOverview = {
  icon: "food" | "mart" | "all"
  description: string
  badge: string
  insight: string
  metrics: AdminOverviewMetric[]
}
export type AdminWorkspace = {
  label: string
  revenue: string
  orders: string
  vendors: string
  sections: AdminMenuSection[]
  metrics: Array<[string, string, string]>
  trend: AdminTrendSeries[]
  orderDistribution: AdminOrderSlice[]
  transactions: AdminTransaction[]
  attention: AdminAttentionItem[]
  overview: AdminOverview
}
const ORDER_DISTRIBUTION: AdminOrderSlice[] = [
  { label: "Delivered", value: 72, color: "#1fa15a" },
  { label: "In progress", value: 18, color: "#2f6fe0" },
  { label: "Cancelled", value: 6, color: "#e2443f" },
  { label: "Refunded", value: 4, color: "#d99700" },
]
const ATTENTION_ITEMS: AdminAttentionItem[] = [
  {
    icon: "warning",
    title: "7 vendor approvals pending",
    subtitle: "Oldest waiting 2 days",
    target: "Vendors",
  },
  {
    icon: "refund",
    title: "3 refunds escalated",
    subtitle: "Total exposure ₹18,420",
    target: "Finance & payouts",
  },
  {
    icon: "docs",
    title: "12 partner documents expiring",
    subtitle: "Within the next 30 days",
    target: "Delivery partners",
  },
]
const FOOD_TRANSACTIONS: AdminTransaction[] = [
  { id: "ZOF-88219", vendor: "Saffron Table", status: "On the Way", tag: "FOOD", amount: "₹1,240" },
  { id: "ZOF-88218", vendor: "The Wok District", status: "Preparing", tag: "FOOD", amount: "₹860" },
  { id: "ZOF-88217", vendor: "Curry Leaf", status: "Delivered", tag: "FOOD", amount: "₹540" },
]
const MART_TRANSACTIONS: AdminTransaction[] = [
  {
    id: "GLM-46093",
    vendor: "Northstar Essentials",
    status: "In Transit",
    tag: "MART",
    amount: "₹3,890",
  },
  { id: "GLM-46092", vendor: "Aster Home Store", status: "Packed", tag: "MART", amount: "₹6,490" },
  { id: "GLM-46091", vendor: "Vista Mart", status: "Delivered", tag: "MART", amount: "₹2,150" },
]
export const FOOD: AdminWorkspace = {
  label: "ZOAURO FOOD",
  revenue: "₹12.6L",
  orders: "15,284",
  vendors: "184",
  sections: [
    {
      title: "OVERVIEW",
      items: ["Global dashboard", "Business overview", "Food revenue"],
    },
    {
      title: "OPERATIONS",
      items: ["Vendors", "Delivery partners", "Orders", "Complaints & exceptions", "Live tracking"],
    },
    {
      title: "FINANCIAL",
      items: ["Transaction ledger", "Finance & payouts", "Reports"],
    },
    {
      title: "SYSTEM",
      items: ["Admin & permissions", "Areas & fees", "Audit logs"],
    },
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
  trend: [
    {
      label: "ZOAURO FOOD",
      color: "#08224b",
      points: [8.9, 9.8, 10.6, 11.4, 12.6],
      values: ["₹8.9L", "₹9.8L", "₹10.6L", "₹11.4L", "₹12.6L"],
    },
  ],
  orderDistribution: ORDER_DISTRIBUTION,
  transactions: FOOD_TRANSACTIONS,
  attention: ATTENTION_ITEMS,
  overview: {
    icon: "food",
    description: "A focused view of today's food operations and service health.",
    badge: "Admin operations",
    insight:
      "Order volume is trending above last week while exception rates remain within the assigned operational threshold.",
    metrics: [
      { label: "Order acceptance", value: "94.8%", barPercent: 95 },
      { label: "Preparation within SLA", value: "88.2%", barPercent: 88 },
      { label: "Delivery completion", value: "96.4%", barPercent: 96 },
      { label: "Customer satisfaction", value: "4.7 / 5", barPercent: 94 },
    ],
  },
}
export const MART: AdminWorkspace = {
  label: "GLOARO MART",
  revenue: "₹12.1L",
  orders: "9,608",
  vendors: "244",
  sections: [
    {
      title: "OVERVIEW",
      items: ["Global dashboard", "Business overview", "Mart revenue"],
    },
    {
      title: "OPERATIONS",
      items: [
        "Vendors",
        "Delivery partners",
        "Orders",
        "Products & inventory",
        "Complaints & exceptions",
        "Live tracking",
      ],
    },
    {
      title: "FINANCIAL",
      items: ["Transaction ledger", "Finance & payouts", "Reports"],
    },
    {
      title: "SYSTEM",
      items: ["Admin & permissions", "Areas & fees", "Audit logs"],
    },
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
  trend: [
    {
      label: "GLOARO MART",
      color: "#d99700",
      points: [8.1, 9.0, 9.6, 10.8, 12.1],
      values: ["₹8.1L", "₹9.0L", "₹9.6L", "₹10.8L", "₹12.1L"],
    },
  ],
  orderDistribution: ORDER_DISTRIBUTION,
  transactions: MART_TRANSACTIONS,
  attention: ATTENTION_ITEMS,
  overview: {
    icon: "mart",
    description: "Marketplace sales, fulfilment and delivery health in one view.",
    badge: "Admin operations",
    insight:
      "Order volume is trending above last week while exception rates remain within the assigned operational threshold.",
    metrics: [
      { label: "Seller confirmation", value: "92.1%", barPercent: 92 },
      { label: "Pack within SLA", value: "86.7%", barPercent: 87 },
      { label: "Shipment completion", value: "95.2%", barPercent: 95 },
      { label: "Customer satisfaction", value: "4.6 / 5", barPercent: 92 },
    ],
  },
}
export const ALL: AdminWorkspace = {
  label: "All Businesses",
  revenue: "₹24.7L",
  orders: "24,892",
  vendors: "428",
  sections: [
    {
      title: "OVERVIEW",
      items: ["Global dashboard", "Business overview", "Food revenue", "Mart revenue"],
    },
    {
      title: "OPERATIONS",
      items: [
        "Vendors",
        "Delivery partners",
        "Orders",
        "Products & inventory",
        "Complaints & exceptions",
        "Live tracking",
      ],
    },
    {
      title: "FINANCIAL",
      items: ["Transaction ledger", "Finance & payouts", "Reports"],
    },
    {
      title: "SYSTEM",
      items: ["Admin & permissions", "Areas & fees", "Audit logs"],
    },
  ],
  metrics: [
    ["Total orders", "24,892", "+12.4%"],
    ["Gross order value", "₹1.84Cr", "+8.7%"],
    ["Platform revenue", "₹24.7L", "+10.8%"],
    ["Active vendors", "428", "+18"],
    ["Delivery partners", "186", "+9"],
    ["Pending orders", "146", "-4.1%"],
    ["Open complaints", "23", "+3"],
    ["Pending approvals", "16", "Review"],
  ],
  trend: [
    {
      label: "ZOAURO FOOD",
      color: "#08224b",
      points: [8.9, 9.8, 10.6, 11.4, 12.6],
      values: ["₹8.9L", "₹9.8L", "₹10.6L", "₹11.4L", "₹12.6L"],
    },
    {
      label: "GLOARO MART",
      color: "#d99700",
      points: [8.1, 9.0, 9.6, 10.8, 12.1],
      values: ["₹8.1L", "₹9.0L", "₹9.6L", "₹10.8L", "₹12.1L"],
    },
  ],
  orderDistribution: ORDER_DISTRIBUTION,
  transactions: [
    FOOD_TRANSACTIONS[0]!,
    MART_TRANSACTIONS[0]!,
    FOOD_TRANSACTIONS[1]!,
    MART_TRANSACTIONS[1]!,
  ],
  attention: ATTENTION_ITEMS,
  overview: {
    icon: "all",
    description: "Service health and fulfilment across every business, as seen by platform admins.",
    badge: "Admin operations",
    insight:
      "Order volume is trending above last week while exception rates remain within the assigned operational threshold.",
    metrics: [
      { label: "Order acceptance / Seller confirmation", value: "93.5%", barPercent: 93 },
      { label: "Prep / Pack within SLA", value: "87.5%", barPercent: 87 },
      { label: "Delivery / Shipment completion", value: "95.8%", barPercent: 96 },
      { label: "Customer satisfaction", value: "4.65 / 5", barPercent: 93 },
    ],
  },
}
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const TREND_DAYS = ["Jun 1", "Jun 5", "Jun 9", "Jun 13", "Jun 18"]

function trendCoords(points: number[], width: number, height: number) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  return points.map((value, index) => {
    const x = index * step
    const y = height - ((value - min) / span) * (height - 12) - 6
    return [x, y] as [number, number]
  })
}

function buildTrendPath(coords: Array<[number, number]>) {
  return coords.reduce((path, [x, y], index) => {
    if (index === 0) return `M ${x} ${y}`
    const [px, py] = coords[index - 1]!
    const midX = (px + x) / 2
    return `${path} C ${midX} ${py}, ${midX} ${y}, ${x} ${y}`
  }, "")
}

function RevenueTrendChart({ series }: { series: AdminTrendSeries[] }) {
  const width = 560
  const height = 180
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const seriesCoords = series.map((item) => trendCoords(item.points, width, height))
  return (
    <div className="admin-chart">
      <div className="admin-chart-legend">
        {series.map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height + 24}`} className="admin-chart-svg">
        {series.map((item, seriesIndex) => (
          <path
            key={item.label}
            d={buildTrendPath(seriesCoords[seriesIndex]!)}
            fill="none"
            stroke={item.color}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}
        {TREND_DAYS.map((day, index) => (
          <text
            key={day}
            x={(index * width) / (TREND_DAYS.length - 1)}
            y={height + 18}
            textAnchor={index === 0 ? "start" : index === TREND_DAYS.length - 1 ? "end" : "middle"}
            className="admin-chart-axis"
          >
            {day}
          </text>
        ))}
        {series.map((item, seriesIndex) =>
          seriesCoords[seriesIndex]!.map(([x, y], pointIndex) => (
            <circle
              key={`${item.label}-${pointIndex}`}
              cx={x}
              cy={y}
              r={activeIndex === pointIndex ? 7 : 5}
              fill={item.color}
              stroke="#fff"
              strokeWidth={2}
              className="admin-chart-point"
              onClick={() =>
                setActiveIndex((current) => (current === pointIndex ? null : pointIndex))
              }
            />
          )),
        )}
        {activeIndex !== null && (
          <g className="admin-chart-tooltip">
            <line
              x1={(activeIndex * width) / (TREND_DAYS.length - 1)}
              y1={0}
              x2={(activeIndex * width) / (TREND_DAYS.length - 1)}
              y2={height}
              className="admin-chart-tooltip-line"
            />
            <foreignObject
              x={Math.min(
                Math.max((activeIndex * width) / (TREND_DAYS.length - 1) - 90, 0),
                width - 180,
              )}
              y={0}
              width={180}
              height={26 + series.length * 20}
            >
              <div className="admin-chart-tooltip-box">
                <b>{TREND_DAYS[activeIndex]}</b>
                {series.map((item) => (
                  <p key={item.label}>
                    <i style={{ background: item.color }} />
                    {item.label}: {item.values[activeIndex]}
                  </p>
                ))}
              </div>
            </foreignObject>
          </g>
        )}
      </svg>
    </div>
  )
}

function OrderDistributionChart({ slices, total }: { slices: AdminOrderSlice[]; total: string }) {
  const radius = 62
  const circumference = 2 * Math.PI * radius
  const totalOrders = Number(total.replace(/[^0-9]/g, "")) || 0
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const activeSlice = slices.find((slice) => slice.label === activeLabel) ?? null
  let offset = 0
  return (
    <div className="admin-donut">
      <svg viewBox="0 0 160 160" className="admin-donut-svg">
        <g transform="rotate(-90 80 80)">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#eef2f8" strokeWidth="18" />
          {slices.map((slice) => {
            const length = (slice.value / 100) * circumference
            const circle = (
              <circle
                key={slice.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={activeLabel === slice.label ? 22 : 18}
                strokeOpacity={activeLabel && activeLabel !== slice.label ? 0.35 : 1}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                className="admin-donut-segment"
                onClick={() =>
                  setActiveLabel((current) => (current === slice.label ? null : slice.label))
                }
              />
            )
            offset += length
            return circle
          })}
        </g>
        <text x="80" y="76" textAnchor="middle" className="admin-donut-total">
          {activeSlice ? `${activeSlice.value}%` : total}
        </text>
        <text x="80" y="96" textAnchor="middle" className="admin-donut-label">
          {activeSlice ? activeSlice.label : "orders"}
        </text>
      </svg>
      <div className="admin-donut-side">
        <ul className="admin-donut-legend">
          {slices.map((slice) => (
            <li key={slice.label}>
              <button
                type="button"
                className={`admin-donut-legend-item ${activeLabel === slice.label ? "is-active" : ""}`}
                onClick={() =>
                  setActiveLabel((current) => (current === slice.label ? null : slice.label))
                }
              >
                <span>
                  <i style={{ background: slice.color }} />
                  {slice.label}
                </span>
                <b>{slice.value}%</b>
              </button>
            </li>
          ))}
        </ul>
        {activeSlice && (
          <p className="admin-donut-detail">
            <b>{activeSlice.label}:</b> ~
            {Math.round((totalOrders * activeSlice.value) / 100).toLocaleString()} of{" "}
            {totalOrders.toLocaleString()} orders ({activeSlice.value}%)
          </p>
        )}
      </div>
    </div>
  )
}

function statusClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized.includes("delivered")) return "is-delivered"
  if (normalized.includes("cancel") || normalized.includes("refund")) return "is-cancelled"
  return "is-progress"
}

const ATTENTION_ICON_PATHS: Record<AdminAttentionItem["icon"], string> = {
  warning: "M12 3 2 20h20Zm0 6v5m0 3h.01",
  refund: "M4 12a8 8 0 1 1 3 6.2M4 12V6m0 6h6",
  docs: "M7 3h7l4 4v14H7ZM13 3v5h5M9 13h6M9 17h6",
}

function AttentionIcon({ icon }: { icon: AdminAttentionItem["icon"] }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={ATTENTION_ICON_PATHS[icon]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function downloadCsv(filenameBase: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${filenameBase}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const OVERVIEW_ICON_PATHS: Record<AdminOverview["icon"], string> = {
  food: "M3 3l18 18M8 3l13 13M3 8l13 13M14 3l7 7",
  mart: "M5 8h14l-1 13H6L5 8ZM8 8V6a4 4 0 0 1 8 0v2",
  all: "M4 5h7v7H4ZM13 5h7v7h-7ZM4 14h7v5H4ZM13 14h7v5h-7Z",
}

function OverviewIcon({ icon }: { icon: AdminOverview["icon"] }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={OVERVIEW_ICON_PATHS[icon]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 5h7v7H4ZM13 5h7v7h-7ZM4 14h7v5H4ZM13 14h7v5h-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function AdministrationView({
  workspaceId,
  section,
  data,
}: {
  workspaceId: string
  section?: string
  data: AdminWorkspace
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false)
  const [dateRange, setDateRange] = useState({ start: "2026-06-01", end: "2026-06-18" })
  const [dateDraft, setDateDraft] = useState(dateRange)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  function formatDateLabel(value: string) {
    const parsed = new Date(`${value}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }
  function applyDateRange() {
    setDateRange(dateDraft)
    setDatePickerOpen(false)
  }
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)
  function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    window.setTimeout(() => {
      setRefreshing(false)
      setLastRefreshed(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    }, 700)
  }
  const dashboardMetrics = data.metrics
  const overviewMetrics = data.overview.metrics
  const flatMenu = data.sections.flatMap((group) => group.items)
  const current = section
    ? (flatMenu.find((item) => slugify(item) === section) ?? flatMenu[0] ?? "Global dashboard")
    : (flatMenu[0] ?? "Global dashboard")
  const searchablePages = [
    ...FOOD.sections
      .flatMap((group) => group.items)
      .map((item) => ({
        item,
        workspaceId: "zoauro-food",
        workspace: FOOD.label,
      })),
    ...MART.sections
      .flatMap((group) => group.items)
      .map((item) => ({
        item,
        workspaceId: "gloaro-mart",
        workspace: MART.label,
      })),
  ]
  const matches = useMemo(
    () =>
      query.trim()
        ? searchablePages.filter(({ item, workspace }) =>
            `${item} ${workspace}`.toLowerCase().includes(query.toLowerCase()),
          )
        : [],
    [query],
  )
  const businesses = [
    { id: "all", label: ALL.label, menu: ALL.sections.flatMap((group) => group.items) },
    { id: "zoauro-food", label: FOOD.label, menu: FOOD.sections.flatMap((group) => group.items) },
    { id: "gloaro-mart", label: MART.label, menu: MART.sections.flatMap((group) => group.items) },
  ]
  function switchWorkspace(targetId: string) {
    setBusinessMenuOpen(false)
    if (targetId === workspaceId) return
    const target = businesses.find((business) => business.id === targetId)
    const targetSection =
      target && current && target.menu.includes(current) ? slugify(current) : undefined
    router.push(targetSection ? `/admin/${targetId}/${targetSection}` : `/admin/${targetId}`)
  }
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
        <div className="admin-nav-scroll">
          {data.sections.map((group) => (
            <div key={group.title}>
              <p className="admin-section">{group.title}</p>
              {group.items.map((item) => (
                <Link
                  href={`/admin/${workspaceId}/${slugify(item)}`}
                  className={`admin-nav ${item === current ? "active" : ""}`}
                  key={item}
                >
                  {item}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <Link href="/workspace/select" className="admin-signout">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="admin-signout-icon">
            <path
              d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Sign out
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
                {matches.map(({ item, workspaceId: resultWorkspace, workspace }) => (
                  <Link
                    key={`${resultWorkspace}-${item}`}
                    href={`/admin/${resultWorkspace}/${slugify(item)}`}
                    onClick={() => setQuery("")}
                  >
                    <b>{item}</b>
                    <small>{workspace}</small>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="admin-business-switch">
            <button
              type="button"
              className="admin-business-trigger"
              onClick={() => setBusinessMenuOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={businessMenuOpen}
            >
              ▥ {data.label}⌄
            </button>
            {businessMenuOpen && (
              <ul className="admin-business-menu" role="listbox">
                {businesses.map((business) => (
                  <li key={business.id}>
                    <button
                      type="button"
                      className={business.id === workspaceId ? "active" : ""}
                      onClick={() => switchWorkspace(business.id)}
                    >
                      {business.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span>◯ ♧ AM Arjun Menon</span>
        </header>
        <div className="admin-content">
          <div className="admin-title-row">
            <div>
              <small className="admin-kicker">{data.label}</small>
              <h1>{current}</h1>
              <p className="admin-subtitle">
                A live view of {current.toLowerCase()} across your entire platform.
              </p>
            </div>
            <div className="admin-actions">
              <div className="admin-date-picker">
                <button
                  type="button"
                  className="admin-action-btn"
                  onClick={() => {
                    setDateDraft(dateRange)
                    setDatePickerOpen((open) => !open)
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={datePickerOpen}
                >
                  📅 {formatDateLabel(dateRange.start)} — {formatDateLabel(dateRange.end)}
                </button>
                {datePickerOpen && (
                  <div className="admin-date-popover" role="dialog">
                    <label>
                      From
                      <input
                        type="date"
                        value={dateDraft.start}
                        max={dateDraft.end}
                        onChange={(event) =>
                          setDateDraft((prev) => ({ ...prev, start: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={dateDraft.end}
                        min={dateDraft.start}
                        onChange={(event) =>
                          setDateDraft((prev) => ({ ...prev, end: event.target.value }))
                        }
                      />
                    </label>
                    <div className="admin-date-popover-actions">
                      <button type="button" onClick={() => setDatePickerOpen(false)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="admin-action-primary"
                        onClick={applyDateRange}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="admin-action-btn"
                onClick={() => {
                  if (current === "Business overview") {
                    downloadCsv(
                      `${slugify(data.label)}-business-overview`,
                      ["Metric", "Value"],
                      overviewMetrics.map((metric) => [metric.label, metric.value]),
                    )
                  } else {
                    downloadCsv(
                      `${slugify(data.label)}-command-center`,
                      ["Metric", "Value", "Change"],
                      dashboardMetrics.map(([label, value, change]) => [label, value, change]),
                    )
                  }
                }}
              >
                ⭳ Export
              </button>
              <button
                type="button"
                className="admin-action-btn admin-action-primary"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing…" : "⟳ Refresh data"}
              </button>
            </div>
          </div>
          {current === "Business overview" ? (
            <>
              <div className="admin-overview-head">
                <span className={`admin-overview-icon admin-overview-${data.overview.icon}`}>
                  <OverviewIcon icon={data.overview.icon} />
                </span>
                <div>
                  <h2>{data.label}</h2>
                  <p>{data.overview.description}</p>
                </div>
                <span className="admin-overview-badge">{data.overview.badge}</span>
              </div>
              <div className="admin-stats">
                {overviewMetrics.map((metric) => (
                  <article key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <small>
                      <em>Within target</em> today
                    </small>
                  </article>
                ))}
              </div>
              <div className="admin-panels">
                <div className="admin-service-health">
                  <h2>Service health remains stable</h2>
                  <p>Operational insight</p>
                  <ul className="admin-bars">
                    {overviewMetrics.map((metric) => (
                      <li key={metric.label}>
                        <span>{metric.label}</span>
                        <div className="admin-bar-track">
                          <div
                            className="admin-bar-fill"
                            style={{ width: `${metric.barPercent}%` }}
                          />
                        </div>
                        <b>{metric.barPercent}%</b>
                      </li>
                    ))}
                  </ul>
                  <p className="admin-insight-note">{data.overview.insight}</p>
                </div>
              </div>
            </>
          ) : current === "Global dashboard" ? (
            <>
              <div className="admin-live">
                <span className="admin-live-icon" aria-hidden="true">
                  <BuildingIcon />
                </span>
                <div className="admin-live-text">
                  <b>{data.label} view</b>
                  <p>All metrics, charts and records below are filtered consistently.</p>
                </div>
                <span className="admin-live-status">
                  ● Live data{lastRefreshed ? ` · updated ${lastRefreshed}` : ""}
                </span>
              </div>
              <div className="admin-stats">
                {dashboardMetrics.map(([label, value, change]) => (
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
                  <RevenueTrendChart series={data.trend} />
                </div>
                <div>
                  <h2>Order distribution</h2>
                  <p>Current order statuses</p>
                  <OrderDistributionChart slices={data.orderDistribution} total={data.orders} />
                </div>
              </div>
              <div className="admin-panels admin-panels-bottom">
                <div className="admin-transactions">
                  <h2>Recent transactions</h2>
                  <p>Latest platform activity</p>
                  <ul>
                    {data.transactions.map((transaction) => (
                      <li key={transaction.id}>
                        <Link href={`/admin/${workspaceId}/${slugify("Transaction ledger")}`}>
                          <span className="admin-tx-icon" aria-hidden="true">
                            🧾
                          </span>
                          <div className="admin-tx-info">
                            <b>{transaction.id}</b>
                            <small>
                              {transaction.vendor} ·{" "}
                              <em className={statusClass(transaction.status)}>
                                {transaction.status}
                              </em>
                            </small>
                          </div>
                          <span className={`admin-tag admin-tag-${transaction.tag.toLowerCase()}`}>
                            {transaction.tag}
                          </span>
                          <strong>{transaction.amount}</strong>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="admin-attention">
                  <h2>Needs your attention</h2>
                  <p>Prioritized actions</p>
                  <ul>
                    {data.attention.map((item) => (
                      <li key={item.title}>
                        <Link href={`/admin/${workspaceId}/${slugify(item.target)}`}>
                          <span className={`admin-attention-icon admin-attention-${item.icon}`}>
                            <AttentionIcon icon={item.icon} />
                          </span>
                          <div>
                            <b>{item.title}</b>
                            <small>{item.subtitle}</small>
                          </div>
                          <span className="admin-attention-arrow" aria-hidden="true">
                            →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="admin-live">
                <span className="admin-live-icon" aria-hidden="true">
                  <BuildingIcon />
                </span>
                <div className="admin-live-text">
                  <b>{data.label} view</b>
                  <p>All metrics, charts and records below are filtered consistently.</p>
                </div>
                <span className="admin-live-status">
                  ● Live data{lastRefreshed ? ` · updated ${lastRefreshed}` : ""}
                </span>
              </div>
              <div className="admin-stats">
                {dashboardMetrics.map(([label, value, change]) => (
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
            </>
          )}
        </div>
      </section>
    </main>
  )
}
