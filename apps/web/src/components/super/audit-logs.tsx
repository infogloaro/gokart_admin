"use client"

import * as Dialog from "@radix-ui/react-dialog"
import {
  AUDIT_MODULES,
  type AuditLogEntry,
  type AuditModule,
  type AuditSource,
  type Role,
} from "@zoauro/shared"
import {
  Activity,
  Check,
  Clipboard,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react"
import { useDeferredValue, useState } from "react"
import { useSince } from "@/lib/motion"
import { auditCsv, type AuditFilters, useAuditLogs } from "@/lib/system"
import { Button, IconButton, Input, Panel, Toast } from "./ui"
import { Count, HeadActions } from "./dashboard"
import { useCsvExport } from "./export"
import { useRefreshToast } from "@/components/refresh-toast"

const moduleLabels: Record<AuditModule, string> = {
  auth: "Authentication",
  order: "Orders",
  partner: "Delivery partners",
  vendor: "Vendors",
  member: "Admin & permissions",
  zone: "Service areas",
  fee_rule: "Areas & fees",
  finance: "Finance",
}
const sourceLabels: Record<AuditSource, string> = {
  web: "Web",
  mobile_app: "Mobile app",
  api: "API",
  system: "System",
}
const pageSizes = [10, 25, 50, 100] as const
const formatAction = (action: string) =>
  action
    .split(/[._]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })
const moduleFromAction = (action: string): AuditModule | undefined => {
  const prefix = action.startsWith("fee_rule.") ? "fee_rule" : action.split(".")[0]
  return AUDIT_MODULES.find((module) => module === prefix)
}
const sourceLabel = (source: string | null) =>
  source && source in sourceLabels ? sourceLabels[source as AuditSource] : "Unknown"
const displayValue = (value: string | null | undefined) => value || "Not recorded"

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  return (
    <span className="audit-copy-wrap">
      <Button
        className="audit-copy"
        icon={copied ? Check : Clipboard}
        aria-label={`Copy ${label}`}
        onClick={() => {
          setCopied(false)
          setError(false)
          void navigator.clipboard
            .writeText(value)
            .then(() => setCopied(true))
            .catch(() => setError(true))
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
      {error && <span role="alert">Clipboard unavailable</span>}
    </span>
  )
}

function DetailValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <>Not recorded</>
  if (typeof value === "object") return <pre>{JSON.stringify(value, null, 2)}</pre>
  return <>{String(value)}</>
}

