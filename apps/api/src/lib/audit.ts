import type { Prisma } from "../generated/prisma/client"
import type { Db } from "./prisma"

export type Actor = {
  id: string | null
  name: string
  role?: string | null | undefined
  source?: string | undefined
  userAgent?: string | undefined
  ip?: string | undefined
}

export const systemActor: Actor = { id: null, name: "System", role: null, source: "system" }

/** The audit trail for one record, newest first, as shown in detail drawers. */
export async function activityFor(db: Db, entity: { type: string; id: string }, take = 20) {
  const rows = await db.auditLog.findMany({
    where: { entityType: entity.type, entityId: entity.id },
    orderBy: { at: "desc" },
    take,
  })
  return rows.map((r) => {
    const detail = (r.detail ?? {}) as { reason?: unknown }
    return {
      action: r.action,
      actorName: r.actorName,
      at: r.at.toISOString(),
      reason: typeof detail.reason === "string" ? detail.reason : null,
    }
  })
}

/**
 * Call inside the same transaction as the write it describes. Every change made by someone other
 * than a Super Admin (or by the system) also notifies the Super Admins, so they see each add and edit.
 */
export async function audit(
  db: Db,
  actor: Actor,
  action: string,
  entity: { type: string; id: string },
  detail?: Prisma.InputJsonValue,
) {
  const row = await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? null,
      action,
      entityType: entity.type,
      entityId: entity.id,
      source: actor.source ?? null,
      userAgent: actor.userAgent ?? null,
      detail,
      ip: actor.ip ?? null,
    },
  })
  // Sign-ins and sign-outs are not edits, so they do not notify.
  const isEdit = !action.startsWith("auth.") && actor.source !== "system"
  if (isEdit && actor.role !== "super_admin")
    await notifySuperAdmins(db, actor, action, entity, detail)
  return row
}

const ACTION_WORDS: Record<string, string> = {
  created: "created",
  submitted: "submitted",
  requested: "requested",
  updated: "edited",
  approved: "approved",
  rejected: "rejected",
  forwarded: "forwarded",
  corrections_requested: "sent back for corrections",
  corrections_resubmitted: "resubmitted corrections for",
  document_verified: "verified a document for",
  document_unverified: "removed a document verification for",
  credential_rotated: "rotated the key for",
  zone_assigned: "assigned a zone to",
  zone_reassigned: "reassigned a zone for",
}

/** A short readable line such as "Ravi Chandran edited delivery partner FLEET-1A2B". */
function changeText(
  actor: Actor,
  action: string,
  entity: { type: string; id: string },
  fields: Record<string, unknown>,
) {
  const verb = action.split(".").pop() ?? action
  const words = ACTION_WORDS[verb] ?? verb.replaceAll("_", " ")
  const code = typeof fields.code === "string" ? fields.code : entity.id
  return `${actor.name} ${words} ${entity.type.replaceAll("_", " ")} ${code}`
}

async function notifySuperAdmins(
  db: Db,
  actor: Actor,
  action: string,
  entity: { type: string; id: string },
  detail?: Prisma.InputJsonValue,
) {
  const supers = await db.member.findMany({
    where: { status: "active", role: "super_admin" },
    select: { id: true },
  })
  const fields: Record<string, unknown> =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? (detail as Record<string, unknown>)
      : {}
  const reason = typeof fields.reason === "string" ? ` Reason: ${fields.reason}` : ""
  await db.notification.createMany({
    data: supers
      .filter((member) => member.id !== actor.id)
      .map((member) => ({
        memberId: member.id,
        title: `Change: ${action}`,
        body: `${changeText(actor, action, entity, fields)}.${reason}`,
        link: "/super/notifications",
      })),
  })
}
