import { PrismaClient } from "../src/generated/client/index.js"
import { createFinanceService } from "../src/modules/finance/finance.service.js"

const prisma = new PrismaClient()

// Deterministic PRNG (mulberry32) so re-running the seed produces stable demo data.
function createRandom(seed: number) {
  let state = seed
  return function random() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = createRandom(42)

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

function daysAgo(days: number, hour = 9): Date {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  date.setUTCHours(hour, randomInt(0, 59), 0, 0)
  return date
}

const VENDOR_NAMES = [
  "Saffron Table",
  "The Wok District",
  "Curry Leaf",
  "Spice Avenue",
  "Northstar Essentials",
  "Aster Home Store",
  "Vista Mart",
  "Green Basket",
  "Urban Grill",
  "Mocha & Co",
  "Harvest Corner",
  "Pixel Mart",
  "Daily Fresh",
  "Riverside Kitchen",
  "Lotus Bowl",
  "Metro Essentials",
  "Blue Pepper",
  "Sunrise Grocers",
]

const CUSTOMER_NAMES = [
  "Isha P.",
  "Rohan K.",
  "Meera S.",
  "Aditya R.",
  "Priya M.",
  "Karan V.",
  "Neha T.",
  "Vikram J.",
  "Siddharth M.",
  "Kunal A.",
  "Ananya B.",
  "Rahul D.",
  "Sneha L.",
  "Arjun N.",
  "Divya G.",
  "Manish C.",
]

const PARTNER_NAMES = [
  "A. Sharma",
  "R. Verma",
  "K. Iyer",
  "S. Khan",
  "N. Rao",
  "P. Das",
  "M. Joshi",
  "T. Singh",
  "V. Nair",
  "J. Thomas",
]

const WORKSPACES = [
  { slug: "zoauro-food", name: "ZOAURO FOOD", orderPrefix: "ZOF", businessType: "FOOD" as const },
  { slug: "gloaro-mart", name: "GLOARO MART", orderPrefix: "GLM", businessType: "MART" as const },
]

const ORDER_STATUS_WEIGHTS: Array<{
  status: "PLACED" | "PREPARING" | "ON_THE_WAY" | "DELIVERED" | "CANCELLED" | "REFUNDED"
  weight: number
}> = [
  { status: "DELIVERED", weight: 72 },
  { status: "ON_THE_WAY", weight: 10 },
  { status: "PREPARING", weight: 5 },
  { status: "PLACED", weight: 3 },
  { status: "CANCELLED", weight: 6 },
  { status: "REFUNDED", weight: 4 },
]

function pickOrderStatus() {
  const total = ORDER_STATUS_WEIGHTS.reduce((sum, item) => sum + item.weight, 0)
  let roll = random() * total
  for (const item of ORDER_STATUS_WEIGHTS) {
    if (roll < item.weight) return item.status
    roll -= item.weight
  }
  return "DELIVERED" as const
}

const PAYMENT_METHOD_WEIGHTS: Array<{
  method: "UPI" | "CARD" | "COD" | "NET_BANKING" | "WALLET"
  weight: number
}> = [
  { method: "UPI", weight: 42.8 },
  { method: "CARD", weight: 31.4 },
  { method: "COD", weight: 18.6 },
  { method: "NET_BANKING", weight: 5.2 },
  { method: "WALLET", weight: 2.0 },
]

function pickPaymentMethod() {
  const total = PAYMENT_METHOD_WEIGHTS.reduce((sum, item) => sum + item.weight, 0)
  let roll = random() * total
  for (const item of PAYMENT_METHOD_WEIGHTS) {
    if (roll < item.weight) return item.method
    roll -= item.weight
  }
  return "UPI" as const
}

async function clear() {
  await prisma.financeAuditLog.deleteMany()
  await prisma.payChangeRequest.deleteMany()
  await prisma.payAdjustment.deleteMany()
  await prisma.payout.deleteMany()
  await prisma.partnerRemittance.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.refundCase.deleteMany()
  await prisma.partnerDocument.deleteMany()
  await prisma.complaint.deleteMany()
  await prisma.order.deleteMany()
  await prisma.deliveryPartner.deleteMany()
  await prisma.adminAccount.deleteMany()
  await prisma.vendor.deleteMany()
}

const ADMIN_ACCOUNTS: Record<
  string,
  Array<{
    name: string
    location: string
    accountCode: string
    monthlySalary: number
    commissionPercent: number
    incentiveAmount: number
    onTimeThreshold: number
  }>
> = {
  "zoauro-food": [
    {
      name: "Priya Shankar",
      location: "Chennai · Food operations",
      accountCode: "ADA-70104",
      monthlySalary: 45000,
      commissionPercent: 2,
      incentiveAmount: 8000,
      onTimeThreshold: 92,
    },
    {
      name: "Fathima Begum",
      location: "Coimbatore · Food operations",
      accountCode: "ADA-70138",
      monthlySalary: 38000,
      commissionPercent: 2,
      incentiveAmount: 5000,
      onTimeThreshold: 93,
    },
  ],
  "gloaro-mart": [
    {
      name: "Ravi Chandran",
      location: "Madurai · Mart operations",
      accountCode: "ADA-70121",
      monthlySalary: 40000,
      commissionPercent: 1.5,
      incentiveAmount: 6000,
      onTimeThreshold: 90,
    },
  ],
}

const PARTNER_PAY_PLANS = [
  { monthlySalary: 0, fixedPay: 0, perDeliveryRate: 30, feeSharePercent: 0 },
  { monthlySalary: 14000, fixedPay: 0, perDeliveryRate: 10, feeSharePercent: 0 },
  { monthlySalary: 0, fixedPay: 0, perDeliveryRate: 32, feeSharePercent: 0 },
  { monthlySalary: 0, fixedPay: 0, perDeliveryRate: 0, feeSharePercent: 60 },
  { monthlySalary: 12000, fixedPay: 0, perDeliveryRate: 8, feeSharePercent: 0 },
  { monthlySalary: 0, fixedPay: 0, perDeliveryRate: 28, feeSharePercent: 0 },
  { monthlySalary: 10000, fixedPay: 2000, perDeliveryRate: 5, feeSharePercent: 0 },
  { monthlySalary: 0, fixedPay: 0, perDeliveryRate: 0, feeSharePercent: 55 },
  { monthlySalary: 0, fixedPay: 0, perDeliveryRate: 35, feeSharePercent: 0 },
  { monthlySalary: 15000, fixedPay: 0, perDeliveryRate: 6, feeSharePercent: 0 },
]

async function seedWorkspace(config: (typeof WORKSPACES)[number]) {
  const workspace = await prisma.workspace.upsert({
    where: { slug: config.slug },
    update: { name: config.name, status: "ACTIVE" },
    create: { name: config.name, slug: config.slug, status: "ACTIVE" },
  })

  const vendors = await Promise.all(
    VENDOR_NAMES.slice(0, 18).map((name, index) =>
      prisma.vendor.create({
        data: {
          workspaceId: workspace.id,
          name: `${name} ${config.businessType === "FOOD" ? "Kitchen" : "Store"}`,
          approvalStatus: index < 14 ? "APPROVED" : index < 16 ? "PENDING" : "REJECTED",
          createdAt: daysAgo(randomInt(1, 60)),
        },
      }),
    ),
  )

  const admins = await Promise.all(
    (ADMIN_ACCOUNTS[config.slug] ?? []).map((admin) =>
      prisma.adminAccount.create({ data: { workspaceId: workspace.id, ...admin } }),
    ),
  )
  const codeBase = config.businessType === "FOOD" ? 2370 : 2470

  const deliveryPartners = await Promise.all(
    PARTNER_NAMES.map((name, index) =>
      prisma.deliveryPartner.create({
        data: {
          workspaceId: workspace.id,
          name,
          status: random() < 0.9 ? "ACTIVE" : "INACTIVE",
          createdAt: daysAgo(randomInt(1, 90)),
          code: `DP-${codeBase + index}`,
          accountCode: `DPA-${40200 + index * 13 + (config.businessType === "FOOD" ? 0 : 500)}`,
          adminId: admins.length > 0 ? admins[index % admins.length]!.id : null,
          ...PARTNER_PAY_PLANS[index % PARTNER_PAY_PLANS.length]!,
        },
      }),
    ),
  )

  const approvedVendors = vendors.filter((vendor) => vendor.approvalStatus === "APPROVED")
  const activePartners = deliveryPartners.filter((partner) => partner.status === "ACTIVE")

  const orders = []
  for (let i = 0; i < 150; i += 1) {
    const ageDays = randomInt(0, 59)
    const placedAt = daysAgo(ageDays, randomInt(8, 22))
    const status = pickOrderStatus()
    const grossValue = randomInt(200, 7500)
    const platformRevenue = Math.round(grossValue * 0.17)
    const commissionAmount = Math.round(platformRevenue * 0.7)
    const deliveryFeeAmount = Math.round(platformRevenue * 0.21)

    const acceptedAt =
      status === "PLACED" ? null : new Date(placedAt.getTime() + randomInt(2, 18) * 60_000)
    const readyAt =
      status === "PLACED" || status === "PREPARING" || !acceptedAt
        ? null
        : new Date(acceptedAt.getTime() + randomInt(10, 40) * 60_000)
    const deliveredAt =
      status === "DELIVERED" && acceptedAt
        ? new Date(acceptedAt.getTime() + randomInt(20, 70) * 60_000)
        : null
    const rating = status === "DELIVERED" ? randomInt(3, 5) : null
    const paymentStatus =
      status === "DELIVERED"
        ? "PAID"
        : status === "REFUNDED"
          ? "REFUNDED"
          : status === "CANCELLED"
            ? "FAILED"
            : random() < 0.3
              ? "PAID"
              : "PENDING"
    const assignedPartner =
      status === "PLACED" || status === "CANCELLED" ? null : pick(activePartners)

    const paymentMethod = pickPaymentMethod()
    const order = await prisma.order.create({
      data: {
        workspaceId: workspace.id,
        orderNumber: `${config.orderPrefix}-${(88000 + i).toString()}`,
        paymentMethod,
        vendorId: approvedVendors.length > 0 ? pick(approvedVendors).id : null,
        deliveryPartnerId: assignedPartner?.id ?? null,
        customerName: pick(CUSTOMER_NAMES),
        status,
        paymentStatus,
        grossValue,
        platformRevenue,
        commissionAmount,
        deliveryFeeAmount,
        placedAt,
        acceptedAt,
        readyAt,
        deliveredAt,
        rating,
      },
    })
    orders.push(order)
  }

  const complaintTitles = [
    "Order arrived late",
    "Missing items in order",
    "Wrong item delivered",
    "Packaging damaged",
    "Rude delivery experience",
    "Incorrect billing amount",
  ]
  await Promise.all(
    complaintTitles.map((title, index) =>
      prisma.complaint.create({
        data: {
          workspaceId: workspace.id,
          title,
          status: index < 4 ? "OPEN" : "RESOLVED",
          createdAt: daysAgo(randomInt(0, 14)),
        },
      }),
    ),
  )

  const deliveredOrders = orders.filter(
    (order) => order.status === "DELIVERED" || order.status === "REFUNDED",
  )
  const refundSample = deliveredOrders.slice(0, 5)
  const refundCases = await Promise.all(
    refundSample.map((order, index) =>
      prisma.refundCase.create({
        data: {
          workspaceId: workspace.id,
          orderId: order.id,
          amount: Math.round(Number(order.grossValue) * 0.5),
          status: index < 3 ? "ESCALATED" : index < 4 ? "PENDING" : "RESOLVED",
          createdAt: daysAgo(randomInt(0, 10)),
        },
      }),
    ),
  )

  await Promise.all(
    deliveryPartners.slice(0, 8).map((partner, index) =>
      prisma.partnerDocument.create({
        data: {
          workspaceId: workspace.id,
          deliveryPartnerId: partner.id,
          name: pick(["Driving license", "Vehicle registration", "Background check", "Insurance"]),
          expiresAt: new Date(
            Date.now() + (index < 5 ? randomInt(3, 29) : randomInt(45, 180)) * 24 * 60 * 60 * 1000,
          ),
        },
      }),
    ),
  )

  await seedLedgerTransactions(workspace.id, config, {
    orders,
    vendors,
    deliveryPartners,
    refundCases,
  })

  await seedFinanceActivity(workspace.id, admins, deliveryPartners, orders)
}

function monthStart(offset: number): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
}

