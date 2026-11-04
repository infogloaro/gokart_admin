"use client"
// Reports & Analytics (Super Admin): period tabs (daily to yearly, or a custom range) and export,
// headline metrics against the previous period, the business comparison chart and top vendors.
// Filters by state, district, delivery partner and rider. Below them: partner and rider
// comparisons, and each rider's deliveries with the steps, delivery code, proof and complaints.
import { ApiError } from "@zoauro/api-client"
import {
  type AnalyticsPeriod,
  businessName,
  formatINR,
  type PartnerComparisonRow,
  type RiderComparisonRow,
} from "@zoauro/shared"
import { AlertTriangle, Download, ReceiptText } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { compactINR } from "@/lib/dashboard"
import { useDeliveryBoys, useDeliveryFleets } from "@/lib/delivery"
import {
  inr,
  useAnalytics,
  usePartnerComparison,
  useRiderComparison,
  useRiderDeliveries,
  type Geo,
} from "@/lib/finance"
import { download } from "@/lib/motion"
import { GeoFilter } from "./geo-filter"
import { TrendChart } from "./overview"
import { useBusinessFilter } from "./shell"
import { Badge, Button, ErrorBox, Panel, Tabs, Toast, type ToastMessage } from "./ui"

const PERIODS = ["Daily", "Weekly", "Monthly", "Yearly", "Custom"] as const
type Period = (typeof PERIODS)[number]

const DAY = 86_400_000
const istDay = (t: number) => new Date(t + 330 * 60_000).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1

const PREVIOUS: Record<Exclude<Period, "Custom">, string> = {
  Daily: "14 days",
  Weekly: "8 weeks",
  Monthly: "6 months",
  Yearly: "5 years",
}

const change = (value: number, previous: number) => {
  if (!previous) return value ? "New" : "—"
  const pct = ((value - previous) / previous) * 100
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`
}

const minutes = (m: number | null) =>
  m === null
    ? "—"
    : m >= 60
      ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} m`
      : `${Math.round(m)} m`

const percent = (accepted: number, sent: number) =>
  sent ? `${Math.round((accepted * 100) / sent)}%` : "—"

/** A bar showing this row's share of the largest value in its table. */
function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <span className="cmp-track" aria-hidden="true">
      <span className="cmp-fill" style={{ width: `${width}%` }} />
    </span>
  )
}

