"use client"

import {
  BadgeCheck,
  CircleDot,
  FileCheck2,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react"

const STEP: Record<
  string,
  { label: string; tone: "info" | "ok" | "warn" | "bad"; icon: typeof Send }
> = {
  "boy.submitted": { label: "Submitted by partner", tone: "info", icon: Send },
  "boy.corrections_resubmitted": {
    label: "Corrections resubmitted",
    tone: "info",
    icon: RotateCcw,
  },
  "boy.document_verified": { label: "Document verified", tone: "ok", icon: FileCheck2 },
  "boy.document_unverified": {
    label: "Document verification removed",
    tone: "warn",
    icon: CircleDot,
  },
  "boy.forwarded": {
    label: "Verified by Admin, sent to Super Admin",
    tone: "ok",
    icon: ShieldCheck,
  },
  "boy.corrections_requested": {
    label: "Sent back for corrections",
    tone: "warn",
    icon: RotateCcw,
  },
  "boy.rejected": { label: "Rejected", tone: "bad", icon: XCircle },
  "boy.approved": { label: "Final approval: active", tone: "ok", icon: BadgeCheck },
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

/**
 * The rider's approval journey as a timeline, oldest step first. Each step shows who acted,
 * when, and the reason they gave.
 */
export type TimelineEntry = {
  id: string
  action: string
  actorName: string
  actorRole: string
  reason: string | null
  changes: Record<string, { from?: unknown; to?: unknown }> | null
  at: string
}

export function RiderTimeline({ entries }: { entries: TimelineEntry[] }) {
  const steps = [...entries].reverse()
  if (steps.length === 0) return <p className="rider-timeline-empty">No steps recorded yet.</p>
  return (
    <ol className="rider-timeline" aria-label="Approval timeline">
      {steps.map((entry) => {
        const step = STEP[entry.action] ?? {
          label: entry.action,
          tone: "info" as const,
          icon: CircleDot,
        }
        const Icon = step.icon
        return (
          <li key={entry.id} className={`rt-step ${step.tone}`}>
            <span className="rt-dot" aria-hidden="true">
              <Icon size={14} />
            </span>
            <div className="rt-copy">
              <strong>{step.label}</strong>
              <small>
                {entry.actorName} · {entry.actorRole.replaceAll("_", " ")} · {when(entry.at)}
              </small>
              {entry.reason && <p>“{entry.reason}”</p>}
              {entry.changes && Object.keys(entry.changes).length > 0 && (
                <ul className="rt-changes">
                  {Object.entries(entry.changes).map(([field, change]) => (
                    <li key={field}>
                      <code>{field}</code> {String(change.from ?? "—")} → {String(change.to ?? "—")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