async function seedFinanceActivity(
  workspaceId: string,
  admins: Awaited<ReturnType<typeof prisma.adminAccount.create>>[],
  partners: Awaited<ReturnType<typeof prisma.deliveryPartner.create>>[],
  orders: Awaited<ReturnType<typeof prisma.order.create>>[],
) {
  const now = new Date()
  const methods = ["CASH_DEPOSIT", "UPI", "BANK_TRANSFER"] as const

  for (const partner of partners) {
    for (const offset of [-1, 0]) {
      const start = monthStart(offset)
      const end = offset === 0 ? now : new Date(monthStart(1).getTime() - 1)
      const collected = orders
        .filter(
          (order) =>
            order.deliveryPartnerId === partner.id &&
            order.status === "DELIVERED" &&
            order.paymentMethod === "COD" &&
            order.deliveredAt !== null &&
            order.deliveredAt >= start &&
            order.deliveredAt <= end,
        )
        .reduce((sum, order) => sum + Number(order.grossValue), 0)
      if (collected <= 0) continue
      const ratio = offset === -1 ? 0.85 + random() * 0.15 : 0.55 + random() * 0.35
      const total = Math.round(collected * ratio)
      const parts = random() < 0.5 ? 1 : 2
      for (let part = 0; part < parts; part += 1) {
        const span = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000))
        await prisma.partnerRemittance.create({
          data: {
            workspaceId,
            partnerId: partner.id,
            amount: Math.round(total / parts),
            method: pick(methods),
            remittedAt: new Date(start.getTime() + randomInt(1, span) * 86_400_000),
          },
        })
      }
    }
  }

  if (partners[2]) {
    await prisma.payAdjustment.create({
      data: {
        workspaceId,
        partnerId: partners[2].id,
        kind: "BONUS",
        amount: 750,
        note: "Festival peak-hour bonus",
      },
    })
  }
  if (partners[3]) {
    await prisma.payAdjustment.create({
      data: {
        workspaceId,
        partnerId: partners[3].id,
        kind: "DEDUCTION",
        amount: 200,
        note: "Damaged parcel",
      },
    })
  }

  const requester = admins[0]
  if (requester && partners[2] && admins.length > 1) {
    await prisma.payChangeRequest.create({
      data: {
        workspaceId,
        code: "REQ-1041",
        partnerId: partners[2].id,
        requestedById: requester.id,
        proposedPerDelivery: 35,
        reason: "Rain-season retention: raise per-delivery rate",
        createdAt: daysAgo(4, 11),
      },
    })
  }
  if (requester && partners[5] && admins.length === 1) {
    await prisma.payChangeRequest.create({
      data: {
        workspaceId,
        code: "REQ-1042",
        partnerId: partners[5].id,
        requestedById: requester.id,
        proposedFixedPay: 3000,
        proposedPerDelivery: 28,
        reason: "Long-distance mart route allowance",
        createdAt: daysAgo(3, 16),
      },
    })
  }
}

