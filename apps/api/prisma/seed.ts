// Development seed: the prototype's accounts, vendors, partners and orders.
// Safe to re-run (it clears the tables it owns first). Refuses to run in production.
import { hash } from "@node-rs/argon2"
import {
  rolePermissions,
  rupeesToPaise,
  type AdminPlan,
  type Business,
  type OrderStatus,
  type PartnerPlan,
} from "@zoauro/shared"
import type { Prisma } from "../src/generated/prisma/client"
import { prisma } from "../src/lib/prisma"

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.")
  process.exit(1)
}

const SEED_ACTOR = "seed"
const rs = rupeesToPaise

// Deterministic pseudo-random numbers so every developer gets the same data.
let x = 20261026
const rand = () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296
const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!

async function clear() {
  // Children first. Audit and ledger tables are append-only in the app; the seed may clear them.
  await prisma.$transaction([
    prisma.partnerLocation.deleteMany(),
    prisma.payoutLine.deleteMany(),
    prisma.payout.deleteMany(),
    prisma.payChangeRequest.deleteMany(),
    prisma.dailyAccrual.deleteMany(),
    prisma.adjustment.deleteMany(),
    prisma.remittance.deleteMany(),
    prisma.payPlanVersion.deleteMany(),
    prisma.ledgerEntry.deleteMany(),
    prisma.ledgerTransaction.deleteMany(),
    prisma.orderEvent.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.partnerDocument.deleteMany(),
    prisma.partnerBusiness.deleteMany(),
    prisma.partner.deleteMany(),
    prisma.bankAccount.deleteMany(),
    prisma.vendorDocument.deleteMany(),
    prisma.vendor.deleteMany(),
    prisma.feeRule.deleteMany(),
    prisma.memberZone.deleteMany(),
    prisma.memberPermission.deleteMany(),
    prisma.memberBusiness.deleteMany(),
    prisma.member.deleteMany(),
    prisma.zone.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.outboxEvent.deleteMany(),
    prisma.auditLog.deleteMany(),
  ])
}

const zoneSeed: [district: string, city: string, locations: string[]][] = [
  ["Chennai", "Chennai", ["T. Nagar", "Velachery", "Anna Nagar", "Adyar", "Egmore"]],
  ["Coimbatore", "Coimbatore", ["Gandhipuram", "RS Puram", "Peelamedu"]],
  ["Madurai", "Madurai", ["Periyar Bus Stand", "Anna Nagar", "KK Nagar"]],
  ["Tiruchirappalli", "Tiruchirappalli", ["Central Bus Stand", "Srirangam"]],
]

/** Approximate centres for live tracking maps. */
const zoneCentre: Record<string, [lat: number, lng: number]> = {
  "Chennai/T. Nagar": [13.0418, 80.2341],
  "Chennai/Velachery": [12.9791, 80.2209],
  "Chennai/Anna Nagar": [13.085, 80.2101],
  "Chennai/Adyar": [13.0012, 80.2565],
  "Chennai/Egmore": [13.0732, 80.2609],
  "Coimbatore/Gandhipuram": [11.0168, 76.9658],
  "Coimbatore/RS Puram": [11.0089, 76.95],
  "Coimbatore/Peelamedu": [11.03, 77.027],
  "Madurai/Periyar Bus Stand": [9.9177, 78.1148],
  "Madurai/Anna Nagar": [9.929, 78.146],
  "Madurai/KK Nagar": [9.9369, 78.1428],
  "Tiruchirappalli/Central Bus Stand": [10.7996, 78.6826],
  "Tiruchirappalli/Srirangam": [10.8628, 78.6926],
}

