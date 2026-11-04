"use client"
// Rider shifts, earnings statements, profile change approvals, zone analytics and rider app
// passwords. Used by the Admin portal (its zones) and the Super Admin portal (all zones).
import { ApiError } from "@zoauro/api-client"
import { formatINR } from "@zoauro/shared"
import { useState } from "react"
import { useDeliveryBoys } from "@/lib/delivery"
import {
  useDecideProfileChange,
  useEarnings,
  useEndShift,
  useIssueAppPassword,
  useProfileChanges,
  useRiderAnalytics,
  useRiderShifts,
} from "@/lib/rider-phase3"

type Tab = "Shifts" | "Earnings" | "Profile changes" | "Analytics" | "App login"
const TABS: Tab[] = ["Shifts", "Earnings", "Profile changes", "Analytics", "App login"]

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : "That didn’t work. Try again."

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

const duration = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours} h ${rest} m` : `${rest} m`
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })

export function RiderPhase3() {
  const [tab, setTab] = useState<Tab>("Shifts")
  return (
    <div className="rider-ops">
      <div className="gk-segment" role="tablist" aria-label="Rider shifts and earnings">
        {TABS.map((item) => (
          <button
            type="button"
            role="tab"
            key={item}
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "Shifts" && <Shifts />}
      {tab === "Earnings" && <Earnings />}
      {tab === "Profile changes" && <ProfileChanges />}
      {tab === "Analytics" && <Analytics />}
      {tab === "App login" && <AppLogin />}
    </div>
  )
}

function Shifts() {
  const [status, setStatus] = useState<"open" | "closed" | "all">("open")
  const shifts = useRiderShifts({
    page: 1,
    pageSize: 50,
    ...(status !== "all" && { status }),
  })
  const endShift = useEndShift()
  const [error, setError] = useState("")
  const items = shifts.data?.items ?? []
  return (
    <section className="panel full-panel">
      <p className="muted">
        Riders start and end their shift in the rider app. You can end an open shift here if a rider
        forgot to.
      </p>
      <div className="gk-segment" role="tablist" aria-label="Shift status">
        {(["open", "closed", "all"] as const).map((value) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={status === value}
            className={status === value ? "active" : ""}
            onClick={() => setStatus(value)}
          >
            {value === "open" ? "On shift" : value === "closed" ? "Ended" : "All"}
          </button>
        ))}
      </div>
      {error && (
        <p className="admin-empty" role="alert">
          {error}
        </p>
      )}
      {shifts.data && items.length === 0 && <p className="admin-empty">No shifts here.</p>}
      {items.length > 0 && (
        <div className="table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Zone</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Time on shift</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.riderName}
                    <br />
                    <small>{row.riderCode}</small>
                  </td>
                  <td>{row.zoneName}</td>
                  <td>{when(row.startedAt)}</td>
                  <td>
                    {row.endedAt ? (
                      <>
                        {when(row.endedAt)}
                        {row.endedByAdmin && <small> · ended by team</small>}
                      </>
                    ) : (
                      "On shift now"
                    )}
                  </td>
                  <td>{duration(row.minutes)}</td>
                  <td>
                    {!row.endedAt && (
                      <button
                        type="button"
                        className="btn"
                        disabled={endShift.isPending}
                        onClick={() => {
                          if (window.confirm(`End ${row.riderName}’s shift now?`)) {
                            setError("")
                            void endShift
                              .mutateAsync(row.id)
                              .catch((cause) => setError(message(cause)))
                          }
                        }}
                      >
                        End shift
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Earnings() {
  const [from, setFrom] = useState(daysAgo(6))
  const [to, setTo] = useState(today())
  const statement = useEarnings({ from, to })
  const data = statement.data
  const exportUrl = (format: "csv" | "xlsx") =>
    `/api/v1/delivery/earnings?from=${from}&to=${to}&format=${format}`
  return (
    <section className="panel full-panel">
      <p className="muted">
        Delivery fees earned per rider for the dates you pick, with time on shift. Download it for
        payouts or the rider’s records.
      </p>
      <div className="gk-segment" role="group" aria-label="Date range">
        <label>
          From{" "}
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>{" "}
        <label>
          To{" "}
          <input
            type="date"
            value={to}
            min={from}
            max={today()}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>
      <p>
        <a className="btn" href={exportUrl("csv")} download>
          Download CSV
        </a>{" "}
        <a className="btn" href={exportUrl("xlsx")} download>
          Download Excel
        </a>
      </p>
      {data && (
        <div className="fp-kpis">
          <div className="metric">
            <span>Deliveries</span>
            <strong>{data.totals.deliveries}</strong>
          </div>
          <div className="metric">
            <span>Delivery fees</span>
            <strong>{formatINR(data.totals.feePaise)}</strong>
          </div>
          <div className="metric">
            <span>Time on shift</span>
            <strong>{duration(data.totals.shiftMinutes)}</strong>
          </div>
        </div>
      )}
      {data && data.items.length === 0 && (
        <p className="admin-empty">No earnings in these dates.</p>
      )}
      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Zone</th>
                <th>Deliveries</th>
                <th>Delivery fees</th>
                <th>Time on shift</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.riderId}>
                  <td>
                    {row.riderName}
                    <br />
                    <small>{row.riderCode}</small>
                  </td>
                  <td>{row.zoneName}</td>
                  <td>{row.deliveries}</td>
                  <td>{formatINR(row.feePaise)}</td>
                  <td>{duration(row.shiftMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ProfileChanges() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending")
  const changes = useProfileChanges({ status, page: 1, pageSize: 50 })
  const decide = useDecideProfileChange()
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const items = changes.data?.items ?? []
  const run = (input: { id: string; approve: boolean; reason?: string }) => {
    setError("")
    decide.mutate(input, {
      onSuccess: () => {
        setRejecting(null)
        setReason("")
      },
      onError: (cause) => setError(message(cause)),
    })
  }
  return (
    <section className="panel full-panel">
      <p className="muted">
        Riders ask for changes to their address, vehicle and licence details in the app. Nothing
        changes until you approve it. Rejecting needs a reason, which the rider sees.
      </p>
      <div className="gk-segment" role="tablist" aria-label="Change request status">
        {(["pending", "approved", "rejected"] as const).map((value) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={status === value}
            className={status === value ? "active" : ""}
            onClick={() => setStatus(value)}
          >
            {value === "pending"
              ? "Awaiting decision"
              : value === "approved"
                ? "Approved"
                : "Rejected"}
          </button>
        ))}
      </div>
      {error && (
        <p className="admin-empty" role="alert">
          {error}
        </p>
      )}
      {changes.data && items.length === 0 && (
        <p className="admin-empty">No change requests here.</p>
      )}
      {items.length > 0 && (
        <div className="table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Asked</th>
                <th>Change</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.riderName}
                    <br />
                    <small>
                      {row.riderCode} · {row.zoneName}
                    </small>
                  </td>
                  <td>{when(row.requestedAt)}</td>
                  <td>
                    {row.lines.map((line) => (
                      <div key={line.field}>
                        <strong>{line.field}</strong>: {line.from ?? "–"} → {line.to ?? "–"}
                      </div>
                    ))}
                    {row.reason && <small>Reason: {row.reason}</small>}
                  </td>
                  <td>
                    {row.status === "pending" && rejecting !== row.id && (
                      <>
                        <button
                          type="button"
                          className="btn"
                          disabled={decide.isPending}
                          onClick={() => run({ id: row.id, approve: true })}
                        >
                          Approve
                        </button>{" "}
                        <button
                          type="button"
                          className="btn"
                          disabled={decide.isPending}
                          onClick={() => {
                            setRejecting(row.id)
                            setReason("")
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {row.status === "pending" && rejecting === row.id && (
                      <>
                        <label>
                          Reason for the rider
                          <input
                            type="text"
                            maxLength={300}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                          />
                        </label>{" "}
                        <button
                          type="button"
                          className="btn"
                          disabled={decide.isPending || reason.trim() === ""}
                          onClick={() => run({ id: row.id, approve: false, reason: reason.trim() })}
                        >
                          Send rejection
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Analytics() {
  const [days, setDays] = useState(30)
  const analytics = useRiderAnalytics(days)
  const data = analytics.data
  return (
    <section className="panel full-panel">
      <p className="muted">
        How riders and orders are doing in each zone over the period you pick.
      </p>
      <div className="gk-segment" role="tablist" aria-label="Period">
        {[7, 30, 90].map((value) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={days === value}
            className={days === value ? "active" : ""}
            onClick={() => setDays(value)}
          >
            Last {value} days
          </button>
        ))}
      </div>
      {data && (
        <div className="fp-kpis">
          <div className="metric">
            <span>Deliveries</span>
            <strong>{data.totals.deliveries}</strong>
          </div>
          <div className="metric">
            <span>Offers sent</span>
            <strong>{data.totals.offersSent}</strong>
          </div>
          <div className="metric">
            <span>Offers accepted</span>
            <strong>{data.totals.offersAccepted}</strong>
          </div>
          <div className="metric">
            <span>Cash to hand over</span>
            <strong>{formatINR(data.totals.codOutstandingPaise)}</strong>
          </div>
        </div>
      )}
      {data && data.zones.length === 0 && <p className="admin-empty">No zones in scope.</p>}
      {data && data.zones.length > 0 && (
        <div className="table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Active riders</th>
                <th>Deliveries</th>
                <th>Offers accepted</th>
                <th>Offers expired</th>
                <th>Acceptance</th>
                <th>Cash to hand over</th>
              </tr>
            </thead>
            <tbody>
              {data.zones.map((zone) => (
                <tr key={zone.zoneId}>
                  <td>{zone.zoneName}</td>
                  <td>{zone.activeRiders}</td>
                  <td>{zone.deliveries}</td>
                  <td>
                    {zone.offersAccepted} of {zone.offersSent}
                  </td>
                  <td>{zone.offersExpired}</td>
                  <td>{zone.acceptanceRate === null ? "–" : `${zone.acceptanceRate}%`}</td>
                  <td>{formatINR(zone.codOutstandingPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.daily.length > 0 && (
        <p className="muted">
          Busiest day:{" "}
          {data.daily.reduce((best, day) => (day.deliveries > best.deliveries ? day : best)).date}
        </p>
      )}
    </section>
  )
}

function AppLogin() {
  const riders = useDeliveryBoys({ page: 1, pageSize: 50 })
  const issue = useIssueAppPassword()
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null)
  const [error, setError] = useState("")
  const items = riders.data?.items ?? []
  return (
    <section className="panel full-panel">
      <p className="muted">
        Riders sign in to the rider app with their phone number and an app password. Issue a
        password to a rider, then share it with them. It is shown only once. Issuing a new one
        replaces the old password, so the rider needs the new one to sign in again.
      </p>
      {issued && (
        <p className="admin-empty" role="status">
          New app password for {issued.name}: <strong>{issued.password}</strong>. Copy it now; it
          will not be shown again.
        </p>
      )}
      {error && (
        <p className="admin-empty" role="alert">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <div className="table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Phone</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((rider) => (
                <tr key={rider.id}>
                  <td>
                    {rider.name}
                    <br />
                    <small>{rider.code}</small>
                  </td>
                  <td>{rider.phone}</td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      disabled={issue.isPending}
                      onClick={() => {
                        if (!window.confirm(`Issue a new app password for ${rider.name}?`)) return
                        setError("")
                        issue.mutate(rider.id, {
                          onSuccess: (result) =>
                            setIssued({ name: rider.name, password: result.password }),
                          onError: (cause) => setError(message(cause)),
                        })
                      }}
                    >
                      Issue app password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