async function seedFinancePayouts() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } })
  const service = createFinanceService(prisma, async () => workspaces.map(({ id }) => id))
  const principal = { userId: "seed" }
  const previous = monthStart(-1)
  const cycle = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`
  await service.generatePayouts(principal, "all", cycle)

  const payouts = await prisma.payout.findMany({ where: { cycle }, orderBy: { code: "asc" } })
  const keepPending = new Set<string>()
  const firstPartner = payouts.find((payout) => payout.kind === "PARTNER")
  const firstAdmin = payouts.find((payout) => payout.kind === "ADMIN")
  const secondPartner = payouts.filter((payout) => payout.kind === "PARTNER")[1]
  if (firstPartner) keepPending.add(firstPartner.id)
  if (firstAdmin) keepPending.add(firstAdmin.id)

  for (const payout of payouts) {
    if (keepPending.has(payout.id)) continue
    const paidAt = new Date(payout.dueDate.getTime() - 2 * 86_400_000)
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: payout.id === secondPartner?.id ? "PAID" : "SETTLED",
        approvedAt: new Date(paidAt.getTime() - 86_400_000),
        approvedBy: "Arjun Menon (Super Admin)",
        paidAt,
      },
    })
  }
  await prisma.financeAuditLog.createMany({
    data: [
      {
        actor: "System",
        action: "Payouts generated",
        detail: `${payouts.length} payouts generated for the previous cycle`,
        createdAt: daysAgo(28, 9),
      },
      {
        actor: "Arjun Menon (Super Admin)",
        action: "Payouts approved",
        detail: `${payouts.length - keepPending.size} payouts approved and settled`,
        createdAt: daysAgo(26, 15),
      },
    ],
  })
}

interface SeedWorkspaceData {
  orders: Awaited<ReturnType<typeof prisma.order.create>>[]
  vendors: Awaited<ReturnType<typeof prisma.vendor.create>>[]
  deliveryPartners: Awaited<ReturnType<typeof prisma.deliveryPartner.create>>[]
  refundCases: Awaited<ReturnType<typeof prisma.refundCase.create>>[]
}

async function seedLedgerTransactions(
  workspaceId: string,
  config: (typeof WORKSPACES)[number],
  { orders, vendors, deliveryPartners, refundCases }: SeedWorkspaceData,
) {
  const vendorNameById = new Map(vendors.map((vendor) => [vendor.id, vendor.name]))
  const approvedVendors = vendors.filter((vendor) => vendor.approvalStatus === "APPROVED")

  let txnSeq = 773999
  let refSeq = 2899
  let setSeq = 8499
  let paySeq = 4299
  let crnSeq = 1399
  let venRefSeq = 1040
  let partnerRefSeq = 2370

  const transactions: Array<Parameters<typeof prisma.transaction.create>[0]["data"]> = []

  for (const order of orders) {
    if (order.status === "CANCELLED") continue

    const paymentMethod = order.paymentMethod
    const grossValue = Number(order.grossValue)
    const platformRevenue = Number(order.platformRevenue)
    const commissionAmount = Number(order.commissionAmount)
    const deliveryFeeAmount = platformRevenue - commissionAmount

    transactions.push({
      workspaceId,
      type: paymentMethod === "COD" ? "COD_COLLECTION" : "ORDER_PAYMENT",
      transactionCode: `TXN-${txnSeq--}`,
      reference: order.orderNumber,
      counterparty: order.vendorId
        ? (vendorNameById.get(order.vendorId) ?? "Unknown vendor")
        : "Walk-in customer",
      paymentMethod,
      grossAmount: grossValue,
      commissionAmount,
      deliveryFeeAmount,
      netAmount: grossValue - platformRevenue,
      createdAt: order.placedAt,
    })
  }

  for (const refundCase of refundCases) {
    const order = orders.find((candidate) => candidate.id === refundCase.orderId)
    transactions.push({
      workspaceId,
      type: "REFUND",
      transactionCode: `REF-${refSeq--}`,
      reference: order?.orderNumber ?? "—",
      counterparty: pick(CUSTOMER_NAMES),
      paymentMethod: "UPI",
      grossAmount: refundCase.amount,
      commissionAmount: 0,
      deliveryFeeAmount: 0,
      netAmount: Number(refundCase.amount) * -1,
      createdAt: refundCase.createdAt,
    })
  }

  for (const vendor of approvedVendors.slice(0, 4)) {
    const grossAmount = randomInt(40000, 180000)
    transactions.push({
      workspaceId,
      type: "VENDOR_SETTLEMENT",
      transactionCode: `SET-${setSeq--}`,
      reference: `VEN-${venRefSeq++}`,
      counterparty: vendor.name,
      paymentMethod: "BANK_TRANSFER",
      grossAmount,
      commissionAmount: 0,
      deliveryFeeAmount: 0,
      netAmount: -grossAmount,
      createdAt: daysAgo(randomInt(0, 12)),
    })
  }

  for (const partner of deliveryPartners.slice(0, 4)) {
    const partnerRef = `DP-${partnerRefSeq++}`
    const earnings = randomInt(4000, 12000)
    transactions.push({
      workspaceId,
      type: "PARTNER_EARNINGS",
      transactionCode: `PAY-${paySeq--}`,
      reference: partnerRef,
      counterparty: partner.name,
      paymentMethod: "BANK_TRANSFER",
      grossAmount: earnings,
      commissionAmount: 0,
      deliveryFeeAmount: 0,
      netAmount: earnings,
      createdAt: daysAgo(randomInt(0, 12)),
    })

    const payout = randomInt(3000, 10000)
    transactions.push({
      workspaceId,
      type: "PAYOUT_HISTORY",
      transactionCode: `PAY-${paySeq--}`,
      reference: partnerRef,
      counterparty: partner.name,
      paymentMethod: random() < 0.5 ? "UPI" : "BANK_TRANSFER",
      grossAmount: payout,
      commissionAmount: 0,
      deliveryFeeAmount: 0,
      netAmount: -payout,
      createdAt: daysAgo(randomInt(0, 12)),
    })
  }

  for (const vendor of vendors.slice(0, 3)) {
    const grossAmount = randomInt(500, 3000)
    transactions.push({
      workspaceId,
      type: "CREDIT_NOTE",
      transactionCode: `CRN-${crnSeq--}`,
      reference: `${config.orderPrefix}-${88000 + randomInt(0, 149)}`,
      counterparty: vendor.name,
      paymentMethod: "STORE_CREDIT",
      grossAmount,
      commissionAmount: 0,
      deliveryFeeAmount: 0,
      netAmount: -grossAmount,
      createdAt: daysAgo(randomInt(0, 20)),
    })
  }

  for (const data of transactions) {
    await prisma.transaction.create({ data })
  }
}

async function main() {
  await clear()
  for (const config of WORKSPACES) {
    await seedWorkspace(config)
  }
  await seedFinancePayouts()
  console.log(
    "Seeded workspaces, vendors, delivery partners, orders, complaints, refunds, documents and ledger transactions.",
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
