// Order offers. A ready order is offered to the nearest suitable rider, who has OFFER_SECONDS to
// accept or decline. If they decline or time out, the next suitable rider is offered the order.
// Accepting uses the same checks as a direct assignment, so the rules stay in one place.
import { notFound, conflict } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { assignOrderToBoy, fleetActor, suggestRiders } from "../delivery/delivery.service"
import { SYSTEM_MEMBER } from "../orders/orders.service"

export const OFFER_SECONDS = 120

/** Offers the order to the best rider who has not already refused or missed it. */
export async function offerNextRider(orderId: string, now = Date.now()) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, deliveryBoyId: true, partnerId: true },
  })
  if (!order || order.status !== "ready" || order.deliveryBoyId || order.partnerId) return null
  const open = await prisma.deliveryOffer.findFirst({
    where: { orderId, status: "offered", expiresAt: { gt: new Date(now) } },
  })
  if (open) return open
  const refused = await prisma.deliveryOffer.findMany({
    where: { orderId, status: { in: ["declined", "expired"] } },
    select: { boyId: true },
  })
  const skip = new Set(refused.map((row) => row.boyId))
  const next = (await suggestRiders(orderId, SYSTEM_MEMBER)).find((rider) => !skip.has(rider.id))
  if (!next) return null
  const boy = await prisma.deliveryBoy.findUnique({
    where: { id: next.id },
    select: { fleetId: true },
  })
  if (!boy) return null
  return prisma.deliveryOffer.create({
    data: {
      orderId,
      boyId: next.id,
      fleetId: boy.fleetId,
      expiresAt: new Date(now + OFFER_SECONDS * 1000),
    },
  })
}

/** Marks offers that were not answered in time as expired, and offers the order onward. */
export async function expireOffers(now = Date.now()) {
  const due = await prisma.deliveryOffer.findMany({
    where: { status: "offered", expiresAt: { lt: new Date(now) } },
    select: { id: true, orderId: true },
    take: 200,
  })
  for (const offer of due) {
    const changed = await prisma.deliveryOffer.updateMany({
      where: { id: offer.id, status: "offered" },
      data: { status: "expired", respondedAt: new Date(now) },
    })
    if (changed.count) await offerNextRider(offer.orderId, now)
  }
  return due.length
}

async function ownOffer(fleetId: string, boyId: string, offerId: string) {
  const offer = await prisma.deliveryOffer.findFirst({
    where: { id: offerId, fleetId, boyId },
    select: { id: true, orderId: true, boyId: true, status: true, expiresAt: true },
  })
  if (!offer) throw notFound("Offer")
  return offer
}

/** A rider accepts an offer: the order is assigned to them, and the other offers are withdrawn. */
export async function acceptOffer(fleetId: string, boyId: string, offerId: string) {
  const offer = await ownOffer(fleetId, boyId, offerId)
  if (offer.status !== "offered") throw conflict("This offer is no longer open.")
  if (offer.expiresAt.getTime() < Date.now()) {
    await prisma.deliveryOffer.updateMany({
      where: { id: offer.id, status: "offered" },
      data: { status: "expired", respondedAt: new Date() },
    })
    await offerNextRider(offer.orderId)
    throw conflict("This offer has expired.")
  }
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: offer.orderId },
    select: { version: true },
  })
  await assignOrderToBoy(
    fleetId,
    offer.orderId,
    { boyId, version: order.version },
    await fleetActor(fleetId),
  )
  await prisma.deliveryOffer.update({
    where: { id: offer.id },
    data: { status: "accepted", respondedAt: new Date() },
  })
  await prisma.deliveryOffer.updateMany({
    where: { orderId: offer.orderId, status: "offered", id: { not: offer.id } },
    data: { status: "withdrawn" },
  })
}

/** A rider declines an offer; the order goes to the next suitable rider. */
export async function declineOffer(
  fleetId: string,
  boyId: string,
  offerId: string,
  reason?: string,
) {
  const offer = await ownOffer(fleetId, boyId, offerId)
  if (offer.status !== "offered") throw conflict("This offer is no longer open.")
  const changed = await prisma.deliveryOffer.updateMany({
    where: { id: offer.id, status: "offered" },
    data: { status: "declined", respondedAt: new Date(), declineReason: reason ?? null },
  })
  if (changed.count) await offerNextRider(offer.orderId)
}

/** A rider's open offers, from the rider app. */
export async function openOffers(fleetId: string, boyId: string) {
  const rows = await prisma.deliveryOffer.findMany({
    where: { fleetId, boyId, status: "offered", expiresAt: { gt: new Date() } },
    include: {
      order: {
        select: {
          code: true,
          business: true,
          placedAt: true,
          vendor: { select: { name: true } },
          zone: { select: { location: true, city: true } },
        },
      },
    },
    orderBy: { offeredAt: "asc" },
  })
  return rows.map((row) => ({
    id: row.id,
    orderCode: row.order.code,
    business: row.order.business,
    vendorName: row.order.vendor.name,
    pickupArea: `${row.order.zone.location}, ${row.order.zone.city}`,
    expiresAt: row.expiresAt.toISOString(),
  }))
}
