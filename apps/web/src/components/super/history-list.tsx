"use client"

import { useBoyHistory, useFleetHistory } from "@/lib/delivery"
import { RiderTimeline } from "@/components/delivery/rider-timeline"

const ACTION_LABEL: Record<string, string> = {
  "fleet.requested": "Partner requested by Admin",
  "fleet.approved": "Partner approved",
  "fleet.rejected": "Partner rejected",
  "fleet.created": "Partner created",
  "fleet.updated": "Profile or status edited",
  "fleet.credential_rotated": "Credential rotated",
  "fleet.zone_assigned": "Zone assigned",
  "fleet.zone_reassigned": "Zone reassigned",
  "boy.submitted": "Delivery boy submitted",
  "boy.corrections_resubmitted": "Corrections resubmitted",
  "boy.forwarded": "Forwarded to Super Admin",
  "boy.corrections_requested": "Corrections requested",
  "boy.rejected": "Application rejected",
  "boy.approved": "Final approval",
  "boy.document_verified": "Document verified",
  "boy.document_unverified": "Document verification removed",
}

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value)

function show(value: unknown) {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "string") return isIsoDate(value) ? value.slice(0, 10) : value
  return String(value)
}

function HistoryRows({ query }: { query: ReturnType<typeof useFleetHistory> }) {
  if (query.isPending) return <p>Loading history…</p>
  if (query.isError) return <p role="alert">The history couldn’t be loaded.</p>
  if (!query.data?.length) return <p>No changes recorded yet.</p>
  return (
    <ol className="history-list">
      {query.data.map((entry) => (
        <li key={entry.id} className="history-item">
          <header>
            <b>{ACTION_LABEL[entry.action] ?? entry.action}</b>
            <small>
              {entry.actorName} · {entry.actorRole.replaceAll("_", " ")} ·{" "}
              {new Date(entry.at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          </header>
          {entry.reason && (
            <p className="history-reason">
              <b>Why:</b> {entry.reason}
            </p>
          )}
          {entry.changes && Object.keys(entry.changes).length > 0 && (
            <ul className="history-changes">
              {Object.entries(entry.changes).map(([field, change]) => (
                <li key={field}>
                  <code>{field}</code>: {show(change.from)} → {show(change.to)}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}

export function FleetHistory({ fleetId }: { fleetId: string }) {
  return <HistoryRows query={useFleetHistory(fleetId)} />
}

export function BoyHistory({ boyId }: { boyId: string }) {
  return <HistoryRows query={useBoyHistory(boyId)} />
}

/** A rider's approval steps as a timeline. */
export function BoyTimeline({ boyId }: { boyId: string }) {
  const history = useBoyHistory(boyId)
  if (history.isPending) return <p>Loading timeline…</p>
  if (history.isError) return <p role="alert">The timeline couldn’t be loaded.</p>
  return <RiderTimeline entries={history.data ?? []} />
}
