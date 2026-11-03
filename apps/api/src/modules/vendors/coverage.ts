// Vendor coverage: for each vendor, the zone admins who look after it, the delivery partners
// that serve its zone, and how many of their riders are free right now.
import type { Request, Response } from "express"
import { prisma } from "../../lib/prisma"
import { scope } from "../../middleware/auth"

export async function coverage(req: Request, res: Response) {
  const s = scope(req)
  const vendors = await prisma.vendor.findMany({
    where: { business: { in: s.businesses }, ...(s.zoneIds && { zoneId: { in: s.zoneIds } }) },
    select: {
      id: true,
      name: true,
      business: true,
      zoneId: true,
      zone: { select: { location: true, city: true } },
    },
    take: 500,
  })
  const zoneIds = [...new Set(vendors.map((vendor) => vendor.zoneId))]
  const [admins, fleetZones, freeRiders] = await Promise.all([
    prisma.member.findMany({
      where: { status: "active", role: "admin", zones: { some: { zoneId: { in: zoneIds } } } },
      select: {
        name: true,
        businesses: { select: { business: true } },
        zones: { select: { zoneId: true } },
      },
    }),
    prisma.deliveryFleetZone.findMany({
      where: { zoneId: { in: zoneIds }, endedAt: null, fleet: { status: "active" } },
      select: {
        zoneId: true,
        fleetId: true,
        fleet: { select: { name: true, businesses: { select: { business: true } } } },
      },
    }),
    prisma.deliveryBoy.groupBy({
      by: ["zoneId", "fleetId"],
      where: { zoneId: { in: zoneIds }, status: "active", availability: "available" },
      _count: { _all: true },
    }),
  ])
  const free = new Map<string, number>()
  for (const row of freeRiders) free.set(`${row.zoneId}:${row.fleetId}`, row._count._all)
  res.json({
    items: vendors.map((vendor) => {
      const businessAdmins = admins
        .filter(
          (admin) =>
            admin.zones.some((z) => z.zoneId === vendor.zoneId) &&
            admin.businesses.some((b) => b.business === vendor.business),
        )
        .map((admin) => admin.name)
      const serving = fleetZones.filter(
        (row) =>
          row.zoneId === vendor.zoneId &&
          row.fleet.businesses.some((b) => b.business === vendor.business),
      )
      const partners = serving.map((row) => row.fleet.name)
      return {
        vendorId: vendor.id,
        vendorName: vendor.name,
        business: vendor.business,
        zone: `${vendor.zone.location}, ${vendor.zone.city}`,
        admins: businessAdmins,
        partners,
        freeRiders: serving.reduce(
          (sum, row) => sum + (free.get(`${row.zoneId}:${row.fleetId}`) ?? 0),
          0,
        ),
      }
    }),
  })
}
