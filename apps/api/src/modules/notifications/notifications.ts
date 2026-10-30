// Stored notifications for the signed-in member, and the outbox relay that turns business
// events (vendor approved, partner suspended, refund requested, …) into notifications.
// The relay runs inside the API process for now; it can move to a BullMQ worker unchanged.
import { NotificationQuery, type Business, type NotificationList } from "@zoauro/shared"
import { Router, type Request, type Response } from "express"
import { notFound, parse } from "../../lib/errors"
import { linkFor, membersFor, notify } from "../../lib/notify"
import { prisma } from "../../lib/prisma"
import { currentMember, requireAuth } from "../../middleware/auth"

// ---------- repository ----------

async function listFor(memberId: string, unreadOnly: boolean, limit: number) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { memberId, ...(unreadOnly && { readAt: null }) },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({ where: { memberId, readAt: null } }),
  ])
  return { items, unread }
}

// ---------- routes ----------

async function list(req: Request, res: Response) {
  const q = parse(NotificationQuery, req.query)
  const { items, unread } = await listFor(currentMember(req).id, q.unread === "true", q.limit)
  const body: NotificationList = {
    unread,
    items: items.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  }
  res.json(body)
}

async function read(req: Request<{ id: string }>, res: Response) {
  const done = await prisma.notification.updateMany({
    where: { id: req.params.id, memberId: currentMember(req).id, readAt: null },
    data: { readAt: new Date() },
  })
  if (!done.count) {
    const exists = await prisma.notification.count({
      where: { id: req.params.id, memberId: currentMember(req).id },
    })
    if (!exists) throw notFound("Notification")
  }
  res.status(204).end()
}

async function readAll(req: Request, res: Response) {
  await prisma.notification.updateMany({
    where: { memberId: currentMember(req).id, readAt: null },
    data: { readAt: new Date() },
  })
  res.status(204).end()
}

export const notificationRoutes = Router()
  .use(requireAuth)
  .get("/", list)
  .post("/read-all", readAll)
  .post("/:id/read", read)

// ---------- outbox relay ----------

type Payload = Record<string, string | undefined>
const words = (s: string | undefined) => (s ?? "").replace(/_/g, " ")

async function tell(
  business: Business,
  zoneId: string,
  page: string,
  query: string,
  n: { title: string; body: string },
  who: { adminsOnly?: boolean; superOnly?: boolean } = {},
) {
  const members = await membersFor(prisma, business, zoneId, who)
  for (const m of members)
    await notify(prisma, [m.id], { ...n, link: linkFor(m.role, business, page, query) })
}

/** One event → notifications. Unknown topics are just marked as published. */
async function dispatch(topic: string, p: Payload) {
  if (topic === "vendor.status_changed" && p.vendorId) {
    const v = await prisma.vendor.findUnique({ where: { id: p.vendorId } })
    if (!v) return
    await tell(v.business, v.zoneId, "vendors", `search=${v.code}`, {
      title: p.to === "active" ? `${v.name} is live` : `${v.name} is now ${words(p.to)}`,
      body: `${v.code} moved from ${words(p.from)} to ${words(p.to)}.`,
    })
  } else if (topic === "partner.status_changed" && p.partnerId) {
    const partner = await prisma.partner.findUnique({
      where: { id: p.partnerId },
      include: { businesses: true },
    })
    if (!partner) return
    for (const { business } of partner.businesses)
      await tell(business, partner.zoneId, "partners", `search=${partner.code}`, {
        title:
          p.to === "active" ? `${partner.name} approved` : `${partner.name} is now ${words(p.to)}`,
        body: `Delivery partner ${partner.code} moved from ${words(p.from)} to ${words(p.to)}.`,
      })
  } else if (
    topic === "order.status_changed" &&
    p.orderId &&
    (p.to === "refund_requested" || p.to === "cancelled")
  ) {
    const o = await prisma.order.findUnique({ where: { id: p.orderId }, include: { vendor: true } })
    if (!o) return
    await tell(
      o.business,
      o.zoneId,
      "orders",
      `search=${o.code}`,
      {
        title:
          p.to === "refund_requested" ? `Refund requested on ${o.code}` : `${o.code} cancelled`,
        body: `${o.customerName} · ${o.vendor.name}`,
      },
      { adminsOnly: true },
    )
  }
}

let running = false
/** Publishes pending outbox events; safe to call on a timer (one batch at a time). */
export async function relayOutbox(batch = 50) {
  if (running) return
  running = true
  try {
    const events = await prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: "asc" },
      take: batch,
    })
    for (const e of events) {
      try {
        await dispatch(e.topic, (e.payload ?? {}) as Payload)
      } catch (err) {
        console.error(`Outbox ${e.topic} ${e.id} failed`, err)
      }
      await prisma.outboxEvent.update({ where: { id: e.id }, data: { publishedAt: new Date() } })
    }
  } finally {
    running = false
  }
}
