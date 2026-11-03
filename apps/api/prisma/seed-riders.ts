// Sample delivery partners and riders for every district that has a vendor. Each partner is a
// company covering that district's zones, with ten riders (the 10 to 20 rule), verified
// documents, a live position at its zone centre, and a dev partner key for the partner portal.
// Dev data only: the key below is printed by the seed so the partner portal can be tried.
import { hashForLookup } from "../src/lib/crypto"
import type { Prisma, PrismaClient } from "../src/generated/prisma/client"

export const DEV_PARTNER_KEY = "gdf_dev_partner_key_chennai_central"

const RIDERS_PER_PARTNER = 10
const DAY = 24 * 60 * 60 * 1000
const DOCUMENT_KINDS = ["photo_id", "driving_licence", "vehicle_registration"] as const
const VEHICLES = ["scooter", "motorcycle", "e_bike", "bicycle"] as const

/** Ten-digit mobile numbers, unique per sample rider. */
const phone = (n: number) => `9${String(100_000_000 + n).slice(-9)}`
const plate = (n: number) =>
  `TN${String(10 + (n % 80)).padStart(2, "0")}AB${String(1000 + n).slice(-4)}`

/**
 * Creates the sample partners and riders. `zoneIds` are the zones the vendors use, and
 * `superAdminId` is recorded as the person who made the partner assignments.
 */
export async function seedRiders(db: PrismaClient, zoneIds: string[], superAdminId: string) {
  const zones = await db.zone.findMany({
    where: { id: { in: zoneIds }, active: true },
    select: { id: true, districtId: true, location: true, city: true, lat: true, lng: true },
    orderBy: [{ districtId: "asc" }, { location: "asc" }],
  })
  const byDistrict = new Map<string, typeof zones>()
  for (const zone of zones)
    byDistrict.set(zone.districtId, [...(byDistrict.get(zone.districtId) ?? []), zone])

  const businesses: ("food" | "mart")[] = ["food", "mart"]
  let riderNo = 0
  let partnerNo = 0
  const now = new Date()
  const licenceValid = new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000)

  for (const [districtId, districtZones] of byDistrict) {
    partnerNo += 1
    const district = await db.district.findUniqueOrThrow({
      where: { id: districtId },
      select: { name: true },
    })
    const fleet = await db.deliveryFleet.create({
      data: {
        code: `FLEET-SEED${String(partnerNo).padStart(3, "0")}`,
        name: `${district.name} Delivery Co.`,
        companyName: `${district.name} Delivery Private Limited`,
        contactPerson: "Operations Manager",
        phone: phone(900_000 + partnerNo),
        email: `ops${partnerNo}@sample-delivery.test`,
        address: `${partnerNo} Transport Nagar, ${district.name}`,
        districtId,
        status: "active",
        // The first partner gets the dev key; the rest get a hash nobody knows.
        credentialHash: hashForLookup(
          "delivery-fleet",
          partnerNo === 1 ? DEV_PARTNER_KEY : `unused-${partnerNo}`,
        ),
        credentialIssuedAt: now,
        businesses: { create: businesses.map((business) => ({ business })) },
      },
    })
    // One active primary partner per zone: this partner covers every zone of its district.
    await db.deliveryFleetZone.createMany({
      data: districtZones.map((zone) => ({
        fleetId: fleet.id,
        zoneId: zone.id,
        assignedById: superAdminId,
      })),
    })

    for (let i = 0; i < RIDERS_PER_PARTNER; i++) {
      riderNo += 1
      const zone = districtZones[i % districtZones.length]!
      // Spread riders a little around the zone centre so the map shows them apart.
      const jitter = (i - RIDERS_PER_PARTNER / 2) * 0.004
      const lat = zone.lat !== null ? zone.lat + jitter : null
      const lng = zone.lng !== null ? zone.lng + jitter : null
      const boy = await db.deliveryBoy.create({
        data: {
          code: `DB-SEED${String(riderNo).padStart(4, "0")}`,
          fleetId: fleet.id,
          zoneId: zone.id,
          name: `Rider ${riderNo} ${district.name}`,
          phone: phone(riderNo),
          email: null,
          address: `${riderNo} Lane, ${zone.location}, ${zone.city}`,
          gender: i % 2 === 0 ? "Male" : "Female",
          vehicleType: VEHICLES[riderNo % VEHICLES.length]!,
          vehicleNumber: plate(riderNo),
          drivingLicence: `TN-DL-${String(riderNo).padStart(7, "0")}`,
          // A few riders have documents that expire soon, so the expiry alerts have something to show.
          licenceValidUntil: riderNo % 37 === 0 ? new Date(now.getTime() + 12 * DAY) : licenceValid,
          registrationValidUntil:
            riderNo % 41 === 0
              ? new Date(now.getTime() - 3 * DAY)
              : new Date(now.getTime() + 365 * DAY),
          status: "active",
          availability: i < 6 ? "available" : "offline",
          maxActiveOrders: 2,
          lastLat: lat,
          lastLng: lng,
          lastLocationAt: lat !== null ? now : null,
          submittedAt: now,
        },
      })
      for (const kind of DOCUMENT_KINDS)
        await db.deliveryBoyDocument.create({
          data: {
            boyId: boy.id,
            kind,
            s3Key: `seed/${boy.code}/${kind}.pdf`,
            fileName: `${kind}.pdf`,
            contentType: "application/pdf",
            sizeBytes: 1024,
            verifiedAt: now,
          } satisfies Prisma.DeliveryBoyDocumentUncheckedCreateInput,
        })
      await db.deliveryBoyReview.create({
        data: {
          boyId: boy.id,
          fleetId: fleet.id,
          actorName: "Seed",
          actorRole: "super_admin",
          decision: "approved",
          from: "pending_super",
          to: "active",
          reason: "Sample rider",
        },
      })
    }
  }
  return { partners: partnerNo, riders: riderNo }
}
