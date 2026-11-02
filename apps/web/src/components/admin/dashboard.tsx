"use client"
// Admin portal: Dashboard, Business overview, Finance summary, Reports and Notifications,
// in the prototype's markup (admin.css), on /dashboard/*, /orders and the notification feed.
import { ApiError } from "@zoauro/api-client"
import {
  businessName,
  DASHBOARD_RANGES,
  formatINR,
  ORDER_SLA_MINUTES,
  orderStatusLabel,
  rangeName,
  type Business,
  type BusinessHealth,
  type DashboardOverview,
  type DashboardRange,
  type Order,
  type OrderStatus,
} from "@zoauro/shared"
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bike,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Lock,
  Package,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, type ReactNode } from "react"
import { useNotificationFeed } from "@/components/notification-center"
import { useMarkRead, useStoredNotifications } from "@/lib/operations"
import {
  age,
  change,
  shortDate,
  useDashboardHealth,
  useDashboardOverview,
  useRevenue,
} from "@/lib/dashboard"
import { download, useSince } from "@/lib/motion"
import { placedLabel, statusTone, useOrders } from "@/lib/orders"
import { useMe } from "@/lib/session"
import { AlertsPanel } from "@/components/alerts-panel"
import { AdminBadge, AdminButton, PageHeader } from "./ui"

const href = (business: Business, page: string, extra = "") =>
  `/admin/${business}/${page}${extra ? `?${extra}` : ""}`
const vendorWord = (b: Business, plural = false) =>
  b === "food" ? (plural ? "restaurants" : "restaurant") : plural ? "sellers" : "seller"
const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csvOf = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n")
const rupees = (paise: number) => (paise / 100).toFixed(2)
/** ISO timestamps (the CSV keeps them exact) read as "27 Oct, 11:13 am" on screen. */
const cell = (v: string | number) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? placedLabel(v) : v
const num = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("en-IN"))

function RangeFilter({
  range,
  setRange,
}: {
  range: DashboardRange
  setRange: (r: DashboardRange) => void
}) {
  return (
    <label className="date-filter">
      <Clock className="icon" size={16} />
      <select
        value={range}
        onChange={(e) => setRange(e.target.value as DashboardRange)}
        aria-label="Date range"
      >
        {DASHBOARD_RANGES.map((r) => (
          <option key={r} value={r}>
            {r === "today"
              ? `Today, ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}`
              : rangeName[r]}
          </option>
        ))}
      </select>
      <ChevronDown className="icon" size={14} />
    </label>
  )
}

function Synced({ at }: { at: number }) {
  const since = useSince(at)
  return (
    <>
      <AdminBadge tone="success">LIVE DATA</AdminBadge>
      <span>Last synced {since}</span>
    </>
  )
}

function LoadError({ error }: { error: unknown }) {
  return (
    <p className="admin-error" role="alert">
      <AlertTriangle className="icon" size={16} />
      {error instanceof ApiError
        ? error.message
        : "Couldn't load this view. Try again in a moment."}
    </p>
  )
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "",
  to,
}: {
  label: string
  value: string
  note: string
  icon: LucideIcon
  tone?: string
  to?: string
}) {
  const body = (
    <>
      <div className="metric-top">
        <span>{label}</span>
        <i>
          <Icon className="icon" size={19} />
        </i>
      </div>
      <strong className="count-up">{value}</strong>
      <small>{note}</small>
    </>
  )
  return to ? (
    <Link href={to} className={`metric ${tone}`}>
      {body}
    </Link>
  ) : (
    <article className={`metric ${tone}`}>{body}</article>
  )
}

// ---------- Dashboard ----------

const STATUS_GROUPS: Record<Business, { label: string; statuses: OrderStatus[] }[]> = {
  food: [
    { label: "New", statuses: ["placed"] },
    { label: "Preparing", statuses: ["accepted", "preparing", "ready"] },
    { label: "On the way", statuses: ["assigned", "picked_up", "out_for_delivery"] },
    { label: "Delivered", statuses: ["delivered"] },
    { label: "Cancelled / refunds", statuses: ["cancelled", "refund_requested", "refunded"] },
  ],
  mart: [
    { label: "New", statuses: ["placed"] },
    { label: "Processing", statuses: ["accepted", "packed", "ready"] },
    { label: "In transit", statuses: ["assigned", "picked_up", "out_for_delivery"] },
    { label: "Delivered", statuses: ["delivered"] },
    { label: "Returned / cancelled", statuses: ["refund_requested", "refunded", "cancelled"] },
  ],
}
const DONUT_COLORS = ["var(--navy)", "#d5a437", "#e9c96e", "#7c95b6", "#e96e67"]

