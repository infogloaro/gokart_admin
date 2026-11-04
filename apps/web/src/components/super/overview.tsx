"use client"
// Command Center, Business overview and the Food / Mart revenue screens, on /dashboard/*.
import { ApiError } from "@zoauro/api-client"
import {
  businessName,
  formatINR,
  orderStatusLabel,
  rangeLabel,
  type AttentionKind,
  type Business,
  type BusinessHealth,
  type DashboardOverview,
  type DashboardRange,
  type Metric,
  type RevenueReport,
} from "@zoauro/shared"
import {
  Activity,
  AlertTriangle,
  BadgeIndianRupee,
  Bike,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileCheck2,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Store,
  UtensilsCrossed,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useRefreshToast } from "@/components/refresh-toast"
import { GeoInsights } from "./geo-insights"
import {
  age,
  change,
  compactINR,
  shortDate,
  useDashboardHealth,
  useDashboardOverview,
  useRevenue,
} from "@/lib/dashboard"
import { useSince } from "@/lib/motion"
import { placedLabel, statusTone, useOrders } from "@/lib/orders"
import { CustomDates, pickRange, rangeSelectValue, RangeOptions } from "../range-select"
import { HeadActions } from "./dashboard"
import { useCsvExport } from "./export"
import { useBusinessFilter, type BusinessFilter } from "./shell"
import { Badge, Button, ErrorBox, Panel, Tabs, Toast } from "./ui"

const linkTo = (key: string, business: BusinessFilter, extra = "") => {
  const q = [business === "all" ? "" : `business=${business}`, extra].filter(Boolean).join("&")
  return `/super/${key}${q ? `?${q}` : ""}`
}
const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csvOf = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n")
const rupees = (paise: number) => (paise / 100).toFixed(2)

// ---------- header controls ----------

function Controls({
  range,
  setRange,
  updatedAt,
  refreshing,
  refresh,
  exporting,
  onExport,
}: {
  range: DashboardRange
  setRange: (r: DashboardRange) => void
  updatedAt: number
  refreshing: boolean
  refresh: () => Promise<unknown>
  exporting: boolean
  onExport: () => void
}) {
  const since = useSince(updatedAt)
  const runRefresh = useRefreshToast()
  return (
    <HeadActions>
      <span className="updated-note" aria-live="polite">
        Updated {since}
      </span>
      <label className="range-switch">
        <CalendarDays size={16} />
        <select
          value={rangeSelectValue(range)}
          onChange={(e) => pickRange(e.target.value, setRange)}
          aria-label="Date range"
        >
          <RangeOptions />
        </select>
        <ChevronDown size={14} />
      </label>
      <CustomDates range={range} setRange={setRange} />
      <Button icon={Download} disabled={exporting} onClick={onExport}>
        {exporting ? "Exporting…" : "Export"}
      </Button>
      <Button
        primary
        icon={RefreshCw}
        className={refreshing ? "spinning" : ""}
        onClick={() =>
          void runRefresh(async () => {
            const r = (await refresh()) as { isError?: boolean }
            if (r?.isError) throw new Error("Refresh failed")
          })
        }
      >
        Refresh
      </Button>
    </HeadActions>
  )
}

function LoadError({ error }: { error: unknown }) {
  return (
    <ErrorBox icon={AlertTriangle}>
      {error instanceof ApiError ? error.message : "Couldn't load this view. Try refreshing."}
    </ErrorBox>
  )
}

// ---------- metric cards ----------

function MetricCard({
  label,
  value,
  metric,
  note,
  href,
}: {
  label: string
  value: string
  metric?: Metric | undefined
  note: string
  href?: string | undefined
}) {
  const delta = metric ? change(metric) : null
  const body = (
    <>
      <span>{label}</span>
      <strong className="count-up">{value}</strong>
      <em className={delta?.startsWith("−") ? "down" : delta ? "" : "flat"}>
        {delta ?? note} <small>{delta ? "vs last period" : ""}</small>
      </em>
    </>
  )
  return href ? (
    <Link href={href} className="metric">
      {body}
    </Link>
  ) : (
    <div className="metric">{body}</div>
  )
}

const count = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("en-IN"))

// ---------- charts ----------

export type Series = { label: string; tone: "navy" | "gold"; values: number[] }

