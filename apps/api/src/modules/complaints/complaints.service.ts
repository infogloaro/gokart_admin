import {
  complaintCategoryLabel,
  type Complaint,
  type ComplaintCategory,
  type ComplaintDetail,
  type ComplaintNote,
} from "@zoauro/shared"
import type { Actor } from "../../lib/audit"
import { badRequest, conflict, notFound } from "../../lib/errors"
import * as repo from "./complaints.repository"
import type { ComplaintFilter, Scope } from "./complaints.repository"

type Row = NonNullable<Awaited<ReturnType<typeof repo.findInScope>>>
type Plain = Omit<Row, "notes">

export function toDto(c: Plain): Complaint {
  return {
    id: c.id,
    code: c.code,
    business: c.business,
    zoneId: c.zoneId,
    orderId: c.orderId,
    orderCode: c.orderCode,
    vendorName: c.vendorName,
    category: c.category as ComplaintCategory,
    priority: c.priority,
    status: c.status,
    customerName: c.customerName,
    summary: c.summary,
    details: c.details,
    evidence: c.evidence,
    claimPaise: c.claimPaise,
    assigneeId: c.assigneeId,
    assigneeName: c.assigneeName,
    escalatedAt: c.escalatedAt?.toISOString() ?? null,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    resolution: c.resolution,
    version: c.version,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

const detail = (c: Row): ComplaintDetail => ({
  ...toDto(c),
  notes: c.notes.map((n) => ({
    id: n.id,
    kind: n.kind as ComplaintNote["kind"],
    authorName: n.authorName,
    body: n.body,
    at: n.at.toISOString(),
  })),
})

export async function list(f: ComplaintFilter, page: number, pageSize: number) {
  const { items, total } = await repo.list(f, page, pageSize)
  return { items: items.map(toDto), total, page }
}

export const summary = (s: Scope) => repo.summary(s)

async function load(id: string, s: Scope) {
  const c = await repo.findInScope(id, s)
  if (!c) throw notFound("Complaint")
  return c
}

export async function get(id: string, s: Scope) {
  return detail(await load(id, s))
}

export async function assignees(id: string, s: Scope) {
  const c = await load(id, s)
  const rows = await repo.assignees(c.business, c.zoneId)
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    initials: m.name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  }))
}

const label = (c: { code: string; category: string }) =>
  `${c.code} · ${complaintCategoryLabel[c.category as ComplaintCategory] ?? c.category}`

export async function assign(
  id: string,
  s: Scope,
  body: { version: number; assigneeId: string | null },
  actor: Actor,
) {
  const c = await load(id, s)
  if (c.status === "resolved") throw conflict("Reopen the complaint before assigning it.")
  let name: string | null = null
  if (body.assigneeId) {
    const allowed = await repo.assignees(c.business, c.zoneId)
    const m = allowed.find((a) => a.id === body.assigneeId)
    if (!m) throw badRequest("That person can't work complaints in this zone.")
    name = m.name
  }
  const updated = await repo.change(id, body.version, actor, {
    action: "complaint.assigned",
    data: {
      assigneeId: body.assigneeId,
      assigneeName: name,
      ...(body.assigneeId && c.status === "open" && { status: "in_review" }),
    },
    note: {
      kind: "assigned",
      body: name ? `Assigned to ${name}` : "Unassigned",
    },
    tell: async () =>
      body.assigneeId
        ? [
            {
              ids: [body.assigneeId],
              title: "Complaint assigned to you",
              body: `${label(c)} — ${c.summary}`,
            },
          ]
        : [],
  })
  return detail(updated)
}

export async function escalate(
  id: string,
  s: Scope,
  body: { version: number; reason: string },
  actor: Actor,
) {
  const c = await load(id, s)
  if (c.status === "escalated") throw conflict("This complaint is already escalated.")
  if (c.status === "resolved") throw conflict("Reopen the complaint before escalating it.")
  const updated = await repo.change(id, body.version, actor, {
    action: "complaint.escalated",
    data: {
      status: "escalated",
      escalatedAt: new Date(),
      priority: c.priority === "urgent" ? "urgent" : "high",
    },
    note: { kind: "escalated", body: body.reason },
    tell: async (tx) => [
      {
        ids: (await repo.membersFor(tx, c.business, c.zoneId, { superOnly: true })).map(
          (m) => m.id,
        ),
        title: "Complaint escalated",
        body: `${label(c)} — ${body.reason}`,
      },
    ],
  })
  return detail(updated)
}

export async function resolve(
  id: string,
  s: Scope,
  body: { version: number; resolution: string },
  actor: Actor,
) {
  const c = await load(id, s)
  if (c.status === "resolved") throw conflict("This complaint is already resolved.")
  const updated = await repo.change(id, body.version, actor, {
    action: "complaint.resolved",
    data: { status: "resolved", resolvedAt: new Date(), resolution: body.resolution },
    note: { kind: "resolved", body: body.resolution },
    tell: async () =>
      c.assigneeId
        ? [
            {
              ids: [c.assigneeId],
              title: "Complaint resolved",
              body: `${label(c)} — ${body.resolution}`,
            },
          ]
        : [],
  })
  return detail(updated)
}

export async function reopen(
  id: string,
  s: Scope,
  body: { version: number; reason: string },
  actor: Actor,
) {
  const c = await load(id, s)
  if (c.status !== "resolved") throw conflict("Only resolved complaints can be reopened.")
  const updated = await repo.change(id, body.version, actor, {
    action: "complaint.reopened",
    data: {
      status: c.assigneeId ? "in_review" : "open",
      resolvedAt: null,
      resolution: null,
    },
    note: { kind: "reopened", body: body.reason },
  })
  return detail(updated)
}

export async function note(id: string, s: Scope, body: string, actor: Actor) {
  await load(id, s)
  return detail(await repo.addNote(id, actor, body))
}