function greeting() {
  const h = Number(
    new Date().toLocaleString("en-IN", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }),
  )
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

/** A round step above the largest value, so the y-axis reads 0 / 10 / 20 / 30 / 40. */
function niceMax(v: number) {
  if (v <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(v / 4))
  const nice = [1, 2, 2.5, 5, 10].find((m) => m * step * 4 >= v) ?? 10
  return nice * step * 4
}

function ActivityChart({
  activity,
  hourly,
}: {
  activity: DashboardOverview["activity"]
  hourly: boolean
}) {
  const max = niceMax(Math.max(0, ...activity.map((a) => a.orders)))
  const every = hourly ? 3 : activity.length > 14 ? Math.ceil(activity.length / 8) : 1
  return (
    <div className="chart-area">
      <div className="y-labels" aria-hidden="true">
        {[4, 3, 2, 1, 0].map((k) => (
          <span key={k}>{Math.round((max * k) / 4)}</span>
        ))}
      </div>
      <div className="bar-chart" role="list" aria-label="Orders and completed orders">
        {activity.map((a, i) => {
          const label = hourly ? `${Number(a.bucket)}:00` : shortDate(a.bucket)
          return (
            <div
              key={a.bucket}
              className="bar-wrap"
              role="listitem"
              title={`${label} · ${a.orders} orders · ${a.completed} delivered`}
              aria-label={`${label}: ${a.orders} orders, ${a.completed} delivered`}
            >
              <div className="bar-bg">
                <div className="bar-main" style={{ height: `${(a.orders / max) * 100}%` }} />
                <div className="bar-complete" style={{ height: `${(a.completed / max) * 100}%` }} />
              </div>
              <span>{i % every === 0 ? label : ""}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusDonut({
  business,
  byStatus,
}: {
  business: Business
  byStatus: DashboardOverview["byStatus"] | undefined
}) {
  const groups = STATUS_GROUPS[business].map((g) => ({
    ...g,
    count: g.statuses.reduce((t, s) => t + (byStatus?.find((r) => r.status === s)?.count ?? 0), 0),
  }))
  const total = groups.reduce((t, g) => t + g.count, 0)
  let at = 0
  const stops = groups.map((g, i) => {
    const share = total ? (g.count / total) * 100 : 0
    const stop = `${DONUT_COLORS[i]} ${at}% ${at + share}%`
    at += share
    return stop
  })
  return (
    <div className="donut-row">
      <div
        className={`donut ${business}`}
        style={{ background: total ? `conic-gradient(${stops.join(",")})` : "#edf1f6" }}
      >
        <div>
          <strong>{num(byStatus ? total : undefined)}</strong>
          <span>Total</span>
        </div>
      </div>
      <div className="status-legend">
        {groups.map((g, i) => (
          <Link
            key={g.label}
            href={href(business, "orders", `status=${g.statuses[0]}`)}
            title={`Open ${g.label.toLowerCase()} orders`}
          >
            <i className={`c${i}`} />
            <span>{g.label}</span>
            <b>{num(byStatus ? g.count : undefined)}</b>
          </Link>
        ))}
      </div>
    </div>
  )
}

function minutesLate(o: Order) {
  return Math.max(
    0,
    Math.round((Date.now() - Date.parse(o.placedAt)) / 60_000) - ORDER_SLA_MINUTES[o.business],
  )
}
const lateText = (min: number) => (min >= 90 ? `${Math.round(min / 60)} h` : `${min} min`)

function AlertItem({
  tone,
  title,
  meta,
  time,
  to,
}: {
  tone: "danger" | "warning" | "info"
  title: string
  meta: string
  time: string
  to: string
}) {
  const Icon = tone === "danger" ? AlertTriangle : tone === "warning" ? Clock : Bell
  return (
    <Link className="alert-item" href={to}>
      <span className={tone}>
        <Icon className="icon" size={17} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{meta}</p>
        <small>{time}</small>
      </div>
      <ChevronRight className="icon" size={15} />
    </Link>
  )
}

export function AdminDashboard({ business }: { business: Business }) {
  const me = useMe()
  const router = useRouter()
  const [range, setRange] = useState<DashboardRange>("today")
  const q = useDashboardOverview(business, range)
  const recent = useOrders({ business, page: 1, pageSize: 5 }, true, 60_000)
  const delayed = useOrders({ business, delayed: "true", page: 1, pageSize: 3 }, true, 60_000)
  const refunds = useOrders(
    { business, status: "refund_requested", page: 1, pageSize: 2 },
    true,
    60_000,
  )
  const d = q.data
  const m = d?.metrics
  const f = d?.floor
  const food = business === "food"
  const vs = range === "today" ? "vs yesterday" : "vs previous period"
  const orderChange = m ? change(m.orders) : null
  const refundCount = d?.attention.find((a) => a.kind === "refund_requests")?.count ?? 0
  const firstName = me.data?.name.split(" ")[0] ?? ""

  const alerts = [
    ...(delayed.data?.items ?? []).map((o) => ({
      key: o.id,
      tone: "danger" as const,
      title: `${food ? "Delivery" : "Shipment"} delayed by ${lateText(minutesLate(o))}`,
      meta: `#${o.code} · ${o.vendorName}`,
      time: `Placed ${age(o.placedAt)} ago`,
      to: href(business, "orders", `search=${encodeURIComponent(o.code)}`),
    })),
    ...(refunds.data?.items ?? []).map((o) => ({
      key: o.id,
      tone: "warning" as const,
      title: `Refund requested · ${formatINR(o.totalPaise)}`,
      meta: `#${o.code} · ${o.vendorName}`,
      time: `Placed ${age(o.placedAt)} ago`,
      to: href(business, "orders", `search=${encodeURIComponent(o.code)}`),
    })),
    ...(d?.attention ?? [])
      .filter(
        (a) =>
          a.kind === "partner_documents" ||
          a.kind === "partner_approvals" ||
          a.kind === "vendor_approvals",
      )
      .map((a) => ({
        key: a.kind,
        tone: "info" as const,
        title:
          a.kind === "vendor_approvals"
            ? `${a.count} ${vendorWord(business, a.count !== 1)} awaiting approval`
            : a.kind === "partner_approvals"
              ? `${a.count} partner application${a.count === 1 ? "" : "s"} in review`
              : `${a.count} partner document${a.count === 1 ? "" : "s"} to verify`,
        meta:
          a.kind === "vendor_approvals"
            ? "Approved by the Super Admin"
            : "Delivery partner onboarding",
        time: a.oldestAt ? `Oldest waiting ${age(a.oldestAt)}` : "",
        to: href(business, a.kind === "vendor_approvals" ? "vendors" : "partners"),
      })),
  ].slice(0, 5)

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={`Here’s what’s happening across ${businessName[business]} ${range === "today" ? "today" : `· ${rangeName[range].toLowerCase()}`}.`}
        note={<Synced at={q.dataUpdatedAt} />}
      >
        <RangeFilter range={range} setRange={setRange} />
        <AdminButton
          icon={FileText}
          kind="secondary"
          onClick={() => router.push(href(business, "reports"))}
        >
          View reports
        </AdminButton>
      </PageHeader>
      {q.isError && <LoadError error={q.error} />}
      <AlertsPanel />
      <div className="metrics-grid">
        <MetricCard
          label={food ? "Total food orders" : "Marketplace orders"}
          value={num(m?.orders.value)}
          note={orderChange ? `${orderChange} ${vs}` : "No orders to compare yet"}
          icon={ShoppingBag}
          to={href(business, "orders")}
        />
        {food ? (
          <MetricCard
            label="Preparing now"
            value={num(f?.preparing)}
            note={`${num(f?.nearingLimit)} nearing the time limit`}
            icon={Clock}
            tone="gold"
            to={href(business, "orders", "status=preparing")}
          />
        ) : (
          <MetricCard
            label="Ready to dispatch"
            value={num(f?.ready)}
            note={`${num(f?.unassigned)} unassigned`}
            icon={Package}
            tone="gold"
            to={href(business, "orders", "status=ready")}
          />
        )}
        <MetricCard
          label="Active partners"
          value={num(m?.partnersOnline.value)}
          note={`${num(f?.partnersAvailable)} available ${food ? "nearby" : "now"}`}
          icon={food ? Bike : Truck}
          to={href(business, "partners")}
        />
        <MetricCard
          label={food ? "Open exceptions" : "Returns & disputes"}
          value={num(m?.openComplaints.value)}
          note={`${num(f?.delayed)} delayed · ${refundCount} refund${refundCount === 1 ? "" : "s"}`}
          icon={AlertTriangle}
          tone="red"
          to={href(business, "complaints")}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-head">
            <div>
              <h2>Order activity</h2>
              <p>
                {range === "today"
                  ? "Hourly order volume · today"
                  : `Daily order volume · ${rangeName[range].toLowerCase()}`}
              </p>
            </div>
            <div className="legend">
              <i /> Orders <i /> Delivered
            </div>
          </div>
          <ActivityChart activity={d?.activity ?? []} hourly={range === "today"} />
        </section>
        <section className="panel status-panel">
          <div className="panel-head">
            <div>
              <h2>Status overview</h2>
              <p>Orders placed · {range === "today" ? "today" : rangeName[range].toLowerCase()}</p>
            </div>
          </div>
          <StatusDonut business={business} byStatus={d?.byStatus} />
        </section>
      </div>
      <div className="dashboard-grid lower">
        <section className="panel orders-panel">
          <div className="panel-head">
            <div>
              <h2>Recent orders</h2>
              <p>Latest activity from your assigned scope</p>
            </div>
            <Link className="text-button" href={href(business, "orders")}>
              View all <ArrowRight className="icon" size={16} />
            </Link>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>{food ? "Restaurant" : "Seller"}</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {recent.data?.items.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() =>
                      router.push(href(business, "orders", `search=${encodeURIComponent(o.code)}`))
                    }
                  >
                    <td>
                      <Link
                        href={href(business, "orders", `search=${encodeURIComponent(o.code)}`)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <strong>{o.code}</strong>
                      </Link>
                      <small>{placedLabel(o.placedAt)}</small>
                    </td>
                    <td>{o.customerName}</td>
                    <td>
                      <strong className="vendor-name">{o.vendorName}</strong>
                    </td>
                    <td>
                      <strong>{formatINR(o.totalPaise)}</strong>
                    </td>
                    <td>
                      <AdminBadge tone={statusTone(o.status)}>
                        {orderStatusLabel(o.business, o.status)}
                      </AdminBadge>
                    </td>
                    <td>
                      <span>{o.delayed ? "Delayed" : (o.partnerName ?? "Unassigned")}</span>
                    </td>
                  </tr>
                ))}
                {recent.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6}>No orders yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="panel attention-panel">
          <div className="panel-head">
            <div>
              <h2>Needs attention</h2>
              <p>Prioritized by urgency</p>
            </div>
            <AdminBadge tone="danger">{num(m?.openComplaints.value)} open</AdminBadge>
          </div>
          {alerts.map((a) => (
            <AlertItem
              key={a.key}
              tone={a.tone}
              title={a.title}
              meta={a.meta}
              time={a.time}
              to={a.to}
            />
          ))}
          {d && alerts.length === 0 && (
            <p className="admin-empty">Nothing needs attention right now.</p>
          )}
          <Link className="attention-link" href={href(business, "complaints")}>
            Review all exceptions <ArrowRight className="icon" size={16} />
          </Link>
        </aside>
      </div>
    </>
  )
}

// ---------- shared feature cards and insight panel ----------

function FeatureCard({
  icon: Icon,
  title,
  text,
  extra,
  to,
  onClick,
  active,
}: {
  icon: LucideIcon
  title: string
  text: ReactNode
  extra?: ReactNode
  to?: string
  onClick?: () => void
  active?: boolean
}) {
  const inner = (
    <>
      <div className="feature-icon">
        <Icon className="icon" size={20} />
      </div>
      <div className="feature-content">
        <h3>{title}</h3>
        <p>{text}</p>
        {extra}
      </div>
      <span className="circle-action" aria-hidden="true">
        <ChevronRight className="icon" size={16} />
      </span>
    </>
  )
  if (to)
    return (
      <Link className="feature-card" href={to}>
        {inner}
      </Link>
    )
  if (onClick)
    return (
      <button
        type="button"
        className={`feature-card${active ? " active" : ""}`}
        onClick={onClick}
        aria-pressed={active}
      >
        {inner}
      </button>
    )
  return <article className="feature-card">{inner}</article>
}

function Insight({
  title,
  text,
  value,
  caption,
}: {
  title: string
  text: ReactNode
  value: string
  caption: string
}) {
  return (
    <section className="panel insight-panel">
      <div>
        <AdminBadge tone="gold">OPERATIONAL INSIGHT</AdminBadge>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <div className="insight-visual">
        <span>{value}</span>
        <small>{caption}</small>
      </div>
    </section>
  )
}

// ---------- Business overview ----------

function healthCards(b: Business, h: BusinessHealth | undefined) {
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`)
  const target = (v: number | null | undefined, goal: number) =>
    v === null || v === undefined ? "No data yet" : v >= goal ? "Within target" : "Below target"
  const food = b === "food"
  return [
    {
      icon: Store,
      title: food ? "Order acceptance" : "Seller confirmation",
      value: pct(h?.acceptanceRate),
      state: target(h?.acceptanceRate, 90),
      to: href(b, "orders", "status=placed"),
    },
    {
      icon: Clock,
      title: "Delivered within time limit",
      value: pct(h?.onTimeRate),
      state: target(h?.onTimeRate, 85),
      to: href(b, "orders", "delayed=true"),
    },
    {
      icon: food ? Bike : Truck,
      title: food ? "Delivery completion" : "Shipment completion",
      value: pct(h?.completionRate),
      state: target(h?.completionRate, 90),
      to: href(b, "orders", "status=delivered"),
    },
    {
      icon: Bike,
      title: "Partner rating",
      value: h?.ratingTenths ? `★ ${(h.ratingTenths / 10).toFixed(1)} / 5` : "—",
      state: target(h?.ratingTenths ?? null, 45),
      to: href(b, "partners"),
    },
  ]
}

export function AdminOverview({ business }: { business: Business }) {
  const [range, setRange] = useState<DashboardRange>("today")
  const q = useDashboardHealth(business, range)
  const h = q.data?.businesses.find((x) => x.business === business)
  const cards = healthCards(business, h)
  const stable = !cards.some((c) => c.state === "Below target")
  const period = range === "today" ? "today" : rangeName[range].toLowerCase()
  return (
    <>
      <PageHeader
        title="Business overview"
        subtitle={
          business === "food"
            ? "A focused view of food operations and service health."
            : "Marketplace sales, fulfilment and delivery health in one view."
        }
        note={<Synced at={q.dataUpdatedAt} />}
      >
        <RangeFilter range={range} setRange={setRange} />
      </PageHeader>
      {q.isError && <LoadError error={q.error} />}
      <div className="feature-grid overview">
        {cards.map((c) => (
          <FeatureCard
            key={c.title}
            icon={c.icon}
            title={c.title}
            text={<b className="feature-value">{c.value}</b>}
            extra={
              <AdminBadge
                tone={
                  c.state === "Below target"
                    ? "danger"
                    : c.state === "Within target"
                      ? "success"
                      : "neutral"
                }
              >
                {c.state}
              </AdminBadge>
            }
            to={c.to}
          />
        ))}
      </div>
      <Insight
        title={stable ? "Service health remains stable" : "Service health needs attention"}
        text={
          h
            ? `${num(h.orders)} orders ${period}. ${num(h.openOrders)} still open, ${num(h.delayedNow)} past the time limit right now. ${num(h.activeVendors)} live ${vendorWord(business, true)} and ${num(h.partnersOnline)} delivery partners online.`
            : "Loading service health…"
        }
        value={h?.completionRate === null || !h ? "—" : `${h.completionRate}%`}
        caption="Completion rate"
      />
    </>
  )
}

// ---------- Finance summary ----------

export function AdminFinance({ business }: { business: Business }) {
  const [range, setRange] = useState<DashboardRange>("30d")
  const q = useRevenue(business, range)
  const t = q.data?.totals
  const food = business === "food"
  const money = (v: number | undefined) => (v === undefined ? "—" : formatINR(v))
  const cards = food
    ? [
        [
          "Food order revenue",
          money(t?.grossPaise),
          "Customer payments on completed and active orders",
        ],
        ["Restaurant commission", money(t?.commissionPaise), "Platform's share of item value"],
        ["Delivery fees", money(t?.deliveryFeesPaise), "Charged to customers"],
        ["Owed to restaurants", money(t?.vendorSharePaise), "Before settlement"],
      ]
    : [
        ["Gross sales", money(t?.grossPaise), "Customer payments on completed and active orders"],
        ["Seller commissions", money(t?.commissionPaise), "Platform's share of item value"],
        ["Refund total", money(t?.refundsPaise), `${t?.refundCount ?? 0} refunded orders`],
        ["Owed to sellers", money(t?.vendorSharePaise), "Before settlement"],
      ]
  const kept = t && t.grossPaise ? `${((t.platformPaise / t.grossPaise) * 100).toFixed(1)}%` : "—"
  return (
    <>
      <PageHeader
        title={food ? "Food finance summary" : "Mart finance summary"}
        subtitle={
          food
            ? "Permitted business-level financial summaries. Approval actions are restricted."
            : "Permitted marketplace summaries with role-gated financial actions."
        }
        note={<Synced at={q.dataUpdatedAt} />}
      >
        <RangeFilter range={range} setRange={setRange} />
        <AdminBadge tone="gold">
          <Lock className="icon" size={13} /> View-only access
        </AdminBadge>
      </PageHeader>
      {q.isError && <LoadError error={q.error} />}
      <div className="feature-grid finance">
        {cards.map(([title, value, hint]) => (
          <FeatureCard
            key={title}
            icon={Wallet}
            title={title!}
            text={<b className="feature-value">{value}</b>}
            extra={<small className="feature-hint">{hint}</small>}
          />
        ))}
      </div>
      <Insight
        title="Settlement overview"
        text={
          t
            ? `${formatINR(t.platformPaise)} platform revenue (${formatINR(t.commissionPaise)} commission + ${formatINR(t.deliveryFeesPaise)} delivery fees) from ${num(t.orders)} orders, ${rangeName[range].toLowerCase()}. ${formatINR(t.vendorSharePaise)} is owed to ${vendorWord(business, true)}; settlement batches and payouts are approved by the Super Admin.`
            : "Loading the period's figures…"
        }
        value={kept}
        caption="Kept as platform revenue"
      />
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <h2>{food ? "Restaurant" : "Seller"} ledger</h2>
            <p>
              Sales, commission and amount owed per {vendorWord(business)} ·{" "}
              {rangeName[range].toLowerCase()}
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{food ? "Restaurant" : "Seller"}</th>
                <th>Commission</th>
                <th>Orders</th>
                <th>Gross value</th>
                <th>Platform commission</th>
                <th>Owed</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.vendors.map((v) => (
                <tr key={v.vendorId}>
                  <td>
                    <strong className="vendor-name">{v.name}</strong>
                    <small>{v.code}</small>
                  </td>
                  <td>{(v.commissionBps / 100).toFixed(1)}%</td>
                  <td>{num(v.orders)}</td>
                  <td>{formatINR(v.grossPaise)}</td>
                  <td>
                    <strong>{formatINR(v.commissionPaise)}</strong>
                  </td>
                  <td>{formatINR(v.vendorSharePaise)}</td>
                </tr>
              ))}
              {q.data && q.data.vendors.length === 0 && (
                <tr>
                  <td colSpan={6}>No sales in this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

// ---------- Reports ----------

type Report = {
  key: string
  title: string
  header: string[]
  rows: (string | number)[][]
  updatedAt: number
  error: unknown
}

function useReports(business: Business, range: DashboardRange): Report[] {
  const overview = useDashboardOverview(business, range)
  const revenue = useRevenue(business, range)
  const health = useDashboardHealth(business, range)
  const issue = useOrders(
    {
      business,
      status: business === "food" ? "cancelled" : "refund_requested",
      page: 1,
      pageSize: 100,
    },
    true,
  )
  const refunded = useOrders(
    { business, status: "refunded", page: 1, pageSize: 100 },
    business === "mart",
  )
  const food = business === "food"
  const hourly = range === "today"

  return useMemo(() => {
    const trend = overview.data?.trend ?? []
    const h = health.data?.businesses.find((b) => b.business === business)
    const issueRows = [...(issue.data?.items ?? []), ...(food ? [] : (refunded.data?.items ?? []))]
    return [
      {
        key: "daily",
        title: food ? "Daily food orders" : "Sales performance",
        header: [
          hourly ? "Hour (IST)" : "Date",
          "Orders",
          "Delivered",
          "Completion %",
          ...(hourly ? [] : ["Gross (INR)"]),
        ],
        rows: (overview.data?.activity ?? []).map((a) => [
          hourly ? `${a.bucket}:00` : a.bucket,
          a.orders,
          a.completed,
          a.orders ? ((a.completed / a.orders) * 100).toFixed(1) : "",
          ...(hourly ? [] : [rupees(trend.find((t) => t.date === a.bucket)?.[business] ?? 0)]),
        ]),
        updatedAt: overview.dataUpdatedAt,
        error: overview.error,
      },
      {
        key: "vendors",
        title: food ? "Restaurant performance" : "Seller performance",
        header: [
          food ? "Restaurant" : "Seller",
          "Code",
          "Orders",
          "Gross (INR)",
          "Commission (INR)",
          "Owed (INR)",
        ],
        rows: (revenue.data?.vendors ?? []).map((v) => [
          v.name,
          v.code,
          v.orders,
          rupees(v.grossPaise),
          rupees(v.commissionPaise),
          rupees(v.vendorSharePaise),
        ]),
        updatedAt: revenue.dataUpdatedAt,
        error: revenue.error,
      },
      {
        key: "delivery",
        title: food ? "Delivery completion" : "Shipment performance",
        header: ["Measure", "Value"],
        rows: h
          ? [
              ["Orders", h.orders],
              [food ? "Order acceptance %" : "Seller confirmation %", h.acceptanceRate ?? ""],
              ["Delivered within time limit %", h.onTimeRate ?? ""],
              ["Completion %", h.completionRate ?? ""],
              ["Partner rating", h.ratingTenths ? (h.ratingTenths / 10).toFixed(1) : ""],
              ["Open now", h.openOrders],
              ["Past the time limit now", h.delayedNow],
              ["Partners online", h.partnersOnline],
            ]
          : [],
        updatedAt: health.dataUpdatedAt,
        error: health.error,
      },
      {
        key: "issues",
        title: food ? "Cancellation analysis" : "Return & refund analysis",
        header: [
          "Order",
          food ? "Restaurant" : "Seller",
          "Customer",
          "Status",
          "Amount (INR)",
          "Placed",
        ],
        rows: issueRows.map((o) => [
          o.code,
          o.vendorName,
          o.customerName,
          orderStatusLabel(o.business, o.status),
          rupees(o.totalPaise),
          o.placedAt,
        ]),
        updatedAt: issue.dataUpdatedAt,
        error: issue.error,
      },
    ]
  }, [
    overview.data,
    overview.dataUpdatedAt,
    overview.error,
    revenue.data,
    revenue.dataUpdatedAt,
    revenue.error,
    health.data,
    health.dataUpdatedAt,
    health.error,
    issue.data,
    issue.dataUpdatedAt,
    issue.error,
    refunded.data,
    business,
    food,
    hourly,
  ])
}

function ReportCard({
  report,
  active,
  onClick,
}: {
  report: Report
  active: boolean
  onClick: () => void
}) {
  const since = useSince(report.updatedAt)
  return (
    <FeatureCard
      icon={FileText}
      title={report.title}
      text={
        report.error
          ? "Not available with your permissions"
          : `Updated ${since} · ${num(report.rows.length)} rows`
      }
      onClick={onClick}
      active={active}
    />
  )
}

export function AdminReports({ business }: { business: Business }) {
  const me = useMe()
  const [range, setRange] = useState<DashboardRange>("30d")
  const reports = useReports(business, range)
  const [open, setOpen] = useState("daily")
  const [notice, setNotice] = useState("")
  const canExport = Boolean(me.data?.permissions.includes("reports.export"))
  const current = reports.find((r) => r.key === open) ?? reports[0]!
  const stamp = new Date().toISOString().slice(0, 10)
  const fileOf = (r: Report) => `${business}-${r.key}-${range}-${stamp}.csv`

  const save = (r: Report) => {
    if (!r.rows.length) return setNotice(`Nothing to export in “${r.title}” for this period.`)
    download(fileOf(r), csvOf([r.header, ...r.rows]))
    setNotice(`“${r.title}” downloaded.`)
  }
  const saveAll = () => {
    const parts = reports
      .filter((r) => !r.error)
      .flatMap((r) => [[r.title], r.header, ...r.rows, []])
    download(`${business}-reports-${range}-${stamp}.csv`, csvOf(parts))
    setNotice("All reports downloaded as one file.")
  }

  return (
    <>
      <PageHeader
        title={business === "food" ? "Food reports" : "Mart reports"}
        subtitle={
          business === "food"
            ? "Analyze operational outcomes and export permitted data."
            : "Analyze marketplace, shipment and returns performance."
        }
      >
        <RangeFilter range={range} setRange={setRange} />
        {canExport ? (
          <AdminButton icon={Download} onClick={saveAll}>
            Export reports
          </AdminButton>
        ) : (
          <AdminBadge tone="gold">
            <Lock className="icon" size={13} /> View only
          </AdminBadge>
        )}
      </PageHeader>
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      <div className="feature-grid reports">
        {reports.map((r) => (
          <ReportCard
            key={r.key}
            report={r}
            active={r.key === open}
            onClick={() => setOpen(r.key)}
          />
        ))}
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <h2>{current.title}</h2>
            <p>
              {rangeName[range]} · {businessName[business]} · your assigned zones
            </p>
          </div>
          {canExport && (
            <AdminButton
              icon={Download}
              kind="secondary"
              onClick={() => save(current)}
              disabled={Boolean(current.error)}
            >
              Download CSV
            </AdminButton>
          )}
        </div>
        {current.error ? (
          <LoadError error={current.error} />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {current.header.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {current.rows.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    {row.map((c, j) => (
                      <td key={j}>{j === 0 ? <strong>{cell(c)}</strong> : cell(c)}</td>
                    ))}
                  </tr>
                ))}
                {current.rows.length === 0 && (
                  <tr>
                    <td colSpan={current.header.length}>No records for this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {current.rows.length > 50 && (
              <p className="admin-empty">
                Showing the first 50 of {num(current.rows.length)} rows. Download the CSV for all of
                them.
              </p>
            )}
          </div>
        )}
      </section>
    </>
  )
}

// ---------- Notifications ----------

export function AdminNotifications({ business }: { business: Business }) {
  const me = useMe()
  const [tab, setTab] = useState<"updates" | "action">("updates")
  const [unreadOnly, setUnreadOnly] = useState(false)
  const stored = useStoredNotifications(unreadOnly, 50)
  const markRead = useMarkRead()
  const feed = useNotificationFeed(business, me.data?.permissions ?? [], "admin", 20)
  const pending = feed.items.filter((n) => n.kind !== "update")
  const icons = { vendor: Store, partner: Bike, order: ShoppingBag, update: Bell } as const
  const unread = stored.data?.unread ?? 0
  return (
    <div className="gk-page">
      <PageHeader
        title="Notifications"
        subtitle="Your assigned operational updates and alerts."
        note={<AdminBadge tone={unread ? "danger" : "neutral"}>{num(unread)} unread</AdminBadge>}
      >
        {tab === "updates" && unread > 0 && (
          <AdminButton icon={CheckCheck} kind="secondary" onClick={() => markRead.mutate("all")}>
            Mark all as read
          </AdminButton>
        )}
      </PageHeader>
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
          Needs action {pending.length > 0 && <b>{feed.count - unread}</b>}
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
              <Link
                href={n.link ?? href(business, "notifications")}
                onClick={() => !n.readAt && markRead.mutate(n.id)}
              >
                <span className="gk-inbox-icon">
                  <Bell className="icon" size={17} />
                </span>
                <span className="gk-inbox-copy">
                  <strong>{n.title}</strong>
                  <small>{n.body}</small>
                </span>
                <time dateTime={n.createdAt}>{age(n.createdAt)} ago</time>
              </Link>
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
          {feed.hasError && <LoadError error={null} />}
          <div className="feature-grid notifications">
            {pending.map((n) => (
              <FeatureCard
                key={n.id}
                icon={icons[n.kind]}
                title={n.title}
                text={n.detail}
                extra={<small className="feature-hint">{age(n.createdAt)} ago</small>}
                to={n.href}
              />
            ))}
          </div>
          {!feed.loading && pending.length === 0 && (
            <p className="admin-empty">Nothing is waiting on you.</p>
          )}
        </>
      )}
    </div>
  )
}
