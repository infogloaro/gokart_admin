// Stored notifications for the signed-in member, and the outbox relay that turns business
// events (vendor approved, partner suspended, refund requested, …) into notifications.
// The relay runs inside the API process for now; it can move to a BullMQ worker unchanged.
import {
  NotificationActivityKey,
  NotificationActivityReadList,
  NotificationActivityReadQuery,
  NotificationActivityReadRequest,
  NotificationQuery,
  type Business,
  type NotificationList,
} from "@zoauro/shared"
import { Router, type Request, type Response } from "express"
import { forbidden, notFound, parse } from "../../lib/errors"
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

async function remove(req: Request<{ id: string }>, res: Response) {
  const done = await prisma.notification.deleteMany({
    where: { id: req.params.id, memberId: currentMember(req).id },
  })
  if (!done.count) throw notFound("Notification")
  res.status(204).end()
}

/** Deletes every read notification of the signed-in member. Unread ones are kept. */
async function removeRead(req: Request, res: Response) {
  await prisma.notification.deleteMany({
    where: { memberId: currentMember(req).id, readAt: { not: null } },
  })
  res.status(204).end()
}

async function readAll(req: Request, res: Response) {
  await prisma.notification.updateMany({
    where: { memberId: currentMember(req).id, readAt: null },
    data: { readAt: new Date() },
  })
  res.status(204).end()
}

async function readActivityList(req: Request, res: Response) {
  const { keys: rawKeys } = parse(NotificationActivityReadQuery, req.query)
  const keys = rawKeys ? parse(NotificationActivityReadList, { keys: rawKeys.split(",") }).keys : []
  const uniqueKeys = [...new Set(keys)]
  const reads = uniqueKeys.length
    ? await prisma.notificationActivityRead.findMany({
        where: { memberId: currentMember(req).id, activityKey: { in: uniqueKeys } },
        select: { activityKey: true },
      })
    : []
  res.json({ keys: reads.map((item) => item.activityKey) })
}

async function readActivity(req: Request, res: Response) {
  const { key } = parse(NotificationActivityReadRequest, req.body)
  const [kind, id] = parse(NotificationActivityKey, key).split(":")
  const member = currentMember(req)
  const permission =
    kind === "vendor" ? "vendors.view" : kind === "partner" ? "partners.view" : "orders.view"
  if (!member.permissions.includes(permission)) throw forbidden()

  const zoneFilter = member.role === "super_admin" ? undefined : { in: member.zoneIds }
  if (member.role !== "super_admin" && member.zoneIds.length === 0) throw notFound("Activity")
  let accessible = false
  if (kind === "vendor") {
    accessible = Boolean(
      await prisma.vendor.findFirst({
        where: {
          id,
          status: "pending_review",
          business: { in: member.businesses },
          ...(zoneFilter && { zoneId: zoneFilter }),
        },
        select: { id: true },
      }),
    )
  } else if (kind === "partner") {
    accessible = Boolean(
      await prisma.partner.findFirst({
        where: {
          id,
          status: "pending_approval",
          businesses: { some: { business: { in: member.businesses } } },
          ...(zoneFilter && { zoneId: zoneFilter }),
        },
        select: { id: true },
      }),
    )
  } else {
    accessible = Boolean(
      await prisma.order.findFirst({
        where: {
          id,
          status: "placed",
          business: { in: member.businesses },
          ...(zoneFilter && { zoneId: zoneFilter }),
        },
        select: { id: true },
      }),
    )
  }
  if (!accessible) throw notFound("Activity")

  await prisma.notificationActivityRead.upsert({
    where: { memberId_activityKey: { memberId: member.id, activityKey: key } },
    create: { memberId: member.id, activityKey: key },
    update: { readAt: new Date() },
  })
  res.status(204).end()
}

export const notificationRoutes = Router()
  .use(requireAuth)
  .get("/", list)
  .get("/activity-read", readActivityList)
  .post("/activity-read", readActivity)
  .post("/read-all", readAll)
  .post("/:id/read", read)
  .delete("/", removeRead)
  .delete("/:id", remove)

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