async function main() {
  await clear()

  // ---- zones ----
  const zones: Record<string, string> = {}
  for (const [district, city, locations] of zoneSeed)
    for (const location of locations) {
      const [lat, lng] = zoneCentre[`${city}/${location}`] ?? [null, null]
      const z = await prisma.zone.create({ data: { district, city, location, lat, lng } })
      zones[`${city}/${location}`] = z.id
    }
  const chennai = Object.entries(zones)
    .filter(([k]) => k.startsWith("Chennai/"))
    .map(([, v]) => v)
  const cbe = Object.entries(zones)
    .filter(([k]) => k.startsWith("Coimbatore/"))
    .map(([, v]) => v)
  const mdu = Object.entries(zones)
    .filter(([k]) => k.startsWith("Madurai/"))
    .map(([, v]) => v)

  // ---- members ----
  // Demo passwords from the prototype. Change them before sharing any environment.
  type MemberSeed = {
    email: string
    name: string
    password: string
    role: "super_admin" | "admin"
    businesses: Business[]
    zoneIds: string[]
    /** Verified demo mobile number; Fathima has none, to show that state. */
    phone?: string
  }
  const memberSeed: MemberSeed[] = [
    {
      email: "superadmin@gokart.in",
      phone: "+919840012345",
      name: "Arjun Menon",
      password: "Gokart@12345",
      role: "super_admin",
      businesses: ["food", "mart"],
      zoneIds: [],
    },
    {
      email: "admin@gokart.in",
      phone: "+919840023456",
      name: "Ananya Kapoor",
      password: "Admin@123",
      role: "admin",
      businesses: ["food", "mart"],
      zoneIds: chennai,
    },
    {
      email: "priya.shankar@gokart.in",
      phone: "+919840034567",
      name: "Priya Shankar",
      password: "Admin@123",
      role: "admin",
      businesses: ["food"],
      zoneIds: chennai,
    },
    {
      email: "ravi.chandran@gokart.in",
      phone: "+919840045678",
      name: "Ravi Chandran",
      password: "Admin@123",
      role: "admin",
      businesses: ["mart"],
      zoneIds: mdu,
    },
    {
      email: "fathima.begum@gokart.in",
      name: "Fathima Begum",
      password: "Admin@123",
      role: "admin",
      businesses: ["food"],
      zoneIds: cbe,
    },
  ]
  const members: Record<string, string> = {}
  for (const m of memberSeed) {
    const created = await prisma.member.create({
      data: {
        email: m.email,
        name: m.name,
        phone: m.phone ?? null,
        phoneVerified: Boolean(m.phone),
        role: m.role,
        passwordHash: await hash(m.password),
        businesses: { create: m.businesses.map((business) => ({ business })) },
        zones: { create: m.zoneIds.map((zoneId) => ({ zoneId })) },
        permissions: { create: rolePermissions[m.role].map((permission) => ({ permission })) },
      },
    })
    members[m.email] = created.id
  }
  const superId = members["superadmin@gokart.in"]!

  // ---- fee rules ----
  for (const business of ["food", "mart"] as const)
    await prisma.feeRule.create({
      data: {
        business,
        baseFeePaise: business === "food" ? rs(38) : rs(49),
        perKmPaise: rs(6),
        freeAbovePaise: business === "food" ? rs(499) : rs(999),
        effectiveFrom: new Date("2026-08-01"),
        createdById: superId,
      },
    })

  // ---- vendors (prototype lists, relocated to Tamil Nadu zones) ----
  // VEN-1048…1042: the Super Admin vendor table. VEN-1037…1030: the Admin portal's
  // Chennai restaurants and sellers, numbered lower so the Super Admin list keeps its order.
  const vendorSeed: [
    code: string,
    business: Business,
    name: string,
    owner: string,
    zone: string,
    status: "active" | "pending_review" | "suspended",
    bps: number,
  ][] = [
    ["VEN-1048", "food", "Saffron Table", "Arjun Mehta", "Chennai/T. Nagar", "active", 1800],
    [
      "VEN-1047",
      "mart",
      "Northstar Essentials",
      "Naina Shah",
      "Madurai/Anna Nagar",
      "pending_review",
      1200,
    ],
    ["VEN-1046", "food", "The Wok District", "Rohan Das", "Chennai/Velachery", "active", 1800],
    ["VEN-1045", "mart", "Aster Home Store", "Meera Iyer", "Madurai/KK Nagar", "suspended", 1200],
    ["VEN-1044", "food", "Madras Pantry", "Vikram Rao", "Chennai/Adyar", "active", 1750],
    [
      "VEN-1043",
      "food",
      "Kovai Biryani House",
      "Senthil Kumar",
      "Coimbatore/Gandhipuram",
      "active",
      1800,
    ],
    [
      "VEN-1042",
      "mart",
      "Meenakshi Mart",
      "Lakshmi P",
      "Madurai/Periyar Bus Stand",
      "active",
      1200,
    ],
    ["VEN-1037", "food", "Saffron Kitchen", "Farah Siddiqui", "Chennai/T. Nagar", "active", 1800],
    ["VEN-1036", "food", "Green Bowl Co.", "Nikhil Rao", "Chennai/Velachery", "active", 1750],
    ["VEN-1035", "food", "Bombay Bites", "Kabir Mehta", "Chennai/Anna Nagar", "active", 1800],
    ["VEN-1034", "food", "The Dosa Room", "Gayathri S", "Chennai/Adyar", "active", 1700],
    ["VEN-1033", "mart", "UrbanNest Retail", "Rhea Kapoor", "Chennai/Egmore", "active", 1200],
    ["VEN-1032", "mart", "Techverse India", "Aditya Jain", "Chennai/T. Nagar", "active", 1000],
    ["VEN-1031", "mart", "Everyday Living", "Sneha Pillai", "Chennai/Velachery", "active", 1200],
    ["VEN-1030", "mart", "Mode Studio", "Tara Menon", "Chennai/Anna Nagar", "active", 1500],
  ]
  const vendors: {
    id: string
    business: Business
    zoneId: string
    name: string
    status: string
  }[] = []
  for (const [code, business, name, ownerName, zone, status, commissionBps] of vendorSeed) {
    const num = code.slice(4)
    const letters = (name.toUpperCase().replace(/[^A-Z]/g, "") + "XXXXX").slice(0, 5)
    const pending = status === "pending_review"
    const v = await prisma.vendor.create({
      data: {
        code,
        business,
        name,
        ownerName,
        phone: `+9198${String(40000000 + Number(num) * 37).slice(0, 8)}`,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
        address: `${zone.split("/")[1]}, ${zone.split("/")[0]}, Tamil Nadu`,
        zoneId: zones[zone]!,
        gstin: `33${letters}${num}F1Z${num.at(-1)}`,
        fssai: business === "food" ? `1242${num}000${num.slice(0, 3)}` : null,
        status,
        verification: pending ? "under_review" : "verified",
        commissionBps,
        ...(!pending && { decidedById: superId, decidedAt: new Date("2026-08-01") }),
        ...(status === "suspended" && { decisionReason: "Repeated late dispatches" }),
        documents: {
          create: [
            "gst_certificate",
            ...(business === "food" ? ["fssai_licence"] : []),
            "bank_proof",
          ].map((kind) => ({
            kind,
            s3Key: `seed/vendors/${code}/${kind}.pdf`,
            fileName: `${kind.replace(/_/g, "-")}.pdf`,
            verifiedAt: pending ? null : new Date("2026-08-01"),
          })),
        },
      },
    })
    vendors.push({ id: v.id, business, zoneId: v.zoneId, name, status })
  }

  // ---- partners ----
  // The finance engine's partners with their pay plans, carrying the Super Admin table's
  // services, deliveries and ratings, plus the Admin portal's Chennai partners.
  type PartnerSeed = {
    code: string
    name: string
    businesses: Business[]
    admin: string
    zone: string
    vehicle: "motorcycle" | "scooter" | "e_bike"
    availability: "available" | "on_delivery" | "offline"
    deliveries: number
    /** Stars × 10; null before the first rating. */
    rating: number | null
    kycVerified?: boolean
    plan: PartnerPlan
  }
  const perDelivery = (rupees: number): PartnerPlan => ({
    salaryPaise: 0,
    fixedPaise: 0,
    perDeliveryPaise: rs(rupees),
    commissionPct: 0,
  })
  const partnerSeed: PartnerSeed[] = [
    {
      code: "DP-2381",
      name: "Rahul Verma",
      businesses: ["food", "mart"],
      admin: "priya.shankar@gokart.in",
      zone: "Chennai/T. Nagar",
      vehicle: "motorcycle",
      availability: "available",
      deliveries: 1284,
      rating: 49,
      plan: perDelivery(30),
    },
    {
      code: "DP-2380",
      name: "Imran Khan",
      businesses: ["food"],
      admin: "priya.shankar@gokart.in",
      zone: "Chennai/Velachery",
      vehicle: "scooter",
      availability: "on_delivery",
      deliveries: 940,
      rating: 48,
      plan: { salaryPaise: rs(14000), fixedPaise: 0, perDeliveryPaise: rs(10), commissionPct: 0 },
    },
    {
      code: "DP-2387",
      name: "Divya M",
      businesses: ["food"],
      admin: "priya.shankar@gokart.in",
      zone: "Chennai/Adyar",
      vehicle: "e_bike",
      availability: "available",
      deliveries: 512,
      rating: 47,
      plan: perDelivery(32),
    },
    {
      code: "DP-2378",
      name: "Karan Singh",
      businesses: ["food", "mart"],
      admin: "fathima.begum@gokart.in",
      zone: "Coimbatore/Gandhipuram",
      vehicle: "e_bike",
      availability: "available",
      deliveries: 0,
      rating: null,
      kycVerified: false,
      plan: { salaryPaise: 0, fixedPaise: 0, perDeliveryPaise: 0, commissionPct: 60 },
    },
    {
      code: "DP-2385",
      name: "Meena Devi",
      businesses: ["food"],
      admin: "fathima.begum@gokart.in",
      zone: "Coimbatore/RS Puram",
      vehicle: "scooter",
      availability: "offline",
      deliveries: 688,
      rating: 46,
      plan: { salaryPaise: rs(12000), fixedPaise: 0, perDeliveryPaise: rs(8), commissionPct: 0 },
    },
    {
      code: "DP-2379",
      name: "Pooja Nair",
      businesses: ["mart"],
      admin: "ravi.chandran@gokart.in",
      zone: "Madurai/Anna Nagar",
      vehicle: "motorcycle",
      availability: "offline",
      deliveries: 760,
      rating: 49,
      plan: { salaryPaise: 0, fixedPaise: rs(8000), perDeliveryPaise: rs(20), commissionPct: 0 },
    },
    {
      code: "DP-2384",
      name: "Arun Kumar",
      businesses: ["mart"],
      admin: "ravi.chandran@gokart.in",
      zone: "Madurai/KK Nagar",
      vehicle: "motorcycle",
      availability: "on_delivery",
      deliveries: 834,
      rating: 47,
      plan: perDelivery(28),
    },
    {
      code: "DP-2386",
      name: "Suresh Babu",
      businesses: ["mart"],
      admin: "ravi.chandran@gokart.in",
      zone: "Madurai/Periyar Bus Stand",
      vehicle: "scooter",
      availability: "available",
      deliveries: 421,
      rating: 46,
      plan: { salaryPaise: 0, fixedPaise: 0, perDeliveryPaise: rs(5), commissionPct: 55 },
    },
    // Admin portal (Ananya Kapoor's Chennai zones).
    {
      code: "DP-1042",
      name: "Vikram Singh",
      businesses: ["food"],
      admin: "admin@gokart.in",
      zone: "Chennai/T. Nagar",
      vehicle: "motorcycle",
      availability: "available",
      deliveries: 1284,
      rating: 49,
      plan: perDelivery(30),
    },
    {
      code: "DP-1186",
      name: "Meera Joshi",
      businesses: ["food", "mart"],
      admin: "admin@gokart.in",
      zone: "Chennai/Anna Nagar",
      vehicle: "scooter",
      availability: "on_delivery",
      deliveries: 986,
      rating: 48,
      plan: perDelivery(28),
    },
    {
      code: "DP-1215",
      name: "Imran Khan",
      businesses: ["food"],
      admin: "admin@gokart.in",
      zone: "Chennai/Egmore",
      vehicle: "e_bike",
      availability: "available",
      deliveries: 764,
      rating: 47,
      plan: perDelivery(30),
    },
    {
      // The prototype shows a mini van; vehicle types have no van yet.
      code: "DP-0934",
      name: "Asha Nair",
      businesses: ["mart"],
      admin: "admin@gokart.in",
      zone: "Chennai/Velachery",
      vehicle: "motorcycle",
      availability: "available",
      deliveries: 1451,
      rating: 49,
      plan: perDelivery(35),
    },
  ]
  const partners: { id: string; businesses: Business[]; zoneId: string }[] = []
  for (const [i, s] of partnerSeed.entries()) {
    const p = await prisma.partner.create({
      data: {
        code: s.code,
        name: s.name,
        phone: `+9197${String(10000000 + i * 104729).slice(0, 8)}`,
        zoneId: zones[s.zone]!,
        vehicleType: s.vehicle,
        vehicleNumber: `TN ${String(1 + i * 7).padStart(2, "0")} ${pick(["AB", "CK", "BX", "DM"])} ${String(1000 + Math.floor(rand() * 8999))}`,
        drivingLicence: `TN${String(10 + i)}2019000${String(4821 + i)}`,
        status: "active",
        availability: s.availability,
        kycVerified: s.kycVerified ?? true,
        bankVerified: s.kycVerified ?? true,
        ratingTenths: s.rating,
        deliveriesCompleted: s.deliveries,
        managedByAdminId: members[s.admin]!,
        decidedById: superId,
        decidedAt: new Date("2026-08-01"),
        businesses: { create: s.businesses.map((business) => ({ business })) },
      },
    })
    partners.push({ id: p.id, businesses: s.businesses, zoneId: p.zoneId })
    await prisma.payPlanVersion.create({
      data: {
        accountType: "partner",
        accountId: p.id,
        effectiveFrom: new Date("2026-08-01"),
        plan: s.plan,
        reason: "Contracted rate",
        createdById: superId,
      },
    })
  }

  // A partner application waiting for Super Admin approval, with the details the
  // prototype's approval drawer shows.
  const applicant = await prisma.partner.create({
    data: {
      code: "DP-2026-001",
      name: "Arun Prakash",
      phone: "+919876543210",
      email: "arun.prakash@example.com",
      dateOfBirth: new Date("1997-08-14"),
      gender: "Male",
      address: "42, Anna Nagar West, Chennai",
      pinCode: "600040",
      zoneId: zones["Chennai/Anna Nagar"]!,
      vehicleType: "motorcycle",
      vehicleNumber: "TN 01 AB 4821",
      vehicleModel: "Honda SP 125",
      drivingLicence: "TN01 20210048217",
      licenceValidUntil: new Date("2031-03-18"),
      status: "pending_approval",
      submittedById: members["admin@gokart.in"]!,
      businesses: { create: [{ business: "food" }] },
      documents: {
        create: [
          ["aadhaar", "aadhaar-xxxx-4821.pdf"],
          ["driving_licence", "driving-licence.pdf"],
          ["vehicle_rc", "vehicle-rc.pdf"],
          ["insurance", "insurance.pdf"],
          ["photo", "vehicle-front.jpg"],
        ].map(([kind, fileName]) => ({
          kind: kind!,
          fileName: fileName!,
          s3Key: `seed/partners/DP-2026-001/${fileName}`,
        })),
      },
    },
  })
  await prisma.bankAccount.create({
    data: {
      accountType: "partner",
      accountId: applicant.id,
      holderName: "Arun Prakash",
      bankName: "HDFC Bank",
      last4: "4821",
      ifsc: "HDFC0001284",
    },
  })
  await prisma.auditLog.create({
    data: {
      actorId: members["admin@gokart.in"]!,
      actorName: "Ananya Kapoor",
      action: "partner.submitted",
      entityType: "partner",
      entityId: applicant.id,
      detail: { code: "DP-2026-001" },
    },
  })

  const adminPlans: [email: string, plan: AdminPlan][] = [
    [
      "priya.shankar@gokart.in",
      { salaryPaise: rs(45000), commissionPct: 2, targetOnTimePct: 92, incentivePaise: rs(8000) },
    ],
    [
      "ravi.chandran@gokart.in",
      { salaryPaise: rs(40000), commissionPct: 1.5, targetOnTimePct: 90, incentivePaise: rs(6000) },
    ],
    [
      "fathima.begum@gokart.in",
      { salaryPaise: rs(38000), commissionPct: 2, targetOnTimePct: 93, incentivePaise: rs(5000) },
    ],
  ]
  for (const [email, plan] of adminPlans)
    await prisma.payPlanVersion.create({
      data: {
        accountType: "admin",
        accountId: members[email]!,
        effectiveFrom: new Date("2026-08-01"),
        plan,
        reason: "Employment contract",
        createdById: superId,
      },
    })

  // ---- orders ----
  const customers = [
    "Ananya S.",
    "Siddharth M.",
    "Tanya R.",
    "Kunal A.",
    "Isha P.",
    "Karthik V.",
    "Divya R.",
    "Naveen K.",
    "Sowmya B.",
    "Harish T.",
  ]
  const foodItems: [string, number][] = [
    ["Chicken Biryani", 280],
    ["Paneer Butter Masala", 240],
    ["Masala Dosa", 110],
    ["Veg Fried Rice", 190],
    ["Filter Coffee", 45],
    ["Gulab Jamun (2)", 80],
  ]
  const martItems: [string, number][] = [
    ["Basmati Rice 5 kg", 640],
    ["Sunflower Oil 1 L", 165],
    ["Toor Dal 1 kg", 180],
    ["Detergent 2 kg", 420],
    ["Stainless Steel Kadai", 1290],
    ["Bedsheet Set", 990],
  ]
  const flow: Record<Business, OrderStatus[]> = {
    food: [
      "placed",
      "accepted",
      "preparing",
      "ready",
      "assigned",
      "picked_up",
      "out_for_delivery",
      "delivered",
      "delivered",
      "delivered",
      "cancelled",
      "refund_requested",
    ],
    mart: [
      "placed",
      "accepted",
      "packed",
      "ready",
      "assigned",
      "out_for_delivery",
      "delivered",
      "delivered",
      "delivered",
      "cancelled",
    ],
  }
  const withPartner = new Set<OrderStatus>([
    "assigned",
    "picked_up",
    "out_for_delivery",
    "delivered",
    "refund_requested",
  ])
  const now = Date.now()

  // The prototype's five orders first, then generated ones.
  const fixed: [
    code: string,
    business: Business,
    customer: string,
    vendor: string,
    status: OrderStatus,
    method: "upi" | "cod" | "card",
    total: number,
  ][] = [
    ["ZOF-88219", "food", "Ananya S.", "Saffron Table", "out_for_delivery", "upi", 1240],
    ["GLM-46093", "mart", "Siddharth M.", "Meenakshi Mart", "out_for_delivery", "upi", 3890],
    ["ZOF-88218", "food", "Tanya R.", "The Wok District", "preparing", "cod", 860],
    ["GLM-46092", "mart", "Kunal A.", "Meenakshi Mart", "packed", "card", 6490],
    ["ZOF-88217", "food", "Isha P.", "Madras Pantry", "refund_requested", "upi", 720],
  ]
  let n = 0
  async function createOrder(
    code: string,
    business: Business,
    customer: string,
    vendor: (typeof vendors)[number],
    status: OrderStatus,
    method: "upi" | "cod" | "card",
    totalRupees?: number,
  ) {
    const menu = business === "food" ? foodItems : martItems
    const items = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
      const [name, price] = pick(menu)
      return { name, quantity: 1 + Math.floor(rand() * 2), unitPricePaise: rs(price) }
    })
    let itemsTotal = items.reduce((t, i) => t + i.quantity * i.unitPricePaise, 0)
    const fee = business === "food" ? rs(38) : rs(49)
    if (totalRupees) {
      // Keep the prototype's totals: one line item carrying the whole amount.
      items.splice(0, items.length, {
        name: `${business === "food" ? "Meal" : "Basket"} order`,
        quantity: 1,
        unitPricePaise: rs(totalRupees) - fee,
      })
      itemsTotal = rs(totalRupees) - fee
    }
    const partner = withPartner.has(status)
      ? (partners.find((p) => p.businesses.includes(business) && p.zoneId === vendor.zoneId) ??
        partners.find((p) => p.businesses.includes(business)))
      : undefined
    const placedAt = new Date(now - (n++ * 47 + Math.floor(rand() * 40)) * 60_000)
    const data: Prisma.OrderCreateInput = {
      code,
      business,
      status,
      customerName: customer,
      customerPhone: `+9199${String(40000000 + n * 7919).slice(0, 8)}`,
      vendor: { connect: { id: vendor.id } },
      zone: { connect: { id: vendor.zoneId } },
      ...(partner && { partner: { connect: { id: partner.id } } }),
      paymentMethod: method,
      paymentStatus:
        status === "cancelled"
          ? "failed"
          : method === "cod" && status !== "delivered"
            ? "pending"
            : "paid",
      itemsTotalPaise: itemsTotal,
      deliveryFeePaise: fee,
      totalPaise: itemsTotal + fee,
      placedAt,
      items: { create: items },
      events: {
        create: [
          { to: "placed", actorType: "app", at: placedAt },
          ...(status !== "placed"
            ? [
                {
                  from: "placed" as const,
                  to: status,
                  actorType: "seed",
                  at: new Date(placedAt.getTime() + 20 * 60_000),
                },
              ]
            : []),
        ],
      },
    }
    await prisma.order.create({ data })
  }
  for (const [code, business, customer, vendorName, status, method, total] of fixed)
    await createOrder(
      code,
      business,
      customer,
      vendors.find((v) => v.name === vendorName)!,
      status,
      method,
      total,
    )
  // Generated orders go to live vendors only, so pending and suspended ones show none.
  const live = vendors.filter((v) => v.status === "active")
  const GENERATED = 120
  for (let i = 0; i < GENERATED; i++) {
    const vendor = pick(live)
    const prefix = vendor.business === "food" ? "ZOF" : "GLM"
    const code = `${prefix}-${vendor.business === "food" ? 88216 - i : 46091 - i}`
    await createOrder(
      code,
      vendor.business,
      pick(customers),
      vendor,
      pick(flow[vendor.business]),
      pick(["upi", "upi", "card", "cod"] as const),
    )
  }

  await prisma.auditLog.create({
    data: {
      actorName: SEED_ACTOR,
      action: "seed.loaded",
      entityType: "system",
      entityId: "seed",
      detail: { orders: fixed.length + GENERATED },
    },
  })
  console.info(
    `Seeded ${Object.keys(zones).length} zones, ${memberSeed.length} members, ${vendors.length} vendors, ${partners.length + 1} partners, ${fixed.length + GENERATED} orders.`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
