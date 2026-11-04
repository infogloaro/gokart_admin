// Service areas: a rider can ask to take orders from a zone besides their own, inside their
// partner's district. The zone Admin decides, and an approved area is used when orders are offered.
import type { MemberContext } from "../../middleware/auth"
import { audit, type Actor } from "../../lib/audit"
import { badRequest, notFound } from "../../lib/errors"
import { prisma } from "../../lib/prisma"

export async function requestArea(fleetId: string, boyId: string, zoneId: string) {
  const boy = await prisma.deliveryBoy.findFirst({
    where: { id: boyId, fleetId },
    select: { id: true, zoneId: true, fleet: { select: { districtId: true } } },
  })
  if (!boy) throw notFound("Delivery boy")
  if (zoneId === boy.zoneId) throw badRequest("That is already your own zone.")
  const zone = await prisma.zone.findFirst({
    where: { id: zoneId, active: true, districtId: boy.fleet.districtId },
    select: { id: true },
  })
  if (!zone) throw badRequest("Choose an active zone in your partner's district.")
  await prisma.deliveryBoyArea.upsert({
    where: { boyId_zoneId: { boyId, zoneId } },
    create: { boyId, zoneId },
    update: { status: "requested", requestedAt: new Date(), decidedAt: null, decidedById: null },
  })
}

/** A rider's areas and their status, from the rider app. */
export async function riderAreas(fleetId: string, boyId: string) {
  const boy = await prisma.deliveryBoy.findFirst({
    where: { id: boyId, fleetId },
    select: { id: true },
  })
  if (!boy) throw notFound("Delivery boy")
  const rows = await prisma.deliveryBoyArea.findMany({
    where: { boyId },
    include: { zone: { select: { location: true, city: true } } },
    orderBy: { requestedAt: "desc" },
  })
  return rows.map((row) => ({
    id: row.id,
    zoneId: row.zoneId,
    zoneName: `${row.zone.location}, ${row.zone.city}`,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
  }))
}

/** Area requests for zones in the member's scope. */
export async function listAreaRequests(
  member: MemberContext,
  status: "requested" | "approved" | "rejected",
) {
  const rows = await prisma.deliveryBoyArea.findMany({
    where: {
      status,
      ...(member.role !== "super_admin" && { zoneId: { in: member.zoneIds } }),
    },
    include: {
      boy: { select: { name: true, code: true, zone: { select: { location: true, city: true } } } },
      zone: { select: { location: true, city: true } },
    },
    orderBy: { requestedAt: "asc" },
    take: 100,
  })
  return rows.map((row) => ({
    id: row.id,
    riderName: row.boy.name,
    riderCode: row.boy.code,
    homeZone: `${row.boy.zone.location}, ${row.boy.zone.city}`,
    requestedZone: `${row.zone.location}, ${row.zone.city}`,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
  }))
}

/** The zone Admin approves or rejects a request. */
export async function decideArea(
  id: string,
  member: MemberContext,
  approve: boolean,
  actor: Actor,
) {
  const area = await prisma.deliveryBoyArea.findFirst({
    where: {
      id,
      status: "requested",
      ...(member.role !== "super_admin" && { zoneId: { in: member.zoneIds } }),
    },
    select: { id: true, boyId: true, zoneId: true },
  })
  if (!area) throw notFound("Area request")
  await prisma.$transaction(async (tx) => {
    await tx.deliveryBoyArea.update({
      where: { id: area.id },
      data: {
        status: approve ? "approved" : "rejected",
        decidedAt: new Date(),
        decidedById: member.id,
      },
    })
    await audit(
      tx,
      actor,
      approve ? "rider.area_approved" : "rider.area_rejected",
      { type: "delivery_boy", id: area.boyId },
      { zoneId: area.zoneId },
    )
  })
}
