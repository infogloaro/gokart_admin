// One-time merge: every individual partner becomes a rider in a delivery company.
//
// - If the partner's zone already has an active delivery company, the rider joins it. A zone
//   can have only one active company, so that is the only option there.
// - Otherwise a new company is created for the partner, covering the partner's zone.
// - The rider keeps the partner's code, vehicle, documents, status, availability and latest
//   position. Orders the partner carries are linked to the rider and company.
// - Partner records stay as they are (money and history are keyed to them). PartnerRiderMap links
//   each partner to its rider, and the partner app's updates keep the rider in step.
//
// Idempotent: partners that already have a map row are skipped. Run it after a database backup.
// Usage: pnpm --filter @zoauro/api exec tsx --env-file=.env scripts/merge-partners-into-fleets.ts
import { prisma } from "../src/lib/prisma"

const RIDERS_PER_COMPANY_MAX = 20

/** Partner documents that have a rider equivalent. Others stay with the partner record. */
const DOCUMENT_KINDS: Record<string, string> = {
  aadhaar: "photo_id",
  driving_licence: "driving_licence",
  vehicle_rc: "vehicle_registration",
}

const RIDER_STATUS = {
  pending_approval: "pending_admin",
  active: "active",
  suspended: "suspended",
} as const

const FLEET_STATUS = {
  pending_approval: "pending_approval",
  active: "active",
  suspended: "suspended",
} as const

const superAdmin = await prisma.member.findFirst({
  where: { role: "super_admin", status: "active" },
  select: { id: true },
})
if (!superAdmin) throw new Error("An active Super Admin is needed to record the zone assignments.")

const partners = await prisma.partner.findMany({
  where: { status: { not: "rejected" }, riderMap: null },
  include: {
    zone: { select: { districtId: true, location: true, city: true } },
    businesses: { select: { business: true } },
    documents: true,
  },
  orderBy: { code: "asc" },
})

const summary = {
  partners: partners.length,
  companiesCreated: 0,
  ridersJoined: 0,
  skipped: [] as string[],
  linkedOrders: 0,
}

for (const partner of partners) {
  try {
    // Latest GPS fix, from the trail (the live copy lives in Redis).
    const fix = await prisma.partnerLocation.findFirst({
      where: { partnerId: partner.id },
      orderBy: { at: "desc" },
    })

    await prisma.$transaction(async (tx) => {
      const existing = await tx.deliveryFleetZone.findFirst({
        where: { zoneId: partner.zoneId, endedAt: null },
        select: { fleetId: true, fleet: { select: { _count: { select: { boys: true } } } } },
      })

      let fleetId: string
      if (existing) {
        if (existing.fleet._count.boys >= RIDERS_PER_COMPANY_MAX)
          throw new Error(
            `the zone's delivery company already has ${RIDERS_PER_COMPANY_MAX} riders`,
          )
        fleetId = existing.fleetId
        summary.ridersJoined += 1
      } else {
        const fleet = await tx.deliveryFleet.create({
          data: {
            code: `FLT-${partner.code}`,
            name: `${partner.name} Delivery Co.`,
            contactPerson: partner.name,
            // Placeholder until the company's own number is entered; phone numbers are unique.
            phone: `co-${partner.code}`,
            email: partner.email,
            address: partner.address ?? `${partner.zone.location}, ${partner.zone.city}`,
            districtId: partner.zone.districtId,
            status: FLEET_STATUS[partner.status as keyof typeof FLEET_STATUS] ?? "pending_approval",
          },
        })
        await tx.deliveryFleetZone.create({
          data: { fleetId: fleet.id, zoneId: partner.zoneId, assignedById: superAdmin.id },
        })
        fleetId = fleet.id
        summary.companiesCreated += 1
      }

      await tx.deliveryFleetBusiness.createMany({
        data: partner.businesses.map((row) => ({ fleetId, business: row.business })),
        skipDuplicates: true,
      })

      const rider = await tx.deliveryBoy.create({
        data: {
          code: partner.code,
          fleetId,
          zoneId: partner.zoneId,
          name: partner.name,
          phone: partner.phone,
          email: partner.email,
          address: partner.address ?? `${partner.zone.location}, ${partner.zone.city}`,
          dateOfBirth: partner.dateOfBirth,
          gender: partner.gender,
          pinCode: partner.pinCode,
          drivingLicence: partner.drivingLicence,
          licenceValidUntil: partner.licenceValidUntil,
          vehicleType: partner.vehicleType,
          vehicleNumber: partner.vehicleNumber,
          vehicleModel: partner.vehicleModel,
          status: RIDER_STATUS[partner.status as keyof typeof RIDER_STATUS] ?? "pending_admin",
          availability: partner.availability,
          maxActiveOrders: 1,
          reviewAdminId: partner.managedByAdminId,
          lastLat: fix?.lat ?? null,
          lastLng: fix?.lng ?? null,
          lastLocationAt: fix?.at ?? null,
        },
      })

      for (const document of partner.documents) {
        const kind = DOCUMENT_KINDS[document.kind]
        if (!kind) continue
        await tx.deliveryBoyDocument.create({
          data: {
            boyId: rider.id,
            kind,
            s3Key: document.s3Key,
            fileName: document.fileName,
            contentType: document.contentType,
            sizeBytes: document.sizeBytes,
            uploadedAt: document.uploadedAt,
            verifiedAt: document.verifiedAt,
          },
        })
      }

      await tx.partnerRiderMap.create({
        data: { partnerId: partner.id, fleetId, boyId: rider.id },
      })

      const linked = await tx.order.updateMany({
        where: { partnerId: partner.id, deliveryBoyId: null },
        data: { deliveryBoyId: rider.id, deliveryFleetId: fleetId },
      })
      summary.linkedOrders += linked.count
    })
  } catch (error) {
    summary.skipped.push(
      `${partner.code} ${partner.name}: ${error instanceof Error ? error.message : "failed"}`,
    )
  }
}

console.log(JSON.stringify(summary, null, 2))
await prisma.$disconnect()
