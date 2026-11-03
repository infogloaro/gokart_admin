"use client"
// Reports & Analytics (Super Admin) in the prototype's markup: period tabs and export,
// four headline metrics against the previous period, the business comparison chart and
// the top vendors. Data from GET /reports/analytics.
import { ApiError } from "@zoauro/api-client"
import { businessName, type ReportPeriod } from "@zoauro/shared"
import { AlertTriangle, Download, ReceiptText } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { compactINR } from "@/lib/dashboard"
import { inr, useAnalytics, type Geo } from "@/lib/finance"
import { download } from "@/lib/motion"
import { GeoFilter } from "./geo-filter"
import { TrendChart } from "./overview"
import { useBusinessFilter } from "./shell"
import { Badge, Button, ErrorBox, Panel, Tabs, Toast, type ToastMessage } from "./ui"

const PERIODS = ["Daily", "Weekly", "Monthly"] as const
type Period = (typeof PERIODS)[number]

const change = (value: number, previous: number) => {
  if (!previous) return value ? "New" : "—"
  const pct = ((value - previous) / previous) * 100
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`
}

export function ReportsAnalytics() {
  const router = useRouter()
  const business = useBusinessFilter()
  const [period, setPeriod] = useState<Period>("Monthly")
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [geo, setGeo] = useState<Geo>({})
  const q = useAnalytics(period.toLowerCase() as ReportPeriod, geo)
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

  const exportReport = () => {
    if (!a) return
    const r = (p: number) => (p / 100).toFixed(2)
    const rows: (string | number)[][] = [
      [`${period} analytics`, new Date().toISOString().slice(0, 10)],
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
    ]
    const cell = (v: string | number) =>
      /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
    download(
      `gloaro-analytics-${period.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((x) => x.map(cell).join(",")).join("\n"),
    )
    setToast({ tone: "success", title: "Done", message: "Analytics workbook downloaded." })
  }

  return (
    <>
      <div className="report-tools">
        <Tabs items={PERIODS} value={period} onChange={setPeriod} />
        <GeoFilter value={geo} onChange={setGeo} />
        <Button icon={Download} onClick={exportReport} disabled={!a}>
          Export report
        </Button>
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
        ].map(([label, value, delta]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong className="count-up">{value}</strong>
            <em className={delta?.startsWith("−") ? "down" : delta === "—" ? "flat" : ""}>
              {delta}{" "}
              <small>
                vs previous{" "}
                {period.toLowerCase() === "daily"
                  ? "14 days"
                  : period === "Weekly"
                    ? "8 weeks"
                    : "6 months"}
              </small>
            </em>
          </div>
        ))}
      </div>
      <div className="grid-two">
        <Panel title="Business comparison" subtitle={`${period} platform revenue`}>
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
                </span>
                <Badge tone={v.business}>{v.business === "food" ? "FOOD" : "MART"}</Badge>
                <strong>{compactINR(v.grossPaise)}</strong>
              </button>
            ))}
            {a && vendors.length === 0 && <p className="empty-note">No orders in this period.</p>}
          </div>
        </Panel>
      </div>
      {toast && <Toast toast={toast} close={() => setToast(null)} />}
    </>
  )
}
