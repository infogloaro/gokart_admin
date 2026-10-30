"use client"
// Customer complaints for both portals: summary tiles, filters, the queue, and a side panel
// to assign, escalate, resolve, reopen and add notes. Order exceptions sit in the other tab.
import * as Dialog from "@radix-ui/react-dialog"
import { ApiError } from "@zoauro/api-client"
import {
  businessName,
  complaintCategoryLabel,
  complaintStatusLabel,
  COMPLAINT_PRIORITIES,
  formatINR,
  type Business,
  type Complaint,
  type ComplaintDetail,
  type ComplaintPriority,
  type ComplaintStatus,
} from "@zoauro/shared"
import {
  AlertOctagon,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileImage,
  Flag,
  Inbox,
  MessageSquare,
  RotateCcw,
  Search,
  UserCheck,
  UserRound,
  X,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { age } from "@/lib/dashboard"
import { useMe } from "@/lib/session"
import {
  useAssignees,
  useComplaint,
  useComplaintAction,
  useComplaints,
  useComplaintSummary,
} from "@/lib/operations"
import { OrderExceptions } from "./order-exceptions"

type Portal = "super" | "admin"
type StatusTab = "active" | ComplaintStatus

const TABS: { value: StatusTab; label: string }[] = [
  { value: "active", label: "All active" },
  { value: "open", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
]
const priorityLabel: Record<ComplaintPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
const message = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Try again in a moment."

/** The Complaints & exceptions screen: customer complaints, and order exceptions. */
export function ComplaintsCenter({
  business,
  portal,
}: {
  business?: Business | undefined
  portal: Portal
}) {
  const [tab, setTab] = useState<"complaints" | "exceptions">("complaints")
  const me = useMe()
  const canView = Boolean(me.data?.permissions.includes("complaints.view"))
  const summary = useComplaintSummary(business, canView)
  const s = summary.data
  const active = s ? s.open + s.inReview + s.escalated : undefined
  return (
    <section className="cmp-center gk-page">
      <header className="cmp-hero">
        <span className="cmp-hero-icon">
          <Inbox size={22} />
        </span>
        <div>
          <small>{business ? businessName[business] : "All businesses"}</small>
          <h1>Complaints &amp; exceptions</h1>
          <p>
            Work customer complaints to resolution, and catch orders that slipped past their time
            limit.
          </p>
        </div>
        <div className="cmp-switch" role="tablist" aria-label="Queue">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "complaints"}
            className={tab === "complaints" ? "active" : ""}
            onClick={() => setTab("complaints")}
          >
            Customer complaints {active !== undefined && <b>{active}</b>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "exceptions"}
            className={tab === "exceptions" ? "active" : ""}
            onClick={() => setTab("exceptions")}
          >
            Order exceptions
          </button>
        </div>
      </header>
      {tab === "complaints" ? (
        <ComplaintsBoard business={business} portal={portal} />
      ) : (
        <OrderExceptions business={business} portal={portal} embedded />
      )}
    </section>
  )
}

function ComplaintsBoard({
  business,
  portal,
}: {
  business?: Business | undefined
  portal: Portal
}) {
  const params = useSearchParams()
  const linked = params.get("complaint")
  const [status, setStatus] = useState<StatusTab>("active")
  const [priority, setPriority] = useState<ComplaintPriority | "">("")
  const [mine, setMine] = useState(false)
  const [unassigned, setUnassigned] = useState(false)
  const [search, setSearch] = useState(linked ?? "")
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const summary = useComplaintSummary(business)
  const list = useComplaints({
    business,
    status: status === "active" ? undefined : status,
    priority: priority || undefined,
    assignee: mine ? "me" : unassigned ? "none" : undefined,
    search: search.trim() || undefined,
    page,
    pageSize: 8,
  })
  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 8))

  // A notification link (?complaint=CMP-2043) opens that complaint once it's in the list.
  useEffect(() => {
    if (!linked || openId) return
    const hit = items.find((c) => c.code === linked)
    if (hit) setOpenId(hit.id)
  }, [linked, items, openId])

  const s = summary.data
  const tiles: {
    label: string
    value: number | undefined
    icon: typeof Inbox
    tone: string
    act: () => void
    on: boolean
  }[] = [
    {
      label: "Open",
      value: s?.open,
      icon: Inbox,
      tone: "info",
      act: () => (setStatus("open"), setPage(1)),
      on: status === "open",
    },
    {
      label: "In review",
      value: s?.inReview,
      icon: Clock3,
      tone: "gold",
      act: () => (setStatus("in_review"), setPage(1)),
      on: status === "in_review",
    },
    {
      label: "Escalated",
      value: s?.escalated,
      icon: Flag,
      tone: "danger",
      act: () => (setStatus("escalated"), setPage(1)),
      on: status === "escalated",
    },
    {
      label: "Urgent",
      value: s?.urgent,
      icon: AlertOctagon,
      tone: "danger",
      act: () => (setPriority(priority === "urgent" ? "" : "urgent"), setPage(1)),
      on: priority === "urgent",
    },
    {
      label: "Unassigned",
      value: s?.unassigned,
      icon: UserRound,
      tone: "neutral",
      act: () => (setUnassigned(!unassigned), setMine(false), setPage(1)),
      on: unassigned,
    },
  ]

  return (
    <>
      <div className="cmp-tiles">
        {tiles.map((t, i) => (
          <button
            type="button"
            key={t.label}
            className={`cmp-tile ${t.tone}${t.on ? " on" : ""}`}
            style={{ animationDelay: `${i * 50}ms` }}
            onClick={t.act}
            aria-pressed={t.on}
          >
            <i>
              <t.icon size={18} />
            </i>
            <span>{t.label}</span>
            <strong>{t.value ?? "—"}</strong>
          </button>
        ))}
      </div>

      <section className="cmp-panel">
        <div className="cmp-tabs" role="tablist" aria-label="Status">
          {TABS.map((t) => (
            <button
              type="button"
              role="tab"
              key={t.value}
              aria-selected={status === t.value}
              className={status === t.value ? "active" : ""}
              onClick={() => (setStatus(t.value), setPage(1))}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="cmp-filters">
          <label className="cmp-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => (setSearch(e.target.value), setPage(1))}
              placeholder="Search complaint, order, customer or vendor…"
              aria-label="Search complaints"
            />
          </label>
          <select
            value={priority}
            onChange={(e) => (setPriority(e.target.value as ComplaintPriority | ""), setPage(1))}
            aria-label="Priority"
          >
            <option value="">All priorities</option>
            {COMPLAINT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel[p]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`cmp-chip${mine ? " on" : ""}`}
            aria-pressed={mine}
            onClick={() => (setMine(!mine), setUnassigned(false), setPage(1))}
          >
            <UserCheck size={15} /> Assigned to me
          </button>
          <span className="cmp-count">
            {total} {total === 1 ? "complaint" : "complaints"}
          </span>
        </div>

        {list.isError ? (
          <p className="cmp-error" role="alert">
            {message(list.error)}
          </p>
        ) : (
          <ul className="cmp-list">
            {list.isPending &&
              Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="cmp-row skeleton" aria-hidden="true" />
              ))}
            {items.map((c, i) => (
              <li key={c.id} style={{ animationDelay: `${i * 40}ms` }}>
                <button
                  type="button"
                  className={`cmp-row p-${c.priority}`}
                  onClick={() => setOpenId(c.id)}
                >
                  <span className="cmp-row-main">
                    <span className="cmp-row-top">
                      <b>{c.code}</b>
                      <span className="cmp-cat">{complaintCategoryLabel[c.category]}</span>
                      <span className={`cmp-pri ${c.priority}`}>{priorityLabel[c.priority]}</span>
                    </span>
                    <strong>{c.summary}</strong>
                    <small>
                      {c.customerName}
                      {c.vendorName && ` · ${c.vendorName}`}
                      {c.orderCode && ` · #${c.orderCode}`} · {age(c.createdAt)} ago
                    </small>
                  </span>
                  <span className="cmp-row-side">
                    <span className={`cmp-status ${c.status}`}>
                      {complaintStatusLabel[c.status]}
                    </span>
                    {c.assigneeName ? (
                      <span className="cmp-avatar" title={`Assigned to ${c.assigneeName}`}>
                        {initials(c.assigneeName)}
                      </span>
                    ) : (
                      <span className="cmp-avatar empty" title="Unassigned">
                        <UserRound size={14} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {!list.isPending && items.length === 0 && (
              <li className="cmp-empty">
                <CheckCircle2 size={28} />
                <strong>Nothing here</strong>
                <span>No complaints match these filters.</span>
              </li>
            )}
          </ul>
        )}
        {pages > 1 && (
          <footer className="cmp-pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </footer>
        )}
      </section>
      <ComplaintPanel id={openId} close={() => setOpenId(null)} portal={portal} />
    </>
  )
}

function ComplaintPanel({
  id,
  close,
  portal,
}: {
  id: string | null
  close: () => void
  portal: Portal
}) {
  const me = useMe()
  const canManage = Boolean(me.data?.permissions.includes("complaints.manage"))
  const q = useComplaint(id)
  const people = useAssignees(id, canManage)
  const act = useComplaintAction()
  const [mode, setMode] = useState<"escalate" | "resolve" | "reopen" | null>(null)
  const [text, setText] = useState("")
  const [note, setNote] = useState("")
  const c = q.data
  useEffect(() => {
    setMode(null)
    setText("")
    setNote("")
    act.reset()
  }, [id])

  const run = (a: Parameters<typeof act.mutate>[0]["a"], after?: () => void) =>
    c && act.mutate({ c, a }, { onSuccess: () => after?.() })
  const orderHref = (x: Complaint) =>
    portal === "admin"
      ? `/admin/${x.business}/orders?search=${encodeURIComponent(x.orderCode ?? "")}`
      : `/super/orders?business=${x.business}&search=${encodeURIComponent(x.orderCode ?? "")}`

  return (
    <Dialog.Root open={Boolean(id)} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmp-overlay" />
        <Dialog.Content className="cmp-drawer" aria-describedby={undefined}>
          <header>
            <div>
              <Dialog.Title asChild>
                <strong>{c ? c.code : "Complaint"}</strong>
              </Dialog.Title>
              {c && (
                <span className="cmp-drawer-tags">
                  <span className={`cmp-status ${c.status}`}>{complaintStatusLabel[c.status]}</span>
                  <span className={`cmp-pri ${c.priority}`}>{priorityLabel[c.priority]}</span>
                  <span className="cmp-cat">{complaintCategoryLabel[c.category]}</span>
                </span>
              )}
            </div>
            <Dialog.Close asChild>
              <button type="button" className="cmp-icon-btn" aria-label="Close">
                <X size={18} />
              </button>
            </Dialog.Close>
          </header>
          {!c ? (
            <div className="cmp-drawer-body">
              {q.isError ? (
                <p className="cmp-error">{message(q.error)}</p>
              ) : (
                <div className="cmp-skel-block" />
              )}
            </div>
          ) : (
            <div className="cmp-drawer-body">
              <section className="cmp-summary">
                <h2>{c.summary}</h2>
                <p>{c.details}</p>
                <dl>
                  <div>
                    <dt>Customer</dt>
                    <dd>{c.customerName}</dd>
                  </div>
                  <div>
                    <dt>{c.business === "food" ? "Restaurant" : "Seller"}</dt>
                    <dd>{c.vendorName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Order</dt>
                    <dd>
                      {c.orderCode ? (
                        <Link href={orderHref(c)} onClick={close}>
                          #{c.orderCode} <ArrowUpRight size={13} />
                        </Link>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Claim</dt>
                    <dd>{c.claimPaise === null ? "—" : formatINR(c.claimPaise)}</dd>
                  </div>
                </dl>
                {c.evidence.length > 0 && (
                  <div className="cmp-evidence">
                    {c.evidence.map((e) => (
                      <span key={e}>
                        <FileImage size={14} /> {e}
                      </span>
                    ))}
                  </div>
                )}
                {c.resolution && (
                  <p className="cmp-resolution">
                    <CheckCircle2 size={15} /> {c.resolution}
                  </p>
                )}
              </section>

              {canManage && (
                <section className="cmp-actions">
                  <label>
                    <span>Assigned to</span>
                    <select
                      value={c.assigneeId ?? ""}
                      disabled={act.isPending || c.status === "resolved"}
                      onChange={(e) => run({ kind: "assign", assigneeId: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {people.data?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.id === me.data?.id ? " (you)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="cmp-action-row">
                    {c.status !== "resolved" && c.status !== "escalated" && (
                      <button
                        type="button"
                        className="cmp-btn danger"
                        onClick={() => setMode("escalate")}
                      >
                        <Flag size={15} /> Escalate
                      </button>
                    )}
                    {c.status !== "resolved" && (
                      <button
                        type="button"
                        className="cmp-btn primary"
                        onClick={() => setMode("resolve")}
                      >
                        <CheckCircle2 size={15} /> Resolve
                      </button>
                    )}
                    {c.status === "resolved" && (
                      <button type="button" className="cmp-btn" onClick={() => setMode("reopen")}>
                        <RotateCcw size={15} /> Reopen
                      </button>
                    )}
                  </div>
                  {mode && (
                    <form
                      method="post"
                      className="cmp-confirm"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const v = text.trim()
                        if (v.length < 5) return
                        run(
                          mode === "escalate"
                            ? { kind: "escalate", reason: v }
                            : mode === "resolve"
                              ? { kind: "resolve", resolution: v }
                              : { kind: "reopen", reason: v },
                          () => (setMode(null), setText("")),
                        )
                      }}
                    >
                      <label>
                        <span>
                          {mode === "escalate"
                            ? "Why does this need the Super Admin?"
                            : mode === "resolve"
                              ? "How was it resolved?"
                              : "Why reopen it?"}
                        </span>
                        <textarea
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          rows={3}
                          placeholder={
                            mode === "resolve"
                              ? "e.g. Refund of ₹720 approved; vendor warned about packing."
                              : "At least 5 characters"
                          }
                        />
                      </label>
                      <div className="cmp-action-row">
                        <button
                          type="button"
                          className="cmp-btn"
                          onClick={() => (setMode(null), setText(""))}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={`cmp-btn ${mode === "escalate" ? "danger" : "primary"}`}
                          disabled={text.trim().length < 5 || act.isPending}
                        >
                          {act.isPending
                            ? "Saving…"
                            : mode === "escalate"
                              ? "Escalate"
                              : mode === "resolve"
                                ? "Mark resolved"
                                : "Reopen"}
                        </button>
                      </div>
                    </form>
                  )}
                  {act.isError && (
                    <p className="cmp-error" role="alert">
                      {message(act.error)}
                    </p>
                  )}
                </section>
              )}

              <section className="cmp-timeline">
                <h3>History</h3>
                <ol>
                  {[...c.notes].reverse().map((n, i) => (
                    <li key={n.id} className={n.kind} style={{ animationDelay: `${i * 35}ms` }}>
                      <i />
                      <div>
                        <strong>
                          {n.authorName}
                          <span> · {noteVerb[n.kind]}</span>
                        </strong>
                        <p>{n.body}</p>
                        <small>{age(n.at)} ago</small>
                      </div>
                    </li>
                  ))}
                </ol>
                {canManage && (
                  <form
                    method="post"
                    className="cmp-note"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (note.trim()) run({ kind: "note", body: note.trim() }, () => setNote(""))
                    }}
                  >
                    <MessageSquare size={16} />
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add an internal note…"
                      aria-label="Internal note"
                    />
                    <button
                      type="submit"
                      className="cmp-btn primary"
                      disabled={!note.trim() || act.isPending}
                    >
                      Add
                    </button>
                  </form>
                )}
              </section>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const noteVerb: Record<ComplaintDetail["notes"][number]["kind"], string> = {
  created: "raised the complaint",
  note: "added a note",
  assigned: "changed the assignee",
  escalated: "escalated",
  resolved: "resolved",
  reopened: "reopened",
}