/** A smooth path through the points, with horizontal control handles. */
function smooth(points: [number, number][]) {
  if (!points.length) return ""
  let d = `M${points[0]![0]} ${points[0]![1]}`
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!
    const [x1, y1] = points[i]!
    const mx = (x0 + x1) / 2
    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`
  }
  return d
}

/** Line chart in the prototype's markup; hover, focus or tap a day to read its values. */
export function TrendChart({
  dates,
  series,
  format = compactINR,
}: {
  dates: string[]
  series: Series[]
  format?: (v: number) => string
}) {
  const [active, setActive] = useState<number | null>(null)
  const W = 700,
    top = 12,
    bottom = 180
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const x = (i: number) => (dates.length === 1 ? W / 2 : (i / (dates.length - 1)) * W)
  const y = (v: number) => bottom - (v / max) * (bottom - top)
  const pct = (i: number) => (x(i) / W) * 100
  const ticks =
    dates.length <= 8
      ? dates.map((_, i) => i)
      : [0, 1, 2, 3, 4].map((k) => Math.round((k * (dates.length - 1)) / 4))
  const hitWidth = 100 / Math.max(1, dates.length - 1)

  return (
    <div className="chart">
      <div className="chart-key">
        {series.map((s) => (
          <span key={s.label}>
            <i className={s.tone} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="chart-plot" onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${W} 190`} preserveAspectRatio="none" aria-hidden="true">
          <g>
            {[20, 60, 100, 140, 180].map((v) => (
              <line key={v} x1="0" y1={v} x2={W} y2={v} />
            ))}
          </g>
          {active !== null && (
            <line className="chart-cursor" x1={x(active)} x2={x(active)} y1={top} y2={bottom} />
          )}
          {series.map((s) => (
            <path
              key={`${s.label}-${dates.join()}`}
              className={`${s.tone}-line`}
              // Normalised length so the draw-in dash covers long 30/90-day paths too.
              pathLength={1000}
              d={smooth(s.values.map((v, i) => [x(i), y(v)]))}
            />
          ))}
        </svg>
        {active !== null &&
          series.map((s) => (
            <i
              key={s.label}
              className={`chart-dot ${s.tone}`}
              style={{ left: `${pct(active)}%`, top: `${(y(s.values[active] ?? 0) / 190) * 100}%` }}
            />
          ))}
        <div className="chart-hits">
          {dates.map((d, i) => (
            <button
              type="button"
              key={d}
              style={{ left: `${pct(i)}%`, width: `${hitWidth}%` }}
              aria-label={`${shortDate(d)}: ${series.map((s) => `${s.label} ${format(s.values[i] ?? 0)}`).join(", ")}`}
              aria-pressed={active === i}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(active === i ? null : i)}
            />
          ))}
        </div>
        {active !== null && (
          <div
            className={`chart-tip ${pct(active) > 70 ? "left" : ""}`}
            style={{ left: `${pct(active)}%` }}
            role="status"
          >
            <b>{shortDate(dates[active]!)}</b>
            {series.map((s) => (
              <span key={s.label}>
                <i className={s.tone} />
                {s.label}
                <strong>{format(s.values[active] ?? 0)}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="axis">
        {ticks.map((i) => (
          <span key={i}>{dates[i] ? shortDate(dates[i]) : ""}</span>
        ))}
      </div>
    </div>
  )
}

const DISTRIBUTION = [
  {
    key: "delivered",
    label: "Delivered",
    tone: "green",
    color: "var(--green)",
    status: "delivered",
  },
  { key: "inProgress", label: "In progress", tone: "blue", color: "var(--blue)", status: "" },
  { key: "cancelled", label: "Cancelled", tone: "red", color: "var(--red)", status: "cancelled" },
  { key: "refunded", label: "Refunded", tone: "gold", color: "var(--gold)", status: "refunded" },
] as const

function Donut({
  distribution,
  business,
}: {
  distribution: DashboardOverview["distribution"] | undefined
  business: BusinessFilter
}) {
  const [hover, setHover] = useState<string | null>(null)
  const total = DISTRIBUTION.reduce((t, d) => t + (distribution?.[d.key] ?? 0), 0)
  let at = 0
  const stops = DISTRIBUTION.map((d) => {
    const share = total ? ((distribution?.[d.key] ?? 0) / total) * 100 : 0
    const stop = `${hover && hover !== d.key ? `color-mix(in srgb, ${d.color} 25%, #fff)` : d.color} ${at}% ${at + share}%`
    at += share
    return stop
  })
  const shown = DISTRIBUTION.find((d) => d.key === hover)
  return (
    <div className="donut-row">
      <div
        className="donut"
        style={{ background: total ? `conic-gradient(${stops.join(",")})` : "#edf1f6" }}
      >
        <span>
          <b>{count(shown ? distribution?.[shown.key] : total)}</b>
          {shown ? shown.label.toLowerCase() : "orders"}
        </span>
      </div>
      <div className="legend">
        {DISTRIBUTION.map((d) => {
          const n = distribution?.[d.key] ?? 0
          return (
            <Link
              key={d.key}
              href={linkTo("orders", business, d.status ? `status=${d.status}` : "")}
              onMouseEnter={() => setHover(d.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.key)}
              onBlur={() => setHover(null)}
              title={`Open ${d.label.toLowerCase()} orders`}
            >
              <i className={d.tone} />
              {d.label} <b>{total ? `${Math.round((n / total) * 100)}%` : "—"}</b>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Command Center ----------

const ATTENTION: Record<
  AttentionKind,
  { icon: typeof Store; page: string; extra?: string; title: (n: number) => string }
> = {
  vendor_approvals: {
    icon: Store,
    page: "vendors",
    title: (n) => `${n} vendor approval${n === 1 ? "" : "s"} pending`,
  },
  refund_requests: {
    icon: BadgeIndianRupee,
    page: "orders",
    extra: "status=refund_requested",
    title: (n) => `${n} refund request${n === 1 ? "" : "s"} waiting`,
  },
  partner_approvals: {
    icon: Bike,
    page: "partners",
    title: (n) => `${n} partner application${n === 1 ? "" : "s"} to review`,
  },
  partner_documents: {
    icon: FileCheck2,
    page: "partners",
    title: (n) => `${n} partner document${n === 1 ? "" : "s"} to verify`,
  },
  delayed_orders: {
    icon: Clock,
    page: "orders",
    extra: "delayed=true",
    title: (n) => `${n} order${n === 1 ? "" : "s"} past the time limit`,
  },
}

export function CommandCenter() {
  const business = useBusinessFilter()
  const router = useRouter()
  const [range, setRange] = useState<DashboardRange>("7d")
  const q = useDashboardOverview(business === "all" ? undefined : business, range)
  const csv = useCsvExport()
  const d = q.data
  const m = d?.metrics
  const trendSeries: Series[] = [
    ...(business !== "mart"
      ? [
          {
            label: businessName.food,
            tone: "navy" as const,
            values: d?.trend.map((t) => t.food) ?? [],
          },
        ]
      : []),
    ...(business !== "food"
      ? [
          {
            label: businessName.mart,
            tone: "gold" as const,
            values: d?.trend.map((t) => t.mart) ?? [],
          },
        ]
      : []),
  ]

  const exportCsv = () =>
    csv.run("command-center", async () => {
      if (!d) return { csv: "", count: 0 }
      const rows: (string | number)[][] = [
        ["Metric", "Value", "Previous period"],
        ["Total orders", d.metrics.orders.value, d.metrics.orders.previous ?? ""],
        [
          "Gross order value (INR)",
          rupees(d.metrics.grossPaise.value),
          rupees(d.metrics.grossPaise.previous ?? 0),
        ],
        [
          "Platform revenue (INR)",
          rupees(d.metrics.platformRevenuePaise.value),
          rupees(d.metrics.platformRevenuePaise.previous ?? 0),
        ],
        ["Active vendors", d.metrics.activeVendors.value, ""],
        ["Delivery partners online", d.metrics.partnersOnline.value, ""],
        ["Pending orders", d.metrics.openOrders.value, ""],
        ["Open complaints", d.metrics.openComplaints.value, ""],
        ["Pending approvals", d.metrics.pendingApprovals.value, ""],
        [],
        ["Date", "Food gross (INR)", "Mart gross (INR)"],
        ...d.trend.map((t) => [t.date, rupees(t.food), rupees(t.mart)]),
      ]
      return { csv: csvOf(rows), count: rows.length }
    })

  return (
    <>
      <Controls
        range={range}
        setRange={setRange}
        updatedAt={q.dataUpdatedAt}
        refreshing={q.isFetching}
        refresh={() => q.refetch()}
        exporting={csv.exporting}
        onExport={exportCsv}
      />
      <div className="context">
        <Building2 />
        <span>
          <b>{business === "all" ? "All Businesses" : businessName[business]} view</b>
          All metrics, charts and records below are filtered consistently · {rangeLabel(range)}.
        </span>
        <Badge tone="success">● Live data</Badge>
      </div>
      {q.isError && <LoadError error={q.error} />}
      <div className="metrics">
        <MetricCard
          label="Total orders"
          value={count(m?.orders.value)}
          metric={m?.orders}
          note="No earlier data"
          href={linkTo("orders", business)}
        />
        <MetricCard
          label="Gross order value"
          value={m ? compactINR(m.grossPaise.value) : "—"}
          metric={m?.grossPaise}
          note="No earlier data"
        />
        <MetricCard
          label="Platform revenue"
          value={m ? compactINR(m.platformRevenuePaise.value) : "—"}
          metric={m?.platformRevenuePaise}
          note="Commission + delivery fees"
          href={
            business === "mart" ? linkTo("martRevenue", business) : linkTo("foodRevenue", business)
          }
        />
        <MetricCard
          label="Active vendors"
          value={count(m?.activeVendors.value)}
          note="Live now"
          href={linkTo("vendors", business)}
        />
        <MetricCard
          label="Delivery partners"
          value={count(m?.partnersOnline.value)}
          note="Online now"
          href={linkTo("partners", business)}
        />
        <MetricCard
          label="Pending orders"
          value={count(m?.openOrders.value)}
          note="Still being fulfilled"
          href={linkTo("orders", business)}
        />
        <MetricCard
          label="Open complaints"
          value={count(m?.openComplaints.value)}
          note="Refunds and delays"
          href={linkTo("complaints", business)}
        />
        <MetricCard
          label="Pending approvals"
          value={count(m?.pendingApprovals.value)}
          note="Review"
          href={linkTo("vendors", business)}
        />
      </div>
      <div className="grid-two">
        <Panel
          title="Revenue trend"
          subtitle="Gross order value per day, excluding cancelled and refunded orders"
        >
          <TrendChart dates={d?.trend.map((t) => t.date) ?? []} series={trendSeries} />
        </Panel>
        <Panel title="Order distribution" subtitle={`Orders placed · ${rangeLabel(range)}`}>
          <Donut distribution={d?.distribution} business={business} />
        </Panel>
      </div>
      <GeoInsights business={business === "all" ? undefined : business} range={range} />
      <div className="grid-two">
        <Panel title="Recent transactions" subtitle="Latest platform activity">
          <div className="list">
            {d?.recent.map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() =>
                  router.push(linkTo("orders", business, `search=${encodeURIComponent(o.code)}`))
                }
              >
                <b className={o.business}>
                  <ReceiptText />
                </b>
                <span>
                  <strong>{o.code}</strong>
                  <small>
                    {o.vendorName} · {orderStatusLabel(o.business, o.status)} ·{" "}
                    {placedLabel(o.placedAt)}
                  </small>
                </span>
                <Badge tone={o.business}>{o.business === "food" ? "FOOD" : "MART"}</Badge>
                <strong>{compactINR(o.totalPaise)}</strong>
              </button>
            ))}
            {d && d.recent.length === 0 && <p className="empty-note">No orders yet.</p>}
          </div>
        </Panel>
        <Panel title="Needs your attention" subtitle="Prioritized actions">
          {d?.attention.map((a) => {
            const c = ATTENTION[a.kind]
            const waited = age(a.oldestAt)
            return (
              <Link key={a.kind} className="alert-row" href={linkTo(c.page, business, c.extra)}>
                <c.icon />
                <span>
                  <b>{c.title(a.count)}</b>
                  <small>
                    {a.amountPaise !== null
                      ? `Total exposure ${formatINR(a.amountPaise)}`
                      : waited
                        ? `Oldest waiting ${waited}`
                        : "Running past the business's time limit"}
                  </small>
                </span>
                <ChevronRight />
              </Link>
            )
          })}
          {d && d.attention.length === 0 && (
            <p className="empty-note">Nothing needs your attention right now.</p>
          )}
        </Panel>
      </div>
      {csv.toast && <Toast toast={csv.toast} close={csv.dismiss} />}
    </>
  )
}

// ---------- Business overview ----------

const TARGETS = { acceptance: 90, onTime: 85, completion: 90, rating: 45 }

function healthItems(h: BusinessHealth) {
  return [
    {
      label: "Order acceptance",
      value: h.acceptanceRate,
      ok: h.acceptanceRate === null || h.acceptanceRate >= TARGETS.acceptance,
      text: h.acceptanceRate === null ? "—" : `${h.acceptanceRate}%`,
    },
    {
      label: "Within time limit",
      value: h.onTimeRate,
      ok: h.onTimeRate === null || h.onTimeRate >= TARGETS.onTime,
      text: h.onTimeRate === null ? "—" : `${h.onTimeRate}%`,
    },
    {
      label: "Delivery completion",
      value: h.completionRate,
      ok: h.completionRate === null || h.completionRate >= TARGETS.completion,
      text: h.completionRate === null ? "—" : `${h.completionRate}%`,
    },
    {
      label: "Partner rating",
      value: h.ratingTenths === null ? null : h.ratingTenths * 2,
      ok: h.ratingTenths === null || h.ratingTenths >= TARGETS.rating,
      text: h.ratingTenths === null ? "—" : `★ ${(h.ratingTenths / 10).toFixed(1)}`,
    },
  ]
}

function BusinessHero({
  business,
  badge,
  copy,
}: {
  business: Business
  badge: string
  copy: string
}) {
  return (
    <div className={`business-hero ${business}`}>
      <span>{business === "food" ? <UtensilsCrossed /> : <ShoppingBag />}</span>
      <div>
        <b>{businessName[business]}</b>
        <small>{copy}</small>
      </div>
      <Badge tone={business}>{badge}</Badge>
    </div>
  )
}

export function BusinessOverview() {
  const filter = useBusinessFilter()
  const [tab, setTab] = useState<string>(businessName.food)
  const [range, setRange] = useState<DashboardRange>("today")
  const kind: Business = filter !== "all" ? filter : tab === businessName.mart ? "mart" : "food"
  const q = useDashboardHealth(filter === "all" ? undefined : filter, range)
  const csv = useCsvExport()
  const h = q.data?.businesses.find((b) => b.business === kind)
  const items = h ? healthItems(h) : []
  const stable = items.every((i) => i.ok)
  const period = range === "today" ? "today" : rangeLabel(range).toLowerCase()

  const exportCsv = () =>
    csv.run("business-overview", async () => {
      const all = q.data?.businesses ?? []
      const rows: (string | number)[][] = [
        [
          "Business",
          "Orders",
          "Acceptance %",
          "Within time limit %",
          "Completion %",
          "Partner rating",
          "Open now",
          "Delayed now",
          "Active vendors",
          "Partners online",
        ],
        ...all.map((b) => [
          businessName[b.business],
          b.orders,
          b.acceptanceRate ?? "",
          b.onTimeRate ?? "",
          b.completionRate ?? "",
          b.ratingTenths === null ? "" : (b.ratingTenths / 10).toFixed(1),
          b.openOrders,
          b.delayedNow,
          b.activeVendors,
          b.partnersOnline,
        ]),
      ]
      return { csv: csvOf(rows), count: all.length }
    })

  return (
    <>
      <Controls
        range={range}
        setRange={setRange}
        updatedAt={q.dataUpdatedAt}
        refreshing={q.isFetching}
        refresh={() => q.refetch()}
        exporting={csv.exporting}
        onExport={exportCsv}
      />
      <BusinessHero
        business={kind}
        badge="Admin operations"
        copy={
          kind === "food"
            ? "Restaurant acceptance, kitchen-to-door time and delivery completion across food zones."
            : "Seller acceptance, dispatch time and delivery completion across marketplace zones."
        }
      />
      {filter === "all" && (
        <Tabs items={[businessName.food, businessName.mart]} value={tab} onChange={setTab} />
      )}
      {q.isError && <LoadError error={q.error} />}
      <div className="metrics">
        {(items.length ? items : healthItems(EMPTY_HEALTH(kind))).map((i) => (
          <div className="metric" key={i.label}>
            <span>{i.label}</span>
            <strong>{h ? i.text : "—"}</strong>
            <em className={i.value === null ? "flat" : i.ok ? "" : "down"}>
              {i.value === null ? "No data yet" : i.ok ? "Within target" : "Below target"}{" "}
              <small>{period}</small>
            </em>
          </div>
        ))}
      </div>
      <GeoInsights
        business={kind}
        range={range}
        initial="riders"
        title="Zone leaderboard and rider supply"
      />
      <Panel
        title={stable ? "Service health remains stable" : "Service health needs attention"}
        subtitle="Operational insight"
      >
        <div className="bars">
          {items.map((i) => (
            <div key={i.label}>
              <span>{i.label}</span>
              <i>
                <b style={{ width: `${Math.min(100, i.value ?? 0)}%` }} />
              </i>
              <strong>{i.value === null ? "—" : `${Math.round(i.value)}%`}</strong>
            </div>
          ))}
        </div>
        {h && (
          <div className="note">
            <Activity />
            <span>
              {h.orders.toLocaleString("en-IN")} orders {period}; {h.openOrders} still open and{" "}
              {h.delayedNow} past the time limit right now. {h.activeVendors} live{" "}
              {kind === "food" ? "restaurants" : "sellers"} and {h.partnersOnline} delivery partners
              online.{" "}
              <Link href={linkTo("orders", filter === "all" ? kind : filter, "delayed=true")}>
                Review delayed orders
              </Link>
            </span>
          </div>
        )}
      </Panel>
      {csv.toast && <Toast toast={csv.toast} close={csv.dismiss} />}
    </>
  )
}

const EMPTY_HEALTH = (business: Business): BusinessHealth => ({
  business,
  acceptanceRate: null,
  onTimeRate: null,
  completionRate: null,
  ratingTenths: null,
  orders: 0,
  openOrders: 0,
  delayedNow: 0,
  activeVendors: 0,
  partnersOnline: 0,
})

// ---------- Food / Mart revenue ----------

export function RevenueScreen({ business }: { business: Business }) {
  const food = business === "food"
  const tabs = [
    "Overview",
    food ? "Restaurant ledger" : "Seller ledger",
    "Settlements",
    "Refunds",
  ] as const
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview")
  const [range, setRange] = useState<DashboardRange>("30d")
  const q = useRevenue(business, range)
  const csv = useCsvExport()
  const r = q.data

  const exportCsv = () =>
    csv.run(`${business}-revenue`, async () => {
      if (!r) return { csv: "", count: 0 }
      const rows: (string | number)[][] =
        tab === "Overview"
          ? [
              ["Date", "Gross (INR)", "Platform revenue (INR)"],
              ...r.daily.map((d) => [d.date, rupees(d.grossPaise), rupees(d.platformPaise)]),
            ]
          : [
              [
                "Code",
                food ? "Restaurant" : "Seller",
                "Commission %",
                "Orders",
                "Gross (INR)",
                "Commission (INR)",
                "Owed to vendor (INR)",
              ],
              ...r.vendors.map((v) => [
                v.code,
                v.name,
                (v.commissionBps / 100).toFixed(2),
                v.orders,
                rupees(v.grossPaise),
                rupees(v.commissionPaise),
                rupees(v.vendorSharePaise),
              ]),
            ]
      return { csv: csvOf(rows), count: rows.length - 1 }
    })

  return (
    <>
      <Controls
        range={range}
        setRange={setRange}
        updatedAt={q.dataUpdatedAt}
        refreshing={q.isFetching}
        refresh={() => q.refetch()}
        exporting={csv.exporting}
        onExport={exportCsv}
      />
      <BusinessHero
        business={business}
        badge="Financial view"
        copy={
          food
            ? "Food finances are isolated from marketplace reporting."
            : "Marketplace finances are isolated from food reporting."
        }
      />
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {q.isError && <LoadError error={q.error} />}
      {tab === "Overview" && <RevenueOverview r={r} food={food} />}
      {tab === tabs[1] && <VendorLedger r={r} food={food} />}
      {tab === "Settlements" && <Settlements r={r} food={food} />}
      {tab === "Refunds" && <Refunds r={r} business={business} />}
      {csv.toast && <Toast toast={csv.toast} close={csv.dismiss} />}
    </>
  )
}

const totalsMetric = (
  r: RevenueReport | undefined,
  key: keyof RevenueReport["totals"],
): Metric | undefined => r && { value: r.totals[key], previous: r.previous[key] }

function RevenueOverview({ r, food }: { r: RevenueReport | undefined; food: boolean }) {
  const t = r?.totals
  const money = (v: number | undefined) => (v === undefined ? "—" : compactINR(v))
  const platform = t?.platformPaise ?? 0
  const share = (v: number) => (platform ? Math.round((v / platform) * 100) : 0)
  return (
    <>
      <div className="metrics six">
        <MetricCard
          label={food ? "Gross food order value" : "Gross marketplace sales"}
          value={money(t?.grossPaise)}
          metric={totalsMetric(r, "grossPaise")}
          note="No earlier data"
        />
        <MetricCard
          label={food ? "Restaurant commission" : "Seller commission"}
          value={money(t?.commissionPaise)}
          metric={totalsMetric(r, "commissionPaise")}
          note="No earlier data"
        />
        <MetricCard
          label="Delivery fee revenue"
          value={money(t?.deliveryFeesPaise)}
          metric={totalsMetric(r, "deliveryFeesPaise")}
          note="No earlier data"
        />
        <MetricCard
          label="Refund amount"
          value={money(t?.refundsPaise)}
          metric={totalsMetric(r, "refundsPaise")}
          note={`${t?.refundCount ?? 0} refunded orders`}
        />
        <MetricCard
          label="Net platform revenue"
          value={money(t?.platformPaise)}
          metric={totalsMetric(r, "platformPaise")}
          note="No earlier data"
        />
        <MetricCard
          label={food ? "Owed to restaurants" : "Owed to sellers"}
          value={money(t?.vendorSharePaise)}
          metric={totalsMetric(r, "vendorSharePaise")}
          note="Before settlement"
        />
      </div>
      <div className="metrics">
        <MetricCard
          label="Partner pay (rider cost)"
          value={money(t?.riderCostPaise)}
          metric={totalsMetric(r, "riderCostPaise")}
          note="Split by share of deliveries"
        />
        <MetricCard
          label="Margin after partner pay"
          value={money(t?.marginPaise)}
          metric={totalsMetric(r, "marginPaise")}
          note={
            t && t.platformPaise
              ? `${Math.round((t.marginPaise / t.platformPaise) * 100)}% of platform revenue`
              : "No revenue yet"
          }
        />
      </div>
      <GeoInsights
        business={r?.business}
        range={r?.range ?? "30d"}
        initial="margin"
        title="Margin by state, district and zone"
      />
      <div className="grid-two">
        <Panel
          title={food ? "Daily food revenue" : "Daily marketplace sales"}
          subtitle="Gross value and platform revenue are shown separately"
        >
          <TrendChart
            dates={r?.daily.map((d) => d.date) ?? []}
            series={[
              {
                label: "Gross value",
                tone: "navy",
                values: r?.daily.map((d) => d.grossPaise) ?? [],
              },
              {
                label: "Platform revenue",
                tone: "gold",
                values: r?.daily.map((d) => d.platformPaise) ?? [],
              },
            ]}
          />
        </Panel>
        <Panel title="Revenue composition" subtitle="Platform revenue only">
          <div className="bars">
            {[
              ["Commission", t?.commissionPaise ?? 0],
              ["Delivery fees", t?.deliveryFeesPaise ?? 0],
            ].map(([label, v]) => (
              <div key={label as string}>
                <span>{label}</span>
                <i>
                  <b style={{ width: `${share(v as number)}%` }} />
                </i>
                <strong>{share(v as number)}%</strong>
              </div>
            ))}
          </div>
          <div className="note">
            <AlertTriangle />
            Net platform revenue excludes vendor sales, settlements and refunds.
          </div>
        </Panel>
      </div>
      <RecentOrders business={food ? "food" : "mart"} />
    </>
  )
}

function RecentOrders({ business, status }: { business: Business; status?: "refund_requested" }) {
  const orders = useOrders({ business, status, page: 1, pageSize: 6 })
  const router = useRouter()
  return (
    <Panel
      title={
        status
          ? "Refund requests"
          : `Recent ${business === "food" ? "food" : "marketplace"} transactions`
      }
      subtitle="All amounts shown in INR"
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Order",
                "Customer",
                business === "food" ? "Restaurant" : "Seller",
                "Status",
                "Amount",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.data?.items.map((o) => (
              <tr key={o.id}>
                <td>
                  <button
                    type="button"
                    className="entity"
                    onClick={() =>
                      router.push(
                        `/super/orders?business=${business}&search=${encodeURIComponent(o.code)}`,
                      )
                    }
                  >
                    <b className={o.business}>{o.code.slice(0, 2)}</b>
                    <span>
                      <strong>{o.code}</strong>
                      <small>{placedLabel(o.placedAt)}</small>
                    </span>
                  </button>
                </td>
                <td>{o.customerName}</td>
                <td>{o.vendorName}</td>
                <td>
                  <Badge tone={statusTone(o.status)}>
                    {orderStatusLabel(o.business, o.status)}
                  </Badge>
                </td>
                <td>
                  <strong>{formatINR(o.totalPaise)}</strong>
                </td>
              </tr>
            ))}
            {orders.data?.items.length === 0 && (
              <tr>
                <td colSpan={5}>{status ? "No refund requests waiting." : "No orders yet."}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function VendorLedger({ r, food }: { r: RevenueReport | undefined; food: boolean }) {
  return (
    <Panel
      title={food ? "Restaurant ledger" : "Seller ledger"}
      subtitle="Sales, commission kept and amount owed per vendor in this period"
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                food ? "Restaurant" : "Seller",
                "Commission",
                "Orders",
                "Gross value",
                "Platform commission",
                food ? "Owed to restaurant" : "Owed to seller",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r?.vendors.map((v) => (
              <tr key={v.vendorId}>
                <td>
                  <Link className="entity" href={`/super/vendors?business=${r.business}`}>
                    <b className={r.business}>{v.name.slice(0, 2).toUpperCase()}</b>
                    <span>
                      <strong>{v.name}</strong>
                      <small>{v.code}</small>
                    </span>
                  </Link>
                </td>
                <td>{(v.commissionBps / 100).toFixed(1)}%</td>
                <td>{v.orders.toLocaleString("en-IN")}</td>
                <td>{formatINR(v.grossPaise)}</td>
                <td>
                  <strong>{formatINR(v.commissionPaise)}</strong>
                </td>
                <td>{formatINR(v.vendorSharePaise)}</td>
              </tr>
            ))}
            {r && r.vendors.length === 0 && (
              <tr>
                <td colSpan={6}>No sales in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function Settlements({ r, food }: { r: RevenueReport | undefined; food: boolean }) {
  return (
    <Panel
      title="Settlements"
      subtitle={`What the platform owes ${food ? "restaurants" : "sellers"} for this period`}
    >
      <div className="bars">
        <div>
          <span>Owed</span>
          <i>
            <b style={{ width: "100%" }} />
          </i>
          <strong>{r ? compactINR(r.totals.vendorSharePaise) : "—"}</strong>
        </div>
      </div>
      <div className="note">
        <AlertTriangle />
        <span>
          Settlement batches, payout dates and bank transfers are handled in{" "}
          <Link href="/super/finance">Finance &amp; payouts</Link>, which isn&apos;t live yet. The
          amount above is item value less platform commission on orders that weren&apos;t cancelled
          or refunded.
        </span>
      </div>
    </Panel>
  )
}

function Refunds({ r, business }: { r: RevenueReport | undefined; business: Business }) {
  return (
    <>
      <div className="metrics">
        <MetricCard
          label="Refunded orders"
          value={count(r?.totals.refundCount)}
          metric={r && { value: r.totals.refundCount, previous: r.previous.refundCount }}
          note="This period"
        />
        <MetricCard
          label="Refunded amount"
          value={r ? compactINR(r.totals.refundsPaise) : "—"}
          metric={totalsMetric(r, "refundsPaise")}
          note="This period"
        />
        <MetricCard
          label="Requests waiting"
          value={count(r?.refundRequests.count)}
          note="Right now"
          href={`/super/orders?business=${business}&status=refund_requested`}
        />
        <MetricCard
          label="Exposure"
          value={r ? compactINR(r.refundRequests.amountPaise) : "—"}
          note="Value of open requests"
        />
      </div>
      <RecentOrders business={business} status="refund_requested" />
    </>
  )
}
