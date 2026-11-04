// Records cash-on-delivery collections for orders delivered before the COD tracking existed.
// Safe to run more than once. Usage:
// pnpm --filter @zoauro/api exec tsx --env-file=.env scripts/backfill-cod.ts
import { prisma } from "../src/lib/prisma"
import { recordCodCollection } from "../src/modules/rider-ops/cod"

const orders = await prisma.order.findMany({
  where: { status: "delivered", paymentMethod: "cod", deliveryBoyId: { not: null } },
  select: { id: true },
})
for (const order of orders) await recordCodCollection(prisma, order.id)
const total = await prisma.codCollection.count()
console.log(`Delivered cash orders: ${orders.length}. Collections recorded: ${total}.`)
await prisma.$disconnect()
