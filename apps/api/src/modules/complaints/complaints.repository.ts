import type { Business, ComplaintPriority, ComplaintStatus } from "@zoauro/shared"
import type { Prisma } from "../../generated/prisma/client"
import { audit, type Actor } from "../../lib/audit"
import { conflict } from "../../lib/errors"
import { linkFor, membersFor, notify } from "../../lib/notify"
import { prisma, type Tx } from "../../lib/prisma"

export type Scope = { businesses: Business[]; zoneIds: string[] | null }
export type ComplaintFilter = Scope & {
  status?: ComplaintStatus | undefined
  priority?: ComplaintPriority | undefined
  assigneeId?: string | null | undefined
  search?: string | undefined
}

const scoped = (s: Scope): Prisma.ComplaintWhereInput => ({
  business: { in: s.businesses },
  ...(s.zoneIds && { zoneId: { in: s.zoneIds } }),
})

function where(f: ComplaintFilter): Prisma.ComplaintWhereInput {
  return {
    ...scoped(f),
    // Without a status filter the queue shows work still to do.
    status: f.status ?? { not: "resolved" },
    ...(f.priority && { priority: f.priority }),
    ...(f.assigneeId !== undefined && { assigneeId: f.assigneeId }),
    ...(f.search && {
      OR: [
        { code: { contains: f.search, mode: "insensitive" } },
        { orderCode: { contains: f.search, mode: "insensitive" } },
        { customerName: { contains: f.search, mode: "insensitive" } },
        { summary: { contains: f.search, mode: "insensitive" } },
        { vendorName: { contains: f.search, mode: "insensitive" } },
      ],
    }),
  }
}

// Escalated, then in review, then open (enum order reversed); urgent first; oldest first.
const order: Prisma.ComplaintOrderByWithRelationInput[] = [
  { status: "desc" },
  { priority: "desc" },
  { createdAt: "asc" },
]

export async function list(f: ComplaintFilter, page: number, pageSize: number) {
  const [items, total] = await prisma.$transaction([
    prisma.complaint.findMany({
      where: where(f),
      orderBy: f.status === "resolved" ? [{ resolvedAt: "desc" }] : order,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.complaint.count({ where: where(f) }),
  ])
  return { items, total }
}

export async function summary(s: Scope) {
  const w = scoped(s)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const open = { ...w, status: { not: "resolved" as const } }
  const [o, review, escalated, resolvedToday, urgent, unassigned] = await Promise.all([
    prisma.complaint.count({ where: { ...w, status: "open" } }),
    prisma.complaint.count({ where: { ...w, status: "in_review" } }),
    prisma.complaint.count({ where: { ...w, status: "escalated" } }),
    prisma.complaint.count({ where: { ...w, status: "resolved", resolvedAt: { gte: today } } }),
    prisma.complaint.count({ where: { ...open, priority: "urgent" } }),
    prisma.complaint.count({ where: { ...open, assigneeId: null } }),
  ])
  return { open: o, inReview: review, escalated, resolvedToday, urgent, unassigned }
}

export const findInScope = (id: string, s: Scope) =>
  prisma.complaint.findFirst({
    where: { id, ...scoped(s) },
    include: { notes: { orderBy: { at: "asc" } } },
  })

/** Members who can work complaints in this business and zone. */
export async function assignees(business: Business, zoneId: string) {
  const rows = await prisma.member.findMany({
    where: {
      status: "active",
      permissions: { some: { permission: "complaints.manage" } },
      OR: [
        { role: "super_admin" },
        { businesses: { some: { business } }, zones: { some: { zoneId } } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
  return rows
}

type Change = {
  data: Prisma.ComplaintUpdateInput
  note: { kind: string; body: string }
  action: string
  /** Who to tell, besides the audit trail. */
  tell?: (
    tx: Tx,
    c: { business: Business; zoneId: string },
  ) => Promise<{ ids: string[]; title: string; body: string; page?: string; superLink?: boolean }[]>
}

/** Applies one change with a version check, a history note, an audit entry and notifications. */
export async function change(id: string, version: number, actor: Actor, c: Change) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.complaint.findUniqueOrThrow({ where: { id } })
    const updated = await tx.complaint.updateMany({
      where: { id, version },
      data: { ...(c.data as Prisma.ComplaintUpdateManyMutationInput), version: { increment: 1 } },
    })
    if (!updated.count)
      throw conflict("Someone else updated this complaint. Reload to see their change.")
    // Relations (assignee name) aren't allowed in updateMany; set them separately.
    await tx.complaintNote.create({
      data: {
        complaintId: id,
        kind: c.note.kind,
        authorId: actor.id,
        authorName: actor.name,
        body: c.note.body,
      },
    })
    await audit(
      tx,
      actor,
      c.action,
      { type: "complaint", id },
      {
        code: current.code,
        from: current.status,
        ...(c.data as object),
      },
    )
    await tx.outboxEvent.create({
      data: { topic: c.action, payload: { complaintId: id, code: current.code } },
    })
    for (const t of (await c.tell?.(tx, current)) ?? []) {
      const members = await tx.member.findMany({
        where: { id: { in: t.ids } },
        select: { id: true, role: true },
      })
      for (const m of members)
        await notify(
          tx,
          [m.id],
          {
            title: t.title,
            body: t.body,
            link: linkFor(m.role, current.business, "complaints", `complaint=${current.code}`),
          },
          actor.id,
        )
    }
    return tx.complaint.findUniqueOrThrow({
      where: { id },
      include: { notes: { orderBy: { at: "asc" } } },
    })
  })
}

export async function addNote(id: string, actor: Actor, body: string) {
  return prisma.$transaction(async (tx) => {
    await tx.complaintNote.create({
      data: { complaintId: id, kind: "note", authorId: actor.id, authorName: actor.name, body },
    })
    await audit(tx, actor, "complaint.noted", { type: "complaint", id })
    return tx.complaint.findUniqueOrThrow({
      where: { id },
      include: { notes: { orderBy: { at: "asc" } } },
    })
  })
}

export { membersFor }
