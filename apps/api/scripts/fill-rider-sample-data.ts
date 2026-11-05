// Gives every active delivery rider the sample records the rider screens use: the three verified
// documents (photo ID, driving licence, vehicle registration), and a position at their zone centre
// when they have none. Riders who already have these are left alone, so it is safe to run again.
// Usage:
// pnpm --filter @zoauro/api exec tsx --env-file=.env scripts/fill-rider-sample-data.ts
import { prisma } from "../src/lib/prisma"

const DOCUMENT_KINDS = ["photo_id", "driving_licence", "vehicle_registration"] as const
const now = new Date()

const riders = await prisma.deliveryBoy.findMany({
  where: { status: "active" },
  select: {
    id: true,
    code: true,
    lastLat: true,
    lastLng: true,
    zone: { select: { lat: true, lng: true } },
  },
})

let documents = 0
let positions = 0
let noZone = 0
for (const rider of riders) {
  for (const kind of DOCUMENT_KINDS) {
    const existing = await prisma.deliveryBoyDocument.findUnique({
      where: { boyId_kind: { boyId: rider.id, kind } },
      select: { verifiedAt: true },
    })
    if (existing?.verifiedAt) continue
    await prisma.deliveryBoyDocument.upsert({
      where: { boyId_kind: { boyId: rider.id, kind } },
      create: {
        boyId: rider.id,
        kind,
        s3Key: `seed/${rider.code}/${kind}.pdf`,
        fileName: `${kind}.pdf`,
        contentType: "application/pdf",
        sizeBytes: 1024,
        verifiedAt: now,
      },
      update: { verifiedAt: now },
    })
    documents += 1
  }

  if (rider.lastLat === null || rider.lastLng === null) {
    if (rider.zone.lat === null || rider.zone.lng === null) {
      noZone += 1
    } else {
      // A small offset per rider, so pins at the same zone centre do not sit on each other.
      const offset = ((rider.code.charCodeAt(rider.code.length - 1) % 9) - 4) * 0.003
      await prisma.deliveryBoy.update({
        where: { id: rider.id },
        data: {
          lastLat: rider.zone.lat + offset,
          lastLng: rider.zone.lng + offset,
          lastLocationAt: now,
        },
      })
      positions += 1
    }
  }
}

console.log(
  `Active riders: ${riders.length}. Documents verified: ${documents}. Positions set: ${positions}. ` +
    `Riders whose zone has no coordinates (no position set): ${noZone}.`,
)
await prisma.$disconnect()
