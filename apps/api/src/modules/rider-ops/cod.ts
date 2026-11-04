// Cash-on-delivery collections: when a cash order is delivered, the amount the rider collected is
// recorded against the rider until the company confirms the handover.
import type { Prisma } from "../../generated/prisma/client"

type Db = Pick<Prisma.TransactionClient, "order" | "codCollection">

/** Records the collection for a delivered cash-on-delivery order. Safe to call more than once. */
export async function recordCodCollection(db: Db, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      paymentMethod: true,
      deliveryBoyId: true,
      zoneId: true,
      itemsTotalPaise: true,
      deliveryFeePaise: true,
    },
  })
  if (!order || order.paymentMethod !== "cod" || !order.deliveryBoyId) return
  await db.codCollection.upsert({
    where: { orderId },
    create: {
      orderId,
      boyId: order.deliveryBoyId,
      zoneId: order.zoneId,
      amountPaise: order.itemsTotalPaise + order.deliveryFeePaise,
    },
    update: {},
  })
}
