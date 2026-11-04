// Rider operations for the Admin and Super Admin portals: notices to riders, support tickets from
// riders, and cash-on-delivery handover. Everything is limited to the member's zones (Super Admins
// see all). Each change is audited, and riders are told when something for them changes.
import {
  CodQuery,
  RiderSupportReply,
  RiderTicketQuery,
  RiderTicketCreate,
  SendRiderNoticeRequest,
} from "@zoauro/shared"
import type { Request, Response } from "express"
import { audit } from "../../lib/audit"
import { badRequest, conflict, notFound, parse } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { actorOf, currentMember, type MemberContext } from "../../middleware/auth"
import type { Prisma } from "../../generated/prisma/client"
import { z } from "zod"
import { issueDeliveryCode } from "./delivery-code"
import { readProof } from "./proof"
import { decideArea, listAreaRequests } from "./areas"

/** Riders the member may see: their zones, or every zone for a Super Admin. */
const zonesOf = (member: MemberContext): Prisma.DeliveryBoyWhereInput =>
  member.role === "super_admin" ? {} : { zoneId: { in: member.zoneIds } }

const ticketInclude = {
  boy: {
    select: {
      name: true,
      code: true,
      zone: { select: { location: true, city: true } },
    },
  },
  messages: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.RiderSupportTicketInclude

type TicketRow = Prisma.RiderSupportTicketGetPayload<{ include: typeof ticketInclude }>

function toTicket(row: TicketRow) {
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    boyId: row.boyId,
    riderName: row.boy.name,
    riderCode: row.boy.code,
    zoneName: `${row.boy.zone.location}, ${row.boy.zone.city}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messages: row.messages.map((m) => ({
      id: m.id,
      fromRole: m.fromRole === "rider" ? ("rider" as const) : ("team" as const),
      authorName: m.authorName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

/** A notice to one or more riders, for the zone or the riders chosen. Riders see it in their app. */
export async function sendNotice(req: Request, res: Response) {
  const input = parse(SendRiderNoticeRequest, req.body)
  const member = currentMember(req)
  const boys = await prisma.deliveryBoy.findMany({
    where: {
      AND: [
        { status: "active" },
        zonesOf(member),
        ...(input.boyIds ? [{ id: { in: input.boyIds } }] : []),
        ...(input.zoneId ? [{ zoneId: input.zoneId }] : []),
      ],
    },
    select: { id: true },
    take: 500,
  })
  if (boys.length === 0) throw badRequest("No active riders match this notice.")
  const actor = actorOf(req)
  await prisma.$transaction(async (tx) => {
    await tx.deliveryBoyNotification.createMany({
      data: boys.map((boy) => ({ boyId: boy.id, title: input.title, body: input.body })),
    })
    await audit(
      tx,
      actor,
      "rider.notice_sent",
      { type: "delivery_boy", id: boys.length === 1 ? boys[0]!.id : "bulk" },
      { count: boys.length, title: input.title, zoneId: input.zoneId ?? null },
    )
  })
  res.status(201).json({ sent: boys.length })
}

/** Support tickets from riders in scope, open ones first. */
export async function listTickets(req: Request, res: Response) {
  const q = parse(RiderTicketQuery, req.query)
  const member = currentMember(req)
  const where: Prisma.RiderSupportTicketWhereInput = {
    ...(q.status && { status: q.status }),
    boy: {
      ...zonesOf(member),
      ...(q.business && { fleet: { businesses: { some: { business: q.business } } } }),
    },
  }
  const [rows, total] = await prisma.$transaction([
    prisma.riderSupportTicket.findMany({
      where,
      include: ticketInclude,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.riderSupportTicket.count({ where }),
  ])
  res.json({ items: rows.map(toTicket), total, page: q.page, pageSize: q.pageSize })
}

async function loadTicket(id: string, member: MemberContext) {
  const ticket = await prisma.riderSupportTicket.findFirst({
    where: { id, boy: zonesOf(member) },
    select: { id: true, boyId: true, status: true },
  })
  if (!ticket) throw notFound("Support ticket")
  return ticket
}

/** The team's reply. The rider is told in the app. */
export async function replyToTicket(req: Request<{ id: string }>, res: Response) {
  const input = parse(RiderSupportReply, req.body)
  const member = currentMember(req)
  const ticket = await loadTicket(req.params.id, member)
  const actor = actorOf(req)
  await prisma.$transaction(async (tx) => {
    await tx.riderSupportMessage.create({
      data: { ticketId: ticket.id, fromRole: "team", authorName: actor.name, body: input.body },
    })
    await tx.riderSupportTicket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date() },
    })
    await tx.deliveryBoyNotification.create({
      data: {
        boyId: ticket.boyId,
        title: "Support replied",
        body: "The team has replied to your support request.",
      },
    })
    await audit(tx, actor, "rider.support_replied", { type: "rider_ticket", id: ticket.id }, {})
  })
  res.status(201).json({ ok: true })
}

/** Closes a ticket once the rider's problem is solved. */
export async function resolveTicket(req: Request<{ id: string }>, res: Response) {
  const member = currentMember(req)
  const ticket = await loadTicket(req.params.id, member)
  if (ticket.status === "resolved") throw conflict("This ticket is already resolved.")
  const actor = actorOf(req)
  await prisma.$transaction(async (tx) => {
    await tx.riderSupportTicket.update({
      where: { id: ticket.id },
      data: { status: "resolved", resolvedAt: new Date() },
    })
    await audit(tx, actor, "rider.support_resolved", { type: "rider_ticket", id: ticket.id }, {})
  })
  res.json({ ok: true })
}

/** A rider's new ticket, from the rider app (fleet credential). */
export async function createRiderTicket(
  fleetId: string,
  boyId: string,
  body: unknown,
): Promise<ReturnType<typeof toTicket>> {
  const input = parse(RiderTicketCreate, body)
  const boy = await prisma.deliveryBoy.findFirst({
    where: { id: boyId, fleetId },
    select: { id: true, name: true },
  })
  if (!boy) throw notFound("Delivery boy")
  const created = await prisma.riderSupportTicket.create({
    data: {
      boyId: boy.id,
      subject: input.subject,
      messages: { create: { fromRole: "rider", authorName: boy.name, body: input.body } },
    },
    include: ticketInclude,
  })
  return toTicket(created)
}

/** A rider's own tickets, from the rider app (fleet credential). */
export async function riderTickets(fleetId: string, boyId: string) {
  const boy = await prisma.deliveryBoy.findFirst({
    where: { id: boyId, fleetId },
    select: { id: true },
  })
  if (!boy) throw notFound("Delivery boy")
  const rows = await prisma.riderSupportTicket.findMany({
    where: { boyId: boy.id },
    include: ticketInclude,
    orderBy: { updatedAt: "desc" },
    take: 50,
  })
  return rows.map(toTicket)
}

/** Cash-on-delivery collections in scope, with what is still with the riders. */
export async function listCod(req: Request, res: Response) {
  const q = parse(CodQuery, req.query)
  const member = currentMember(req)
  const where: Prisma.CodCollectionWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.zoneId && { zoneId: q.zoneId }),
    boy: zonesOf(member),
  }
  const [rows, total, outstanding] = await prisma.$transaction([
    prisma.codCollection.findMany({
      where,
      include: {
        boy: {
          select: { name: true, code: true, zone: { select: { location: true, city: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { collectedAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.codCollection.count({ where }),
    prisma.codCollection.aggregate({
      where: { ...where, status: "collected" },
      _sum: { amountPaise: true },
    }),
  ])
  const orders = await prisma.order.findMany({
    where: { id: { in: rows.map((row) => row.orderId) } },
    select: { id: true, code: true },
  })
  const codeOf = new Map(orders.map((order) => [order.id, order.code]))
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      orderCode: codeOf.get(row.orderId) ?? "",
      riderName: row.boy.name,
      riderCode: row.boy.code,
      zoneName: `${row.boy.zone.location}, ${row.boy.zone.city}`,
      amountPaise: row.amountPaise,
      status: row.status,
      collectedAt: row.collectedAt.toISOString(),
      handedOverAt: row.handedOverAt?.toISOString() ?? null,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    outstandingPaise: outstanding._sum.amountPaise ?? 0,
  })
}

/** Confirms that the rider handed the collected cash to the company. */
export async function confirmHandover(req: Request<{ id: string }>, res: Response) {
  const member = currentMember(req)
  const row = await prisma.codCollection.findFirst({
    where: { id: req.params.id, boy: zonesOf(member) },
    select: { id: true, status: true, amountPaise: true, orderId: true },
  })
  if (!row) throw notFound("Cash collection")
  if (row.status === "handed_over") throw conflict("This cash has already been handed over.")
  const actor = actorOf(req)
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.codCollection.updateMany({
      where: { id: row.id, status: "collected" },
      data: { status: "handed_over", handedOverAt: new Date(), confirmedById: member.id },
    })
    if (count === 0) throw conflict("This cash was handed over just now. Reload to see the latest.")
    await audit(
      tx,
      actor,
      "rider.cod_handed_over",
      { type: "cod_collection", id: row.id },
      { amountPaise: row.amountPaise, orderId: row.orderId },
    )
  })
  res.json({ ok: true })
}

/** Open offers in the member's zones: who was offered which order, and until when. */
export async function listOffers(req: Request, res: Response) {
  const member = currentMember(req)
  const rows = await prisma.deliveryOffer.findMany({
    where: {
      status: "offered",
      expiresAt: { gt: new Date() },
      order: member.role === "super_admin" ? {} : { zoneId: { in: member.zoneIds } },
    },
    include: {
      boy: { select: { name: true, code: true } },
      order: {
        select: { code: true, business: true, zone: { select: { location: true, city: true } } },
      },
    },
    orderBy: { offeredAt: "asc" },
    take: 100,
  })
  res.json(
    rows.map((row) => ({
      id: row.id,
      orderCode: row.order.code,
      business: row.order.business,
      riderName: row.boy.name,
      riderCode: row.boy.code,
      zoneName: `${row.order.zone.location}, ${row.order.zone.city}`,
      offeredAt: row.offeredAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    })),
  )
}

/** Delivered orders with a proof photo, newest first. */
export async function listProofs(req: Request, res: Response) {
  const member = currentMember(req)
  const rows = await prisma.order.findMany({
    where: {
      proofAt: { not: null },
      ...(member.role !== "super_admin" && {
        zoneId: { in: member.zoneIds },
        business: { in: member.businesses },
      }),
    },
    select: {
      id: true,
      code: true,
      business: true,
      proofAt: true,
      otpVerifiedAt: true,
      deliveryBoy: { select: { name: true, code: true } },
      zone: { select: { location: true, city: true } },
    },
    orderBy: { proofAt: "desc" },
    take: 50,
  })
  res.json(
    rows.map((row) => ({
      id: row.id,
      orderCode: row.code,
      business: row.business,
      riderName: row.deliveryBoy?.name ?? "",
      riderCode: row.deliveryBoy?.code ?? "",
      zoneName: `${row.zone.location}, ${row.zone.city}`,
      proofAt: row.proofAt?.toISOString() ?? null,
      codVerified: Boolean(row.otpVerifiedAt),
    })),
  )
}

/** The proof photo itself, for someone who can see the order. */
export async function readProofImage(req: Request, res: Response) {
  const { buffer, contentType } = await readProof(String(req.params.id), currentMember(req))
  res.setHeader("Content-Type", contentType)
  res.setHeader("Cache-Control", "private, max-age=300")
  res.send(buffer)
}

/** Texts the customer a new delivery code, for an order the member can see. */
export async function resendCode(req: Request, res: Response) {
  const member = currentMember(req)
  const orderId = String(req.params.id)
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      deliveryBoyId: { not: null },
      ...(member.role !== "super_admin" && { zoneId: { in: member.zoneIds } }),
    },
    select: { id: true },
  })
  if (!order) throw notFound("Assigned order")
  await issueDeliveryCode(orderId)
  await prisma.$transaction(async (tx) => {
    await audit(tx, actorOf(req), "rider.code_resent", { type: "order", id: orderId }, {})
  })
  res.json({ ok: true })
}

const areaStatusQuery = z.object({
  status: z.enum(["requested", "approved", "rejected"]).default("requested"),
})

export async function areaRequests(req: Request, res: Response) {
  const q = parse(areaStatusQuery, req.query)
  res.json(await listAreaRequests(currentMember(req), q.status))
}

export async function approveArea(req: Request, res: Response) {
  await decideArea(String(req.params.id), currentMember(req), true, actorOf(req))
  res.json({ ok: true })
}

export async function rejectArea(req: Request, res: Response) {
  await decideArea(String(req.params.id), currentMember(req), false, actorOf(req))
  res.json({ ok: true })
}
