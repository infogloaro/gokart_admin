// Development seed: the prototype's accounts, vendors, partners and orders.
// Safe to re-run (it clears the tables it owns first). Refuses to run in production.
import { hash } from "@node-rs/argon2"
import {
  ORDER_SLA_MINUTES,
  rolePermissions,
  rupeesToPaise,
  type AdminPlan,
  type Business,
  type OrderStatus,
  type PartnerPlan,
} from "@zoauro/shared"
import type { Prisma } from "../src/generated/prisma/client"
import { prisma } from "../src/lib/prisma"
import * as finance from "../src/modules/finance/finance.service"
import { syncZones } from "./sync-zones"

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
    prisma.complaintNote.deleteMany(),
    prisma.complaint.deleteMany(),
    prisma.product.deleteMany(),
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
    // Delivery partners reference orders, zones and members, so they go before members.
    prisma.deliveryAssignment.deleteMany(),
    prisma.deliveryHistory.deleteMany(),
    prisma.deliveryBoyNotification.deleteMany(),
    prisma.deliveryBoyReview.deleteMany(),
    prisma.deliveryBoyDocument.deleteMany(),
    prisma.deliveryBoy.deleteMany(),
    prisma.deliveryFleetZone.deleteMany(),
    prisma.deliveryFleetBusiness.deleteMany(),
    prisma.deliveryFleet.deleteMany(),
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