function AuditDetailsDrawer({ entry, close }: { entry: AuditLogEntry; close: () => void }) {
  const eventModule = moduleFromAction(entry.action)
  const detail =
    entry.detail && typeof entry.detail === "object" && !Array.isArray(entry.detail)
      ? (entry.detail as Record<string, unknown>)
      : null
  const changes = detail?.changes
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Overlay className="drawer-overlay audit-drawer-overlay">
        <Dialog.Content className="audit-drawer" aria-describedby={undefined}>
          <header className="audit-drawer-header">
            <div>
              <span className="audit-drawer-eyebrow">Audit event</span>
              <Dialog.Title>{formatAction(entry.action)}</Dialog.Title>
              <p>{formatDate(entry.at)}</p>
            </div>
            <Dialog.Close asChild>
              <IconButton icon={X} label="Close details" />
            </Dialog.Close>
          </header>
          <main className="audit-drawer-body">
            <section className="audit-detail-section">
              <h3>Event information</h3>
              <dl>
                <dt>Event ID</dt>
                <dd className="audit-mono audit-copy-field">
                  <span>{entry.id}</span>
                  <CopyButton value={entry.id} label="event ID" />
                </dd>
                <dt>Exact timestamp</dt>
                <dd className="audit-mono">{new Date(entry.at).toISOString()}</dd>
                <dt>Module</dt>
                <dd>{eventModule ? moduleLabels[eventModule] : "Not recorded"}</dd>
                <dt>Action</dt>
                <dd>{formatAction(entry.action)}</dd>
                <dt>Result / severity</dt>
                <dd>Not recorded</dd>
                <dt>Request ID</dt>
                <dd>Not recorded</dd>
              </dl>
            </section>
            <section className="audit-detail-section">
              <h3>Administrator</h3>
              <dl>
                <dt>Name</dt>
                <dd>{entry.actorName}</dd>
                <dt>User ID</dt>
                <dd className="audit-mono audit-copy-field">
                  <span>{displayValue(entry.actorId)}</span>
                  {entry.actorId && <CopyButton value={entry.actorId} label="administrator ID" />}
                </dd>
                <dt>Role</dt>
                <dd>{displayValue(entry.actorRole)}</dd>
              </dl>
            </section>
            <section className="audit-detail-section">
              <h3>Source & network</h3>
              <dl>
                <dt>Source</dt>
                <dd>{sourceLabel(entry.source)}</dd>
                <dt>IP address</dt>
                <dd className="audit-mono audit-copy-field">
                  <span>{displayValue(entry.ip)}</span>
                  {entry.ip && <CopyButton value={entry.ip} label="IP address" />}
                </dd>
                <dt>User agent</dt>
                <dd className="audit-user-agent">{displayValue(entry.userAgent)}</dd>
              </dl>
            </section>
            <section className="audit-detail-section">
              <h3>Affected record</h3>
              <dl>
                <dt>Type</dt>
                <dd>{entry.entityType}</dd>
                <dt>Record ID</dt>
                <dd className="audit-mono audit-copy-field">
                  <span>{entry.entityId}</span>
                  {entry.entityId && <CopyButton value={entry.entityId} label="record ID" />}
                </dd>
              </dl>
            </section>
            <section className="audit-detail-section">
              <h3>Change details</h3>
              {changes && typeof changes === "object" ? (
                <dl className="audit-changes">
                  {Object.entries(changes).map(([field, change]) => {
                    const values =
                      change && typeof change === "object"
                        ? (change as Record<string, unknown>)
                        : null
                    return (
                      <div key={field}>
                        <dt>{field}</dt>
                        <dd>
                          <span>Previous</span>
                          <DetailValue value={values?.before} />
                        </dd>
                        <dd>
                          <span>New</span>
                          <DetailValue value={values?.after} />
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              ) : (
                <p>No before-and-after values were recorded for this event.</p>
              )}
            </section>
            <section className="audit-detail-section">
              <h3>Event metadata</h3>
              {detail ? (
                <details className="audit-metadata">
                  <summary>Show safe metadata</summary>
                  <pre>{JSON.stringify(detail, null, 2)}</pre>
                  <CopyButton value={JSON.stringify(detail, null, 2)} label="event metadata" />
                </details>
              ) : (
                <p>Not recorded</p>
              )}
            </section>
          </main>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  )
}

export function AuditLogs() {
  const runRefresh = useRefreshToast()
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search.trim())
  const [actor, setActor] = useState("")
  const [role, setRole] = useState<Role | "">("")
  const [module, setModule] = useState<AuditModule | "">("")
  const [action, setAction] = useState("")
  const [source, setSource] = useState<AuditSource | "">("")
  const [ip, setIp] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof pageSizes)[number]>(25)
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)
  const filters: Omit<AuditFilters, "page" | "pageSize"> = {
    search: deferredSearch || undefined,
    actor: actor.trim() || undefined,
    role: role || undefined,
    module: module || undefined,
    action: action.trim() || undefined,
    source: source || undefined,
    ip: ip.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
  }
  const logs = useAuditLogs({ ...filters, page, pageSize })
  const csv = useCsvExport()
  const updated = useSince(logs.dataUpdatedAt)
  const pages = Math.max(1, Math.ceil((logs.data?.total ?? 0) / pageSize))
  const clearFilters = () => {
    setSearch("")
    setActor("")
    setRole("")
    setModule("")
    setAction("")
    setSource("")
    setIp("")
    setFrom("")
    setTo("")
    setPage(1)
  }

  return (
    <>
      <HeadActions>
        <span className="updated-note" aria-live="polite">
          Updated {updated}
        </span>
        <Button
          icon={Download}
          disabled={csv.exporting || logs.isFetching || logs.isError}
          onClick={() => void csv.run("audit-log", () => auditCsv(filters))}
        >
          {csv.exporting ? "Exporting…" : "Export filtered"}
        </Button>
        <Button
          primary
          icon={RefreshCw}
          className={logs.isFetching ? "spinning" : ""}
          onClick={() =>
            void runRefresh(async () => {
              const result = await logs.refetch()
              if (result.isError) throw new Error("Refresh failed")
            })
          }
        >
          Refresh
        </Button>
      </HeadActions>

      <div className="sys-summary audit-summary">
        <div>
          <Activity size={18} />
          <span>Matching events</span>
          <Count value={logs.data?.total} />
        </div>
        <div>
          <ShieldCheck size={18} />
          <span>Successful sign-ins</span>
          <Count value={logs.data?.successfulSignIns} />
        </div>
        <div>
          <Activity size={18} />
          <span>Administrative changes</span>
          <Count value={logs.data?.administrativeChanges} />
        </div>
      </div>

      <Panel
        title="Audit & Logs"
        subtitle="Search and review recorded administrative activity. Counts follow the selected filters and date range."
      >
        <div className="audit-filters" role="search" aria-label="Audit filters">
          <Input
            icon={Search}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search events…"
            aria-label="Search audit events"
          />
          <Input
            value={actor}
            onChange={(event) => {
              setActor(event.target.value)
              setPage(1)
            }}
            placeholder="Administrator"
            aria-label="Filter by administrator name or ID"
          />
          <label className="audit-filter">
            <span className="sr-only">Role</span>
            <select
              value={role}
              onChange={(event) => {
                setRole(event.target.value as Role | "")
                setPage(1)
              }}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="audit-filter">
            <span className="sr-only">Module</span>
            <select
              value={module}
              onChange={(event) => {
                setModule(event.target.value as AuditModule | "")
                setPage(1)
              }}
              aria-label="Filter by module"
            >
              <option value="">All modules</option>
              {AUDIT_MODULES.map((value) => (
                <option key={value} value={value}>
                  {moduleLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <Input
            value={action}
            onChange={(event) => {
              setAction(event.target.value)
              setPage(1)
            }}
            placeholder="Action"
            aria-label="Filter by action"
          />
          <label className="audit-filter">
            <span className="sr-only">Source</span>
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value as AuditSource | "")
                setPage(1)
              }}
              aria-label="Filter by source"
            >
              <option value="">All sources</option>
              {Object.entries(sourceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Input
            value={ip}
            onChange={(event) => {
              setIp(event.target.value)
              setPage(1)
            }}
            placeholder="IP address"
            aria-label="Filter by IP address"
          />
          <label className="audit-date-range">
            <span>Date range</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value)
                setPage(1)
              }}
              aria-label="Audit events from date"
            />
            <span aria-hidden="true">—</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value)
                setPage(1)
              }}
              aria-label="Audit events to date"
            />
          </label>
          <Button onClick={clearFilters}>Clear filters</Button>
          <span className="audit-result-count">
            {logs.data?.total.toLocaleString("en-IN") ?? "—"} matching records
          </span>
        </div>

        {logs.isError ? (
          <p className="sys-state error" role="alert">
            Could not load audit events. {logs.error.message}
          </p>
        ) : logs.isPending ? (
          <p className="sys-state">Loading audit events…</p>
        ) : logs.data?.items.length ? (
          <div className="sys-table-scroll">
            <table className="sys-table audit-table">
              <thead>
                <tr>
                  <th>Date & time</th>
                  <th>Administrator</th>
                  <th>Role</th>
                  <th>Module</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Source</th>
                  <th>IP address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.data.items.map((entry) => {
                  const moduleForEntry = moduleFromAction(entry.action)
                  const successfulSignIn = entry.action === "auth.signed_in"
                  return (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.at)}</td>
                      <td>
                        <strong>{entry.actorName}</strong>
                        <small>{displayValue(entry.actorId)}</small>
                      </td>
                      <td>
                        {entry.actorRole ? (
                          <span className="audit-role">{entry.actorRole.replace("_", " ")}</span>
                        ) : (
                          <span className="audit-missing">Not recorded</span>
                        )}
                      </td>
                      <td>
                        <span className="audit-module">
                          {moduleForEntry ? moduleLabels[moduleForEntry] : "Unknown"}
                        </span>
                      </td>
                      <td>
                        <span className={`audit-action ${successfulSignIn ? "success" : ""}`}>
                          {formatAction(entry.action)}
                        </span>
                      </td>
                      <td>
                        <strong>{entry.entityType}</strong>
                        <small>{entry.entityId}</small>
                      </td>
                      <td>{sourceLabel(entry.source)}</td>
                      <td className="audit-ip">{entry.ip ?? "Not recorded"}</td>
                      <td>
                        <Button className="audit-view-details" onClick={() => setSelected(entry)}>
                          View details
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sys-state">No audit records match the selected date range and filters.</p>
        )}
        {logs.data && logs.data.total > 0 && (
          <div className="sys-pagination audit-pagination">
            <span>
              Showing {Math.min((page - 1) * pageSize + 1, logs.data.total)}–
              {Math.min(page * pageSize, logs.data.total)} of {logs.data.total}
            </span>
            <label>
              Rows per page
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value) as (typeof pageSizes)[number])
                  setPage(1)
                }}
              >
                {pageSizes.map((size) => (
                  <option value={size} key={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <Button
                disabled={page <= 1 || logs.isFetching}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} of {pages}
              </span>
              <Button
                disabled={page >= pages || logs.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Panel>
      {selected && <AuditDetailsDrawer entry={selected} close={() => setSelected(null)} />}
      {csv.toast && <Toast toast={csv.toast} close={csv.dismiss} />}
    </>
  )
}
