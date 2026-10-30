// Adds one test record so you can watch it appear in the admin notification bell.
// Usage: pnpm --filter api exec tsx scripts/add-test-event.ts <order|vendor|partner|complaint> [workspace-slug]
import { PrismaClient } from "../src/generated/client/index.js"

const prisma = new PrismaClient()

const kind = process.argv[2]
const slug = process.argv[3] ?? "gloaro-mart"
const stamp = Date.now().toString().slice(-6)

async function main() {
  const workspace = await prisma.workspace.findFirst({ where: { slug } })
  if (!workspace) {
    throw new Error(`Workspace "${slug}" not found`)
  }

  if (kind === "order") {
    const vendor = await prisma.vendor.findFirst({ where: { workspaceId: workspace.id } })
    const order = await prisma.order.create({
      data: {
        workspaceId: workspace.id,
        orderNumber: `TEST-${stamp}`,
        customerName: "Test Customer",
        vendorId: vendor?.id ?? null,
        grossValue: 1500,
        platformRevenue: 250,
        commissionAmount: 180,
        deliveryFeeAmount: 70,
      },
    })
    console.log(`Created order ${order.orderNumber} in ${workspace.name}`)
  } else if (kind === "vendor") {
    const vendor = await prisma.vendor.create({
      data: { workspaceId: workspace.id, name: `Test Vendor ${stamp}` },
    })
    console.log(`Created pending vendor "${vendor.name}" in ${workspace.name}`)
  } else if (kind === "partner") {
    const partner = await prisma.deliveryPartner.create({
      data: { workspaceId: workspace.id, name: `Test Partner ${stamp}` },
    })
    console.log(`Created delivery partner "${partner.name}" in ${workspace.name}`)
  } else if (kind === "complaint") {
    const complaint = await prisma.complaint.create({
      data: { workspaceId: workspace.id, title: `Test complaint ${stamp}: late delivery` },
    })
    console.log(`Created complaint "${complaint.title}" in ${workspace.name}`)
  } else {
    throw new Error("First argument must be one of: order, vendor, partner, complaint")
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