async function main() {
  await clear()

  // ---- zones: every Tamil Nadu district (tamil-nadu.ts), keyed "District/Area" ----
  const zones = await syncZones()
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
      businesses: ["food", "mart"],
      zoneIds: chennai,
    },
    {
      email: "ravi.chandran@gokart.in",
      phone: "+919840045678",
      name: "Ravi Chandran",
      password: "Admin@123",
      role: "admin",
      businesses: ["food", "mart"],
      zoneIds: mdu,
    },
    {
      email: "fathima.begum@gokart.in",
      name: "Fathima Begum",
      password: "Admin@123",
      role: "admin",
      businesses: ["food", "mart"],
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
    // Waiting for approval in the demo admins' zones, so both workspaces have one to review.
    [
      "VEN-1029",
      "mart",
      "Kanchi Silks & Home",
      "Revathi Narayanan",
      "Chennai/Adyar",
      "pending_review",
      1300,
    ],
    [
      "VEN-1028",
      "food",
      "Chettinad Spice Co.",
      "Muthu Raman",
      "Chennai/Anna Nagar",
      "pending_review",
      1750,
    ],
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
  const withPartner = new Set<OrderStatus>([
    "assigned",
    "picked_up",
    "out_for_delivery",
    "delivered",
    "refund_requested",
  ])
  // Orders are placed relative to when the seed runs, and each order's status matches its
  // age: recent ones are still moving, older ones are finished. A few are deliberately late,
  // a few are close to the limit, and each business has six refund complaints.
  const now = Date.now()
  const IST = 330 * 60_000
  const startOfToday =
    Date.parse(`${new Date(now + IST).toISOString().slice(0, 10)}T00:00:00Z`) - IST
  // Spread "today" over at least two hours, even when seeding just after midnight.
  const minutesToday = Math.max(120, Math.floor((now - startOfToday) / 60_000))
  const sla = ORDER_SLA_MINUTES
  const steps: Record<Business, OrderStatus[]> = {
    food: ["accepted", "preparing", "ready", "assigned", "picked_up", "out_for_delivery"],
    mart: ["accepted", "packed", "ready", "assigned", "out_for_delivery"],
  }
  const minutes = (m: number) => m * 60_000
  const between = (a: number, b: number) => Math.floor(a + rand() * (b - a))

  type Plan = {
    code: string
    business: Business
    customer: string
    vendor: (typeof vendors)[number]
    status: OrderStatus
    method: "upi" | "cod" | "card"
    ageMinutes: number
    totalRupees?: number
    /** Why the customer complained or the order was cancelled. */
    reason?: string
  }

  /** In-progress status for an order this far through its time limit. */
  function progressFor(business: Business, ageMinutes: number): OrderStatus {
    if (ageMinutes < 8) return "placed"
    const s = steps[business]
    const frac = Math.min(0.999, ageMinutes / (sla[business] * 0.75))
    return s[Math.floor(frac * s.length)]!
  }
  function finishedFor(): OrderStatus {
    const r = rand()
    return r < 0.84 ? "delivered" : r < 0.95 ? "cancelled" : "refunded"
  }

  let n = 0
  async function createOrder(o: Plan) {
    const { business, vendor, status, method } = o
    const menu = business === "food" ? foodItems : martItems
    const items = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
      const [name, price] = pick(menu)
      return { name, quantity: 1 + Math.floor(rand() * 2), unitPricePaise: rs(price) }
    })
    let itemsTotal = items.reduce((t, i) => t + i.quantity * i.unitPricePaise, 0)
    const fee = business === "food" ? rs(38) : rs(49)
    if (o.totalRupees) {
      // Keep the prototype's totals: one line item carrying the whole amount.
      items.splice(0, items.length, {
        name: `${business === "food" ? "Meal" : "Basket"} order`,
        quantity: 1,
        unitPricePaise: rs(o.totalRupees) - fee,
      })
      itemsTotal = rs(o.totalRupees) - fee
    }
    const partner =
      withPartner.has(status) || status === "refunded"
        ? (partners.find((p) => p.businesses.includes(business) && p.zoneId === vendor.zoneId) ??
          partners.find((p) => p.businesses.includes(business)))
        : undefined
    n++
    const placedAt = new Date(now - minutes(o.ageMinutes))
    const at = (m: number) => new Date(Math.min(now, placedAt.getTime() + minutes(m)))
    const limit = sla[business]
    // Most deliveries land inside the time limit; about one in seven runs late.
    const deliveredAfter =
      rand() < 0.86 ? between(limit * 0.55, limit * 0.95) : between(limit + 5, limit * 1.5)
    type Ev = {
      from?: OrderStatus
      to: OrderStatus
      actorType: string
      at: Date
      reason?: string
    }
    const events: Ev[] = [{ to: "placed", actorType: "app", at: placedAt }]
    const delivered = (): Ev => ({
      from: "out_for_delivery",
      to: "delivered",
      actorType: "app",
      at: at(deliveredAfter),
    })
    if (status === "delivered")
      events.push({ from: "placed", to: "accepted", actorType: "app", at: at(3) }, delivered())
    else if (status === "cancelled") {
      // Half are turned down by the vendor straight away; the rest are cancelled later.
      const early = rand() < 0.5
      events.push({
        from: early ? "placed" : "accepted",
        to: "cancelled",
        actorType: early ? "app" : "member",
        at: at(early ? 6 : 18),
        reason:
          o.reason ??
          (early
            ? `${business === "food" ? "Restaurant" : "Seller"} could not accept the order`
            : "Customer cancelled before dispatch"),
      })
    } else if (status === "refund_requested" || status === "refunded") {
      events.push({ from: "placed", to: "accepted", actorType: "app", at: at(3) }, delivered(), {
        from: "delivered",
        to: "refund_requested",
        actorType: "app",
        at: at(deliveredAfter + 20),
        reason: o.reason ?? "Customer requested a refund",
      })
      if (status === "refunded")
        events.push({
          from: "refund_requested",
          to: "refunded",
          actorType: "member",
          at: at(deliveredAfter + 180),
          reason: "Refund approved",
        })
    } else if (status !== "placed")
      events.push({
        from: "placed",
        to: status,
        actorType: "app",
        at: at(Math.min(o.ageMinutes * 0.6, 20)),
      })

    const data: Prisma.OrderCreateInput = {
      code: o.code,
      business,
      status,
      customerName: o.customer,
      customerPhone: `+9199${String(40000000 + n * 7919).slice(0, 8)}`,
      vendor: { connect: { id: vendor.id } },
      zone: { connect: { id: vendor.zoneId } },
      ...(partner && { partner: { connect: { id: partner.id } } }),
      paymentMethod: method,
      paymentStatus:
        status === "cancelled"
          ? "failed"
          : status === "refunded"
            ? "refunded"
            : method === "cod" && status !== "delivered"
              ? "pending"
              : "paid",
      itemsTotalPaise: itemsTotal,
      deliveryFeePaise: fee,
      totalPaise: itemsTotal + fee,
      placedAt,
      items: { create: items },
      events: { create: events },
    }
    await prisma.order.create({ data })
  }

  const live = vendors.filter((v) => v.status === "active")
  const chennaiZones = new Set(chennai)
  // Hand-picked cases go to Chennai vendors so the demo admins (Chennai zones) see them.
  const localLive = (b: Business) =>
    live.filter((v) => v.business === b && chennaiZones.has(v.zoneId))
  const byName = (name: string) => vendors.find((v) => v.name === name)!
  const plans: Plan[] = []
  const codes = { food: 88219, mart: 46093 }
  const nextCode = (b: Business) => (b === "food" ? `ZOF-${codes.food--}` : `GLM-${codes.mart--}`)
  const add = (p: Omit<Plan, "code" | "method" | "customer"> & Partial<Plan>) =>
    plans.push({
      code: nextCode(p.business),
      method: pick(["upi", "upi", "card", "cod"] as const),
      customer: pick(customers),
      ...p,
    })

  // The prototype's five orders, kept recent so their statuses still make sense.
  add({
    business: "food",
    customer: "Ananya S.",
    vendor: byName("Saffron Table"),
    status: "out_for_delivery",
    method: "upi",
    ageMinutes: 28,
    totalRupees: 1240,
  })
  add({
    business: "mart",
    customer: "Siddharth M.",
    vendor: byName("Meenakshi Mart"),
    status: "out_for_delivery",
    method: "upi",
    ageMinutes: 150,
    totalRupees: 3890,
  })
  add({
    business: "food",
    customer: "Tanya R.",
    vendor: byName("The Wok District"),
    status: "preparing",
    method: "cod",
    ageMinutes: 12,
    totalRupees: 860,
  })
  add({
    business: "mart",
    customer: "Kunal A.",
    vendor: byName("Meenakshi Mart"),
    status: "packed",
    method: "card",
    ageMinutes: 70,
    totalRupees: 6490,
  })
  add({
    business: "food",
    customer: "Isha P.",
    vendor: byName("Madras Pantry"),
    status: "refund_requested",
    method: "upi",
    ageMinutes: 190,
    totalRupees: 720,
    reason: "Order arrived 35 minutes late and the food was cold",
  })

  // Six refund complaints per business, each a different problem (food's first is above).
  const complaints: Record<Business, string[]> = {
    food: [
      "Missing item: Gulab Jamun (2) was not in the bag",
      "Wrong item delivered: received Veg Fried Rice instead of Chicken Biryani",
      "Food spilled in transit; the container lid was broken",
      "Delivered to the wrong address; partner left it with a neighbour",
      "Charged twice for the same order on UPI",
    ],
    mart: [
      "Parcel arrived damaged: Stainless Steel Kadai is dented",
      "Missing item: Toor Dal 1 kg not in the box",
      "Wrong size: Bedsheet Set is single, ordered double",
      "Sunflower Oil 1 L is past its best-before date",
      "Marked delivered but never received",
      "Seal broken on Detergent 2 kg; powder leaked into the box",
    ],
  }
  for (const b of ["food", "mart"] as const) {
    const local = localLive(b)
    for (const reason of complaints[b])
      add({
        business: b,
        vendor: pick(local),
        status: "refund_requested",
        ageMinutes: between(sla[b] * 2, 36 * 60),
        reason,
      })
    // Live work: a steady line of orders inside the time limit.
    for (let i = 0; i < 7; i++) {
      const age = between(2, sla[b] * 0.72)
      add({ business: b, vendor: pick(local), status: progressFor(b, age), ageMinutes: age })
    }
    // Close to the time limit, and past it.
    for (let i = 0; i < 2; i++)
      add({
        business: b,
        vendor: pick(local),
        status: b === "food" ? "picked_up" : "assigned",
        ageMinutes: between(sla[b] * 0.78, sla[b] * 0.97),
      })
    for (let i = 0; i < 3; i++)
      add({
        business: b,
        vendor: pick(local),
        status: pick(steps[b].slice(1)),
        ageMinutes: between(sla[b] + 8, sla[b] + (b === "food" ? 40 : 120)),
      })
  }
  // Everything else: about 40% today, the rest over the previous six days. They're finished
  // unless they're still well inside their time limit.
  const GENERATED = 150
  for (let i = 0; i < GENERATED; i++) {
    const vendor = pick(live)
    const b = vendor.business
    const age =
      rand() < 0.4 ? between(1, minutesToday) : between(minutesToday, minutesToday + 6 * 1440)
    const inside = age < sla[b] * 0.75
    add({
      business: b,
      vendor,
      status: inside ? progressFor(b, age) : finishedFor(),
      ageMinutes: age,
    })
  }
  // About two months of finished orders before that, so payouts, the ledger and monthly
  // reports have history: four to eight a day, mostly delivered.
  for (let d = 8; d <= 70; d++) {
    const count = between(4, 9)
    for (let i = 0; i < count; i++) {
      const vendor = pick(live)
      add({
        business: vendor.business,
        vendor,
        status: finishedFor(),
        ageMinutes: d * 1440 + between(0, 1380),
      })
    }
  }
  for (const p of plans) await createOrder(p)

  // ---- complaints: one per refund request in the demo zones, at different stages ----
  const people = {
    ananya: { id: members["admin@gokart.in"]!, name: "Ananya Kapoor" },
    priya: { id: members["priya.shankar@gokart.in"]!, name: "Priya Shankar" },
    arjun: { id: superId, name: "Arjun Menon" },
  }
  const categoryOf = (reason: string) =>
    /late|cold/i.test(reason)
      ? "late_delivery"
      : /missing/i.test(reason)
        ? "missing_item"
        : /wrong/i.test(reason)
          ? "wrong_item"
          : /damaged|dented|spilled|seal|leak/i.test(reason)
            ? "damaged"
            : /best-before|expired|quality/i.test(reason)
              ? "quality"
              : /never received|wrong address/i.test(reason)
                ? "not_delivered"
                : /charged|upi|payment/i.test(reason)
                  ? "payment"
                  : "quality"
  const evidenceFor: Record<string, string[]> = {
    late_delivery: ["Delivery timeline from the app", "Photo of the cold food"],
    missing_item: ["Photo of the bag contents", "Copy of the bill"],
    wrong_item: ["Photo of the item received"],
    damaged: ["3 photos of the parcel", "Unboxing video (42 s)"],
    quality: ["Photo of the label showing the date"],
    not_delivered: ["Partner's delivery photo", "Customer's call recording note"],
    payment: ["UPI statement screenshot (2 debits)"],
  }
  // Six stages per business so every filter and action has something to show.
  const stages = [
    { status: "open", priority: "urgent", assignee: null },
    { status: "open", priority: "medium", assignee: null },
    { status: "in_review", priority: "high", assignee: "ananya" },
    { status: "in_review", priority: "medium", assignee: "priya" },
    { status: "escalated", priority: "high", assignee: "ananya" },
    { status: "resolved", priority: "low", assignee: "ananya" },
  ] as const
  let complaintNo = 2041
  for (const b of ["food", "mart"] as const) {
    const refunds = await prisma.order.findMany({
      where: { business: b, status: "refund_requested", zoneId: { in: chennai } },
      include: {
        vendor: { select: { name: true } },
        events: { where: { reason: { not: null } }, orderBy: { at: "desc" }, take: 1 },
      },
      orderBy: { placedAt: "desc" },
      take: stages.length,
    })
    for (const [i, o] of refunds.entries()) {
      const stage = stages[i]!
      const reason = o.events[0]?.reason ?? "Customer requested a refund"
      const category = categoryOf(reason)
      const who = stage.assignee
        ? b === "mart" && stage.assignee === "priya"
          ? people.arjun
          : people[stage.assignee]
        : null
      const raised = new Date(o.placedAt.getTime() + 75 * 60_000)
      const later = (min: number) => new Date(Math.min(now, raised.getTime() + min * 60_000))
      const notes: {
        kind: string
        authorName: string
        authorId?: string
        body: string
        at: Date
      }[] = [{ kind: "created", authorName: "Customer app", body: reason, at: raised }]
      if (who)
        notes.push({
          kind: "assigned",
          authorName: people.ananya.name,
          authorId: people.ananya.id,
          body: `Assigned to ${who.name}`,
          at: later(12),
        })
      if (stage.status !== "open" && who)
        notes.push({
          kind: "note",
          authorName: who.name,
          authorId: who.id,
          body:
            b === "food"
              ? `Called the customer and ${o.vendor.name}; waiting on the kitchen's packing log.`
              : `Asked ${o.vendor.name} for the packing photos and dispatch weight.`,
          at: later(40),
        })
      if (stage.status === "escalated")
        notes.push({
          kind: "escalated",
          authorName: people.ananya.name,
          authorId: people.ananya.id,
          body: "Refund is above the admin approval limit and the vendor disputes the claim.",
          at: later(90),
        })
      const resolution = `Refund of ${(o.totalPaise / 100).toLocaleString("en-IN")} rupees approved; ${o.vendor.name} warned about packing.`
      if (stage.status === "resolved")
        notes.push({
          kind: "resolved",
          authorName: people.ananya.name,
          authorId: people.ananya.id,
          body: resolution,
          at: later(150),
        })
      await prisma.complaint.create({
        data: {
          code: `CMP-${complaintNo++}`,
          business: b,
          zoneId: o.zoneId,
          orderId: o.id,
          orderCode: o.code,
          vendorName: o.vendor.name,
          category,
          priority: stage.priority,
          status: stage.status,
          customerName: o.customerName,
          summary: reason,
          details: `${o.customerName} reported this ${Math.round((raised.getTime() - o.placedAt.getTime()) / 60_000)} minutes after ordering. Order total ${(o.totalPaise / 100).toLocaleString("en-IN")} rupees, paid by ${o.paymentMethod.toUpperCase()}.`,
          evidence: evidenceFor[category] ?? [],
          claimPaise: o.totalPaise,
          assigneeId: who?.id ?? null,
          assigneeName: who?.name ?? null,
          escalatedAt: stage.status === "escalated" ? later(90) : null,
          resolvedAt: stage.status === "resolved" ? later(150) : null,
          resolution: stage.status === "resolved" ? resolution : null,
          createdAt: raised,
          notes: { create: notes },
        },
      })
    }
  }

  // ---- GLOARO MART products for the Chennai sellers ----
  const catalogue: [name: string, category: string, price: number][] = [
    ["Basmati Rice 5 kg", "Groceries", 640],
    ["Sunflower Oil 1 L", "Groceries", 165],
    ["Toor Dal 1 kg", "Groceries", 180],
    ["Detergent 2 kg", "Home care", 420],
    ["Stainless Steel Kadai", "Kitchen", 1290],
    ["Ceramic Cookware Set", "Kitchen", 2499],
    ["Bedsheet Set (Double)", "Home", 990],
    ["Cotton Towels (4)", "Home", 649],
    ["Wireless Keyboard", "Electronics", 1499],
    ["USB-C Charger 25 W", "Electronics", 899],
    ["Linen Co-ord Set", "Fashion", 2199],
    ["Kanchi Cotton Saree", "Fashion", 3450],
  ]
  const sellers = live.filter((v) => v.business === "mart" && chennaiZones.has(v.zoneId))
  // A few deliberately low or out of stock.
  const stockPlan = [42, 18, 6, 0, 25, 3, 31, 14, 8, 0, 22, 5]
  for (const [i, [name, category, price]] of catalogue.entries()) {
    const seller = sellers[i % sellers.length]!
    const prefix = seller.name.replace(/[^A-Z]/g, "").slice(0, 2) || "GM"
    await prisma.product.create({
      data: {
        sku: `${prefix}-${400 + i * 7}`,
        vendorId: seller.id,
        zoneId: seller.zoneId,
        name,
        category,
        pricePaise: rs(price),
        stock: stockPlan[i]!,
        lowStockThreshold: price > 1000 ? 5 : 10,
        status: i === 7 ? "paused" : "active",
      },
    })
  }

  // ---- stored notifications: a few recent updates for each demo account ----
  const notes = [
    {
      to: ["admin@gokart.in", "priya.shankar@gokart.in"],
      title: "Complaint assigned to you",
      body: "CMP-2043 · Wrong item — customer received the wrong dish.",
      link: "/admin/food/complaints?complaint=CMP-2043",
      ago: 12,
      read: false,
    },
    {
      to: ["superadmin@gokart.in"],
      title: "Complaint escalated",
      body: "CMP-2045 · Refund above the admin limit; vendor disputes the claim.",
      link: "/super/complaints?business=food&complaint=CMP-2045",
      ago: 25,
      read: false,
    },
    {
      to: ["admin@gokart.in"],
      title: "Techverse India is low on stock",
      body: "Wireless Keyboard and USB-C Charger need restocking.",
      link: "/admin/mart/inventory?stock=low",
      ago: 48,
      read: false,
    },
    {
      to: ["admin@gokart.in", "superadmin@gokart.in"],
      title: "Chettinad Spice Co. applied",
      body: "New restaurant waiting for review in Anna Nagar.",
      link: "/admin/food/vendors",
      ago: 95,
      read: true,
    },
    {
      to: ["admin@gokart.in", "priya.shankar@gokart.in"],
      title: "Daily operations report ready",
      body: "Yesterday's orders, delays and refunds for your zones.",
      link: "/admin/food/reports",
      ago: 600,
      read: true,
    },
  ]
  for (const n of notes)
    for (const email of n.to)
      await prisma.notification.create({
        data: {
          memberId: members[email]!,
          title: n.title,
          body: n.body,
          link:
            email === "superadmin@gokart.in"
              ? n.link.replace(/^\/admin\/(food|mart)\//, "/super/")
              : n.link,
          createdAt: new Date(now - n.ago * 60_000),
          readAt: n.read ? new Date(now - (n.ago - 5) * 60_000) : null,
        },
      })

  // ---- finance: plans, cash remittances, payouts at every stage, adjustments, requests ----
  // Uses the finance service itself, so seeded payouts match what the screens calculate.
  const arjun = { id: superId, name: "Arjun Menon", role: "super_admin", source: "seed" }
  await prisma.payPlanVersion.create({
    data: {
      accountType: "admin",
      accountId: members["admin@gokart.in"]!,
      effectiveFrom: new Date("2026-08-01"),
      plan: {
        salaryPaise: rs(52000),
        commissionPct: 1.5,
        targetOnTimePct: 90,
        incentivePaise: rs(10000),
      },
      reason: "Employment contract",
      createdById: superId,
    },
  })
  // A mid-cycle raise, so statements show "plan changed mid-cycle, accrued per day".
  const rahul = await prisma.partner.findUniqueOrThrow({ where: { code: "DP-2381" } })
  await prisma.payPlanVersion.create({
    data: {
      accountType: "partner",
      accountId: rahul.id,
      effectiveFrom: new Date(
        `${new Date(now - 10 * 86_400_000 + IST).toISOString().slice(0, 10)}T00:00:00Z`,
      ),
      plan: { salaryPaise: 0, fixedPaise: 0, perDeliveryPaise: rs(34), commissionPct: 0 },
      reason: "Raised for peak-hour coverage in T. Nagar",
      createdById: superId,
    },
  })

  const [older, previous] = finance.cycles()
  for (const [c, partial] of [
    [older!.cycle, false],
    [previous!.cycle, true],
  ] as const) {
    const ov = await finance.overview(c)
    let short = 0
    for (const p of ov.partners) {
      const owed = p.statement.outstandingPaise
      if (owed <= 0) continue
      // Two partners in the last closed month still hold some cash.
      const amount = partial && short < 2 ? Math.round(owed * 0.6) : owed
      if (partial && short < 2) short++
      await prisma.remittance.create({
        data: {
          partnerId: p.id,
          cycle: c,
          day: new Date(`${c}-${partial ? "28" : "25"}T00:00:00Z`),
          amountPaise: amount,
          method: pick(["Cash deposit", "UPI to GloAro", "Bank transfer"]),
          receivedBy: superId,
        },
      })
    }
    await finance.generate(c, arjun)
  }
  const stamp = (cycle: string, day: number) =>
    new Date(`${cycle}-${String(day).padStart(2, "0")}T10:30:00Z`)
  const nextMonth = (cycle: string) => {
    const [y, m] = cycle.split("-").map(Number) as [number, number]
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)
  }
  // Older month: approved, paid and settled.
  for (const p of await prisma.payout.findMany({ where: { cycle: older!.cycle } }))
    await prisma.payout.update({
      where: { id: p.id },
      data: {
        status: "settled",
        approvedById: superId,
        approvedAt: stamp(nextMonth(older!.cycle), 2),
        paidAt: stamp(nextMonth(older!.cycle), 4),
        paidMethod: "Bank transfer (NEFT)",
        paidRef: `UTR${String(482915000 + Math.floor(rand() * 99999))}`,
        settledAt: stamp(nextMonth(older!.cycle), 4),
      },
    })
  // Last month: some paid, some approved, the rest waiting (shown as overdue after the 5th).
  const prev = await prisma.payout.findMany({
    where: { cycle: previous!.cycle },
    orderBy: { code: "asc" },
  })
  for (const [i, p] of prev.entries()) {
    const stage =
      i % 4 === 0 ? "paid" : i % 4 === 1 ? "approved" : i % 4 === 2 ? "paid" : "pending_approval"
    if (stage === "pending_approval") continue
    await prisma.payout.update({
      where: { id: p.id },
      data: {
        status: stage,
        approvedById: superId,
        approvedAt: stamp(nextMonth(previous!.cycle), 2),
        ...(stage === "paid" && {
          paidAt: stamp(nextMonth(previous!.cycle), 4),
          paidMethod: pick(["Bank transfer (NEFT)", "Bank transfer (IMPS)", "UPI"]),
          paidRef: `UTR${String(482915000 + Math.floor(rand() * 99999))}`,
        }),
      },
    })
  }
  // Paid partner payouts with no cash left to remit are settled.
  const ovPrev = await finance.overview(previous!.cycle)
  for (const p of await prisma.payout.findMany({
    where: { cycle: previous!.cycle, status: "paid" },
  })) {
    const clear =
      p.accountType === "admin" ||
      (ovPrev.partners.find((x) => x.id === p.accountId)?.statement.outstandingPaise ?? 0) <= 0
    if (clear)
      await prisma.payout.update({
        where: { id: p.id },
        data: { status: "settled", settledAt: p.paidAt },
      })
  }
  for (const [action, summary] of [
    ["finance.payout_approved", `${previous!.label} payouts reviewed and approved in batches`],
    ["finance.payout_paid", `${previous!.label} payouts paid by NEFT / IMPS / UPI`],
    ["finance.payout_paid", `${older!.label} payouts paid and settled`],
  ] as const)
    await prisma.auditLog.create({
      data: {
        actorId: superId,
        actorName: "Arjun Menon",
        actorRole: "super_admin",
        action,
        entityType: "cycle",
        entityId: previous!.cycle,
        detail: { summary },
      },
    })

  // This month: a bonus and a deduction, and pay change requests from admins.
  const divya = await prisma.partner.findUniqueOrThrow({ where: { code: "DP-2387" } })
  const imran = await prisma.partner.findUniqueOrThrow({ where: { code: "DP-2380" } })
  await finance.adjust(
    {
      accountType: "partner",
      accountId: divya.id,
      kind: "bonus",
      amountPaise: rs(500),
      reason: "Festive peak-hour bonus",
    },
    arjun,
  )
  await finance.adjust(
    {
      accountType: "partner",
      accountId: imran.id,
      kind: "deduction",
      amountPaise: rs(200),
      reason: "Late return of COD cash",
    },
    arjun,
  )
  const priya = {
    id: members["priya.shankar@gokart.in"]!,
    name: "Priya Shankar",
    role: "admin",
    source: "seed",
  }
  await finance.requestChange(
    {
      accountType: "partner",
      accountId: divya.id,
      plan: { salaryPaise: 0, fixedPaise: 0, perDeliveryPaise: rs(35), commissionPct: 0 },
      reason: "Consistently above 95% on-time for two months",
    },
    priya,
    "admin",
  )
  await finance.requestChange(
    {
      accountType: "partner",
      accountId: imran.id,
      plan: { salaryPaise: rs(15000), fixedPaise: 0, perDeliveryPaise: rs(10), commissionPct: 0 },
      reason: "Annual revision for Velachery night shifts",
    },
    priya,
    "admin",
  )

  await prisma.auditLog.create({
    data: {
      actorName: SEED_ACTOR,
      action: "seed.loaded",
      entityType: "system",
      entityId: "seed",
      detail: { orders: plans.length },
    },
  })
  console.info(
    `Seeded ${Object.keys(zones).length} zones, ${memberSeed.length} members, ${vendors.length} vendors, ${partners.length + 1} partners, ${plans.length} orders.`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
