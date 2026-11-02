// Smart alerts: orders running past their time limit, failed payments, and open orders at vendors
// that were suspended. Each alert goes to the zone's admins and every Super Admin, once per day.
import { FULFILMENT_STATUSES, ORDER_SLA_MINUTES, type Business } from "@zoauro/shared"
import { prisma } from "../../lib/prisma"
import { linkFor, membersFor, notify } from "../../lib/notify"
import { redis } from "../../lib/redis"
import { delayedWhere } from "../orders/orders.repository"

const ALERT_MEMORY_SECONDS = 24 * 60 * 60

/** True the first time a key is seen in a day, so an alert is never repeated sooner. */
async function firstTime(key: string) {
  return (await redis.set(`alert:${key}`, "1", "EX", ALERT_MEMORY_SECONDS, "NX")) === "OK"
}

async function alertZone(
  business: Business,
  zoneId: string,
  dedupe: string,
  alert: { title: string; body: string; link: string },
) {
  if (!(await firstTime(dedupe))) return
  await prisma.$transaction(async (tx) => {
    const members = await membersFor(tx, business, zoneId)
    await notify(
      tx,
      members.map((member) => member.id),
      alert,
    )
  })
}

export async function checkDelayedOrders(now = Date.now()) {
  const orders = await prisma.order.findMany({
    where: delayedWhere(now),
    select: { id: true, code: true, business: true, zoneId: true, status: true, placedAt: true },
    orderBy: { placedAt: "asc" },
    take: 200,
  })
  for (const order of orders)
    await alertZone(order.business, order.zoneId, `delayed:${order.id}`, {
      title: "Order delayed",
      body: `${order.code} is still ${order.status.replaceAll("_", " ")} after the ${ORDER_SLA_MINUTES[order.business]}-minute limit.`,
      link: linkFor("admin", order.business, "orders", `search=${order.code}`),
    })
  return orders.length
}

export async function checkPaymentFailures(now = Date.now()) {
  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: "failed",
      placedAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, code: true, business: true, zoneId: true },
    take: 200,
  })
  for (const order of orders)
    await alertZone(order.business, order.zoneId, `payment:${order.id}`, {
      title: "Payment failed",
      body: `The payment for ${order.code} failed. Check with the customer before the order is prepared.`,
      link: linkFor("admin", order.business, "orders", `search=${order.code}`),
    })
  return orders.length
}

export async function checkVendorIssues() {
  const vendors = await prisma.vendor.findMany({
    where: {
      status: "suspended",
      orders: { some: { status: { in: [...FULFILMENT_STATUSES] } } },
    },
    select: {
      id: true,
      name: true,
      business: true,
      zoneId: true,
      orders: {
        where: { status: { in: [...FULFILMENT_STATUSES] } },
        select: { id: true },
      },
    },
    take: 100,
  })
  for (const vendor of vendors)
    await alertZone(vendor.business, vendor.zoneId, `vendor:${vendor.id}`, {
      title: "Suspended vendor has open orders",
      body: `${vendor.name} is suspended but has ${vendor.orders.length} order(s) still being fulfilled.`,
      link: linkFor(
        "admin",
        vendor.business,
        "vendors",
        `search=${encodeURIComponent(vendor.name)}`,
      ),
    })
  return vendors.length
}

/** One pass of every check. The server runs this on an interval. */
export async function runAlertChecks(now = Date.now()) {
  return {
    delayedOrders: await checkDelayedOrders(now),
    paymentFailures: await checkPaymentFailures(now),
    vendorIssues: await checkVendorIssues(),
  }
}