export function ReportsAnalytics() {
  const router = useRouter()
  const business = useBusinessFilter()
  const [period, setPeriod] = useState<Period>("Monthly")
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [geo, setGeo] = useState<Geo>({})
  const [from, setFrom] = useState(() => istDay(Date.now() - 29 * DAY))
  const [to, setTo] = useState(() => istDay(Date.now()))
  const [fleetId, setFleetId] = useState("")
  const [boyId, setBoyId] = useState("")
  const custom = period === "Custom"
  const label = custom ? `${from} to ${to}` : period
  const apiPeriod = period.toLowerCase() as AnalyticsPeriod
  const range = custom ? { from, to } : undefined

  const fleets = useDeliveryFleets({ page: 1, pageSize: 100 })
  const riders = useDeliveryBoys(
    { page: 1, pageSize: 100, ...(fleetId && { fleetId }) },
    Boolean(fleetId),
  )
  const q = useAnalytics(apiPeriod, geo, range, {
    ...(fleetId && { fleetId }),
    ...(boyId && { boyId }),
  })
  const partners = usePartnerComparison(apiPeriod, geo, range)
  const ridersTable = useRiderComparison(apiPeriod, geo, range, fleetId || undefined)
  const deliveries = useRiderDeliveries(boyId || undefined, apiPeriod, range)

  const a = q.data
  const m = a?.metrics
  const series = [
    ...(business !== "mart"
      ? [
          {
            label: businessName.food,
            tone: "navy" as const,
            values: a?.series.map((s) => s.food) ?? [],
          },
        ]
      : []),
    ...(business !== "food"
      ? [
          {
            label: businessName.mart,
            tone: "gold" as const,
            values: a?.series.map((s) => s.mart) ?? [],
          },
        ]
      : []),
  ]
  const vendors = (a?.topVendors ?? []).filter((v) => business === "all" || v.business === business)
  const vendorMax = Math.max(0, ...vendors.map((v) => v.grossPaise))
  const partnerRows: PartnerComparisonRow[] = partners.data ?? []
  const riderRows: RiderComparisonRow[] = ridersTable.data ?? []
  const partnerMax = Math.max(0, ...partnerRows.map((p) => p.deliveries))
  const riderMax = Math.max(0, ...riderRows.map((r) => r.deliveries))
  const selectedRider = riderRows.find((r) => r.boyId === boyId)

  const exportReport = () => {
    if (!a) return
    const r = (p: number) => (p / 100).toFixed(2)
    const rows: (string | number)[][] = [
      [`${label} analytics`, new Date().toISOString().slice(0, 10)],
      [],
      ["Metric", "This period", "Previous period"],
      ["Total orders", a.metrics.orders.value, a.metrics.orders.previous],
      ["Combined GTV (INR)", r(a.metrics.grossPaise.value), r(a.metrics.grossPaise.previous)],
      [
        "Platform revenue (INR)",
        r(a.metrics.platformPaise.value),
        r(a.metrics.platformPaise.previous),
      ],
      [
        "Average order (INR)",
        r(a.metrics.averageOrderPaise.value),
        r(a.metrics.averageOrderPaise.previous),
      ],
      [],
      [
        "Period",
        "From",
        "ZOAURO FOOD platform revenue (INR)",
        "GLOARO MART platform revenue (INR)",
      ],
      ...a.series.map((s) => [s.label, s.from, r(s.food), r(s.mart)]),
      [],
      ["Top vendor", "Code", "Business", "Orders", "Gross order value (INR)"],
      ...a.topVendors.map((v) => [
        v.name,
        v.code,
        businessName[v.business],
        v.orders,
        r(v.grossPaise),
      ]),
      [],
      [
        "Delivery partner",
        "Riders",
        "Deliveries",
        "Avg minutes to deliver",
        "Offers accepted",
        "Complaints",
        "Cash collected (INR)",
      ],
      ...partnerRows.map((p) => [
        p.fleetName,
        p.riders,
        p.deliveries,
        p.avgMinutes ?? "",
        `${p.offersAccepted} of ${p.offersSent}`,
        p.complaints,
        r(p.codCollectedPaise),
      ]),
      [],
      [
        "Rider",
        "Code",
        "Delivery partner",
        "Zone",
        "Deliveries",
        "Avg minutes to deliver",
        "Offers accepted",
        "Complaints",
        "Cash collected (INR)",
      ],
      ...riderRows.map((x) => [
        x.name,
        x.code,
        x.fleetName,
        x.zoneName,
        x.deliveries,
        x.avgMinutes ?? "",
        `${x.offersAccepted} of ${x.offersSent}`,
        x.complaints,
        r(x.codCollectedPaise),
      ]),
    ]
    const cell = (v: string | number) =>
      /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
    download(
      `gloaro-analytics-${custom ? `${from}_to_${to}` : period.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((x) => x.map(cell).join(",")).join("\n"),
    )
    setToast({ tone: "success", title: "Done", message: "Analytics workbook downloaded." })
  }

  return (
    <>
      <div className="report-bar">
        <div className="report-bar-row">
          <Tabs items={PERIODS} value={period} onChange={setPeriod} />
          <Button icon={Download} onClick={exportReport} disabled={!a}>
            Export report
          </Button>
        </div>
        <div className="report-filters">
          {custom && (
            <span className="range-custom">
              <input
                type="date"
                aria-label="From date"
                value={from}
                max={to}
                onChange={(e) => e.target.value && setFrom(e.target.value)}
              />
              <span>to</span>
              <input
                type="date"
                aria-label="To date"
                value={to}
                min={from}
                max={istDay(Date.now())}
                onChange={(e) => e.target.value && setTo(e.target.value)}
              />
            </span>
          )}
          <GeoFilter value={geo} onChange={setGeo} />
          <label className="report-filter">
            <span>Delivery partner</span>
            <select
              value={fleetId}
              onChange={(event) => {
                setFleetId(event.target.value)
                setBoyId("")
              }}
            >
              <option value="">All partners</option>
              {(fleets.data?.items ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="report-filter">
            <span>Delivery boy</span>
            <select
              value={boyId}
              disabled={!fleetId}
              onChange={(event) => setBoyId(event.target.value)}
            >
              <option value="">{fleetId ? "All riders" : "Choose a partner first"}</option>
              {(riders.data?.items ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.code}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {q.isError && (
        <ErrorBox icon={AlertTriangle}>
          {q.error instanceof ApiError ? q.error.message : "Couldn't load analytics."}
        </ErrorBox>
      )}
      <div className="metrics">
        {[
          [
            "Total orders",
            m ? m.orders.value.toLocaleString("en-IN") : "—",
            m ? change(m.orders.value, m.orders.previous) : "—",
          ],
          [
            "Combined GTV",
            m ? compactINR(m.grossPaise.value) : "—",
            m ? change(m.grossPaise.value, m.grossPaise.previous) : "—",
          ],
          [
            "Platform revenue",
            m ? compactINR(m.platformPaise.value) : "—",
            m ? change(m.platformPaise.value, m.platformPaise.previous) : "—",
          ],
          [
            "Average order",
            m ? inr(m.averageOrderPaise.value) : "—",
            m ? change(m.averageOrderPaise.value, m.averageOrderPaise.previous) : "—",
          ],
        ].map(([metricLabel, value, delta]) => (
          <div className="metric" key={metricLabel}>
            <span>{metricLabel}</span>
            <strong className="count-up">{value}</strong>
            <em className={delta?.startsWith("−") ? "down" : delta === "—" ? "flat" : ""}>
              {delta}{" "}
              <small>
                vs previous{" "}
                {custom
                  ? `${daysBetween(from, to)} days`
                  : PREVIOUS[period as Exclude<Period, "Custom">]}
              </small>
            </em>
          </div>
        ))}
      </div>
      <div className="grid-two">
        <Panel title="Business comparison" subtitle={`${label} platform revenue`}>
          <TrendChart dates={a?.series.map((s) => s.from) ?? []} series={series} />
        </Panel>
        <Panel title="Top vendor performance" subtitle="By gross order value">
          <div className="list">
            {vendors.map((v) => (
              <button
                type="button"
                key={v.id}
                onClick={() =>
                  router.push(
                    `/super/vendors?business=${v.business}&search=${encodeURIComponent(v.code)}`,
                  )
                }
              >
                <b className={v.business}>
                  <ReceiptText />
                </b>
                <span>
                  <strong>{v.name}</strong>
                  <small>
                    {v.code} · {v.orders.toLocaleString("en-IN")} orders
                  </small>
                  <Bar value={v.grossPaise} max={vendorMax} />
                </span>
                <Badge tone={v.business}>{v.business === "food" ? "FOOD" : "MART"}</Badge>
                <strong>{compactINR(v.grossPaise)}</strong>
              </button>
            ))}
            {a && vendors.length === 0 && <p className="empty-note">No orders in this period.</p>}
          </div>
        </Panel>
      </div>

      <Panel
        title="Delivery partner comparison"
        subtitle={`${label} · deliveries, speed and complaints by company`}
      >
        {partnerRows.length === 0 ? (
          <p className="empty-note">No delivery partner has deliveries in this period.</p>
        ) : (
          <div className="table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Delivery partner</th>
                  <th>Riders</th>
                  <th>Deliveries</th>
                  <th>Avg time to deliver</th>
                  <th>Offers accepted</th>
                  <th>Complaints</th>
                  <th>Cash collected</th>
                </tr>
              </thead>
              <tbody>
                {partnerRows.map((p) => (
                  <tr
                    key={p.fleetId}
                    className="clickable"
                    onClick={() => {
                      setFleetId(p.fleetId)
                      setBoyId("")
                    }}
                  >
                    <td>{p.fleetName}</td>
                    <td>{p.riders}</td>
                    <td>
                      {p.deliveries} <Bar value={p.deliveries} max={partnerMax} />
                    </td>
                    <td>{minutes(p.avgMinutes)}</td>
                    <td>{percent(p.offersAccepted, p.offersSent)}</td>
                    <td>{p.complaints}</td>
                    <td>{formatINR(p.codCollectedPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Rider comparison"
        subtitle={
          fleetId
            ? "Riders of the chosen partner. Select a rider to see their deliveries."
            : "All riders in scope. Choose a partner to narrow the list."
        }
      >
        {riderRows.length === 0 ? (
          <p className="empty-note">No rider has deliveries in this period.</p>
        ) : (
          <div className="table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Delivery partner</th>
                  <th>Zone</th>
                  <th>Deliveries</th>
                  <th>Avg time to deliver</th>
                  <th>Offers accepted</th>
                  <th>Complaints</th>
                  <th>Cash collected</th>
                </tr>
              </thead>
              <tbody>
                {riderRows.map((r) => (
                  <tr
                    key={r.boyId}
                    className={r.boyId === boyId ? "clickable selected" : "clickable"}
                    onClick={() => setBoyId(r.boyId)}
                  >
                    <td>
                      {r.name}
                      <br />
                      <small>{r.code}</small>
                    </td>
                    <td>{r.fleetName}</td>
                    <td>{r.zoneName}</td>
                    <td>
                      {r.deliveries} <Bar value={r.deliveries} max={riderMax} />
                    </td>
                    <td>{minutes(r.avgMinutes)}</td>
                    <td>{percent(r.offersAccepted, r.offersSent)}</td>
                    <td>{r.complaints}</td>
                    <td>{formatINR(r.codCollectedPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {boyId && (
        <Panel
          title={selectedRider ? `Deliveries by ${selectedRider.name}` : "Deliveries"}
          subtitle="How each order was taken and delivered, with the customer's complaints"
        >
          <p className="empty-note">
            Customer ratings are not collected yet, so this shows complaints only.
          </p>
          {deliveries.data && deliveries.data.length === 0 && (
            <p className="empty-note">No deliveries for this rider in this period.</p>
          )}
          <ul className="delivery-trail">
            {(deliveries.data ?? []).map((d) => (
              <li key={d.orderId} className="delivery-row">
                <div className="delivery-head">
                  <strong>{d.orderCode}</strong>
                  <small>
                    {d.vendorName} · {businessName[d.business]} · {formatINR(d.amountPaise)}
                  </small>
                  <Badge tone={d.delivered ? "active" : "neutral"}>
                    {d.delivered ? "Delivered" : "Not delivered"}
                  </Badge>
                </div>
                <ol className="delivery-steps">
                  {d.steps.map((step) => (
                    <li key={step.key} className={step.at ? "done" : "pending"}>
                      <span>{step.label}</span>
                      <small>
                        {step.at
                          ? new Date(step.at).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </small>
                    </li>
                  ))}
                </ol>
                <div className="delivery-meta">
                  <span>
                    {d.codeVerified
                      ? "Delivery code confirmed at the door"
                      : "Delivery code not confirmed"}
                  </span>
                  {d.proofAt ? (
                    <a
                      href={`/api/v1/delivery/orders/${d.orderId}/proof`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View delivery photo
                    </a>
                  ) : (
                    <span>No delivery photo</span>
                  )}
                  {d.complaints.length === 0 ? (
                    <span>No complaints</span>
                  ) : (
                    d.complaints.map((c) => (
                      <Badge key={c.code} tone="neutral">
                        {c.code} · {c.category} · {c.status}
                      </Badge>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {toast && <Toast toast={toast} close={() => setToast(null)} />}
    </>
  )
}
