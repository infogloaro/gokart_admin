// Stored notifications: who should hear about something in a business and zone, and
// writing their notification rows (inside the caller's transaction when there is one).
import type { Business } from "@zoauro/shared"
import type { Db } from "./prisma"

export type NewNotification = { title: string; body: string; link?: string | null }

/**
 * Active members who look after this business and zone: admins assigned to both, and
 * (unless `adminsOnly`) every Super Admin.
 */
export async function membersFor(
  db: Db,
  business: Business,
  zoneId: string,
  opts: { adminsOnly?: boolean; superOnly?: boolean } = {},
) {
  const rows = await db.member.findMany({
    where: {
      status: "active",
      OR: [
        ...(opts.superOnly
          ? []
          : [
              {
                role: "admin" as const,
                businesses: { some: { business } },
                zones: { some: { zoneId } },
              },
            ]),
        ...(opts.adminsOnly ? [] : [{ role: "super_admin" as const }]),
      ],
    },
    select: { id: true, role: true },
  })
  return rows
}

/** Writes one notification per member, skipping `except` (usually whoever acted). */
export async function notify(
  db: Db,
  memberIds: string[],
  n: NewNotification,
  except?: string | null,
) {
  const ids = [...new Set(memberIds)].filter((id) => id !== except)
  if (!ids.length) return
  await db.notification.createMany({
    data: ids.map((memberId) => ({ memberId, title: n.title, body: n.body, link: n.link ?? null })),
  })
}

/** Portal link for a member: admins get their business workspace, Super Admins /super. */
export const linkFor = (role: string, business: Business, page: string, query = "") =>
  role === "super_admin"
    ? `/super/${page}?business=${business}${query ? `&${query}` : ""}`
    : `/admin/${business}/${page}${query ? `?${query}` : ""}`
