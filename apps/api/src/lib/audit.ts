import type { Prisma } from "../generated/prisma/client"
import type { Db } from "./prisma"

export type Actor = { id: string | null; name: string; ip?: string | undefined }

export const systemActor: Actor = { id: null, name: "System" }

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

/** Call inside the same transaction as the write it describes. */
export function audit(
  db: Db,
  actor: Actor,
  action: string,
  entity: { type: string; id: string },
  detail?: Prisma.InputJsonValue,
) {
  return db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action,
      entityType: entity.type,
      entityId: entity.id,
      detail,
      ip: actor.ip ?? null,
    },
  })
}
