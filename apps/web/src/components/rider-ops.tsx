"use client"
// Rider operations: support tickets from riders, cash handover from cash-on-delivery orders, and
// notices to riders. Used by the Admin portal (its zones) and the Super Admin portal (all zones).
import { ApiError } from "@zoauro/api-client"
import { formatINR } from "@zoauro/shared"
import { useState } from "react"
import { useManagedZones } from "@/lib/system"
import {
  useCodCollections,
  useConfirmHandover,
  useReplyToTicket,
  useResolveTicket,
  useRiderTickets,
  useSendNotice,
} from "@/lib/rider-ops"

type Tab = "Support" | "Cash handover" | "Send notice"

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : "That didn’t work. Try again."

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

export function RiderOps() {
  const [tab, setTab] = useState<Tab>("Support")
  return (
    <div className="rider-ops">
      <div className="gk-segment" role="tablist" aria-label="Rider operations">
        {(["Support", "Cash handover", "Send notice"] as const).map((item) => (
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
      {tab === "Support" && <Support />}
      {tab === "Cash handover" && <Cash />}
      {tab === "Send notice" && <Notice />}
    </div>
  )
}

function Support() {
  const [status, setStatus] = useState<"open" | "resolved">("open")
  const tickets = useRiderTickets(status)
  const reply = useReplyToTicket()
  const resolve = useResolveTicket()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const items = tickets.data?.items ?? []

  const send = async (id: string) => {
    setError("")
    const body = (drafts[id] ?? "").trim()
    if (body.length < 2) return setError("Write a reply first.")
    try {
      await reply.mutateAsync({ id, body })
      setDrafts((current) => ({ ...current, [id]: "" }))
    } catch (cause) {
      setError(message(cause))
    }
  }

  return (
    <section className="panel full-panel">
      <div className="gk-segment" role="tablist" aria-label="Ticket status">
        {(["open", "resolved"] as const).map((value) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={status === value}
            className={status === value ? "active" : ""}
            onClick={() => setStatus(value)}
          >
            {value === "open" ? "Open" : "Resolved"}
          </button>
        ))}
      </div>
      {error && (
        <p className="admin-empty" role="alert">
          {error}
        </p>
      )}
      {tickets.data && items.length === 0 && (
        <p className="admin-empty">No {status} tickets from riders.</p>
      )}
      <ul className="ticket-list">
        {items.map((ticket) => (
          <li key={ticket.id} className="ticket">
            <header>
              <div>
                <strong>{ticket.subject}</strong>
                <small>
                  {ticket.riderName} · {ticket.riderCode} · {ticket.zoneName}
                </small>
              </div>
              <small>{when(ticket.updatedAt)}</small>
            </header>
            <ol>
              {ticket.messages.map((message) => (
                <li key={message.id} className={message.fromRole === "team" ? "team" : "rider"}>
                  <small>
                    {message.authorName} · {when(message.createdAt)}
                  </small>
                  <p>{message.body}</p>
                </li>
              ))}
            </ol>
            {ticket.status === "open" && (
              <div className="ticket-reply">
                <textarea
                  aria-label={`Reply to ${ticket.subject}`}
                  rows={2}
                  value={drafts[ticket.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((current) => ({ ...current, [ticket.id]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="btn"
                  disabled={reply.isPending}
                  onClick={() => void send(ticket.id)}
                >
                  Send reply
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={resolve.isPending}
                  onClick={() => {
                    if (
                      window.confirm("Mark this ticket resolved? The rider will see it closed.")
                    ) {
                      void resolve.mutateAsync(ticket.id).catch((cause) => setError(message(cause)))
                    }
                  }}
                >
                  Mark resolved
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Cash() {
  const [status, setStatus] = useState<"collected" | "handed_over" | undefined>("collected")
  const cod = useCodCollections(status)
  const handover = useConfirmHandover()
  const [error, setError] = useState("")
  const items = cod.data?.items ?? []

  return (
    <section className="panel full-panel">
      <div className="fp-kpis">
        <div className="metric warn">
          <span>With riders</span>
          <strong>{formatINR(cod.data?.outstandingPaise ?? 0)}</strong>
        </div>
        <div className="metric">
          <span>Collections shown</span>
          <strong>{cod.data?.total ?? "–"}</strong>
        </div>
      </div>
      <div className="gk-segment" role="tablist" aria-label="Cash status">
        {(
          [
            ["collected", "With riders"],
            ["handed_over", "Handed over"],
            [undefined, "All"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            role="tab"
            key={label}
            aria-selected={status === value}
            className={status === value ? "active" : ""}
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="admin-empty" role="alert">
          {error}
        </p>
      )}
      {cod.data && items.length === 0 && <p className="admin-empty">No cash collections here.</p>}
      {items.length > 0 && (
        <div className="table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Rider</th>
                <th>Zone</th>
                <th>Amount</th>
                <th>Collected</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{row.orderCode}</td>
                  <td>
                    {row.riderName}
                    <br />
                    <small>{row.riderCode}</small>
                  </td>
                  <td>{row.zoneName}</td>
                  <td>{formatINR(row.amountPaise)}</td>
                  <td>{when(row.collectedAt)}</td>
                  <td>
                    {row.status === "collected"
                      ? "With rider"
                      : `Handed over ${when(row.handedOverAt ?? row.collectedAt)}`}
                  </td>
                  <td>
                    {row.status === "collected" && (
                      <button
                        type="button"
                        className="btn"
                        disabled={handover.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Confirm ${formatINR(row.amountPaise)} was handed over by ${row.riderName}?`,
                            )
                          ) {
                            void handover
                              .mutateAsync(row.id)
                              .catch((cause) => setError(message(cause)))
                          }
                        }}
                      >
                        Confirm handover
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

function Notice() {
  const zones = useManagedZones()
  const send = useSendNotice()
  const [zoneId, setZoneId] = useState("")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [result, setResult] = useState("")
  const [error, setError] = useState("")
  const activeZones = (zones.data ?? []).filter((zone) => zone.active)

  const submit = async () => {
    setError("")
    setResult("")
    try {
      const sent = await send.mutateAsync({
        title,
        body,
        ...(zoneId && { zoneId }),
      })
      setResult(`Sent to ${sent.sent} rider${sent.sent === 1 ? "" : "s"}.`)
      setTitle("")
      setBody("")
    } catch (cause) {
      setError(message(cause))
    }
  }

  return (
    <section className="panel full-panel">
      <p className="muted">
        Riders see notices in their app. Leave the zone blank to send to every active rider you can
        see.
      </p>
      <div className="form-grid">
        <label className="field">
          <span>Zone</span>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">Every active rider in my zones</option>
            {activeZones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.location}, {zone.city}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className="field">
          <span>Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={1000}
          />
        </label>
      </div>
      {error && (
        <p className="admin-empty" role="alert">
          {error}
        </p>
      )}
      {result && <p className="admin-empty">{result}</p>}
      <button type="button" className="btn" disabled={send.isPending} onClick={() => void submit()}>
        {send.isPending ? "Sending…" : "Send notice"}
      </button>
    </section>
  )
}
