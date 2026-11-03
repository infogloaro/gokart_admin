// Weekly digest for Super Admins: alerts, approvals and order volume for the last seven days,
// emailed once a week on Monday morning (IST).
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"
import { sendMail } from "../../lib/mailer"

const DAY = 24 * 60 * 60 * 1000
const IST = 330 * 60_000

export type DigestFigures = {
  alertsRaised: number
  alertsResolved: number
  alertsByKind: Record<string, number>
  ridersApproved: number
  partnersApproved: number
  orders: number
  delivered: number
}

/** The digest text. Pure, so the wording and numbers can be checked without sending mail. */
export function digestText(figures: DigestFigures, from: string, to: string) {
  const kinds = Object.entries(figures.alertsByKind)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `  - ${kind.replaceAll("_", " ")}: ${count}`)
  return [
    `GoKart weekly digest, ${from} to ${to}`,
    "",
    `Orders: ${figures.orders} placed, ${figures.delivered} delivered.`,
    `Alerts: ${figures.alertsRaised} raised, ${figures.alertsResolved} resolved.`,
    ...(kinds.length ? kinds : ["  - none"]),
    `Approvals: ${figures.partnersApproved} delivery partners, ${figures.ridersApproved} delivery boys.`,
    "",
    "Open the Alerts page for anything still open.",
  ].join("\n")
}

/** The Monday of the IST week containing `now`, as a key for "sent this week". */
export function weekKey(now = Date.now()) {
  const ist = new Date(now + IST)
  const day = (ist.getUTCDay() + 6) % 7
  return new Date(now + IST - day * DAY).toISOString().slice(0, 10)
}

export async function buildDigest(now = Date.now()): Promise<DigestFigures> {
  const since = new Date(now - 7 * DAY)
  const [raised, resolved, byKind, riders, partners, orders, delivered] = await Promise.all([
    prisma.operationalAlert.count({ where: { createdAt: { gte: since } } }),
    prisma.operationalAlert.count({ where: { resolvedAt: { gte: since } } }),
    prisma.operationalAlert.groupBy({
      by: ["kind"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.auditLog.count({ where: { action: "delivery_boy.approved", at: { gte: since } } }),
    prisma.auditLog.count({ where: { action: "delivery_fleet.approved", at: { gte: since } } }),
    prisma.order.count({ where: { placedAt: { gte: since } } }),
    prisma.order.count({ where: { placedAt: { gte: since }, status: "delivered" } }),
  ])
  return {
    alertsRaised: raised,
    alertsResolved: resolved,
    alertsByKind: Object.fromEntries(byKind.map((row) => [row.kind, row._count._all])),
    ridersApproved: riders,
    partnersApproved: partners,
    orders,
    delivered,
  }
}

/** Sends the digest to every active Super Admin, once per week. Safe to call often. */
export async function sendWeeklyDigest(now = Date.now()) {
  const ist = new Date(now + IST)
  const isMondayMorning = ist.getUTCDay() === 1 && ist.getUTCHours() >= 9
  if (!isMondayMorning) return false
  const key = `digest:sent:${weekKey(now)}`
  if ((await redis.set(key, "1", "EX", 8 * DAY, "NX")) !== "OK") return false
  const supers = await prisma.member.findMany({
    where: { status: "active", role: "super_admin" },
    select: { email: true },
  })
  const figures = await buildDigest(now)
  const from = new Date(now - 7 * DAY).toISOString().slice(0, 10)
  const to = new Date(now).toISOString().slice(0, 10)
  const text = digestText(figures, from, to)
  for (const member of supers) await sendMail(member.email, `GoKart weekly digest, ${to}`, text)
  return true
}
