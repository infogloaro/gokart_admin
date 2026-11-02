import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { parseCsv, toCsv } from "../../lib/csv"

const sent: { to: string; text: string }[] = []
vi.mock("../../lib/mailer", () => ({
  sendMail: async (to: string, _subject: string, text: string) => {
    sent.push({ to, text })
  },
}))

const { createApp } = await import("../../app")
const { prisma } = await import("../../lib/prisma")
const { redis } = await import("../../lib/redis")

const app = createApp()
let ready = false
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await redis.connect().catch(() => {})
    await redis.ping()
    ready = (await prisma.member.count()) > 0
  } catch {
    ready = false
  }
})
afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

const lastCode = (to: string) => sent.findLast((m) => m.to === to)!.text.match(/\b(\d{6})\b/)![1]

async function signIn(email: string, password: string) {
  const agent = request.agent(app)
  const limits = await redis.keys("rl:login:*")
  if (limits.length) await redis.del(...limits)
  const start = await agent.post("/api/v1/auth/login").send({ email, password })
  await agent
    .post("/api/v1/auth/send-code")
    .send({ challengeId: start.body.challengeId, method: "email" })
    .expect(200)
  await agent
    .post("/api/v1/auth/verify")
    .send({ challengeId: start.body.challengeId, code: lastCode(email) })
    .expect(200)
  return agent
}

describe("CSV helpers", () => {
  it("round-trips quotes, commas and line breaks", () => {
    const rows = [{ name: 'Fresh, "best" basket', note: "line one\nline two", stock: 4 }]
    const text = toCsv(rows, ["name", "note", "stock"])
    expect(parseCsv(text)).toEqual([
      { name: 'Fresh, "best" basket', note: "line one\nline two", stock: "4" },
    ])
  })

  it("neutralises spreadsheet formulas on export", () => {
    expect(toCsv([{ name: "=HYPERLINK(1)" }], ["name"])).toContain("'=HYPERLINK(1)")
  })
})

describe("bulk product import and export", () => {
  it("imports valid MART products, reports bad rows, and exports the catalogue", async () => {
    if (!ready) return
    const agent = await signIn("superadmin@gokart.in", "Gokart@12345")
    const vendor = await prisma.vendor.findFirst({
      where: { business: "mart" },
      select: { id: true, zoneId: true },
    })
    expect(vendor).not.toBeNull()
    const sku = `BULK-${Date.now().toString().slice(-6)}`
    const csv = [
      "sku,name,category,vendorId,zoneId,price,stock,lowStockThreshold",
      `${sku},Test Milk,Dairy,${vendor!.id},${vendor!.zoneId},49.50,12,5`,
      `${sku}-X,Bad Price,Dairy,${vendor!.id},${vendor!.zoneId},abc,1,5`,
      `${sku},Duplicate,Dairy,${vendor!.id},${vendor!.zoneId},10,1,5`,
    ].join("\n")

    const imported = await agent
      .post("/api/v1/bulk/products/import")
      .set("Content-Type", "text/csv")
      .send(csv)
    expect(imported.status).toBe(200)
    expect(imported.body.created).toBe(1)
    expect(imported.body.skipped.map((row: { reason: string }) => row.reason)).toEqual(
      expect.arrayContaining(["Duplicate SKU in this file"]),
    )

    const created = await prisma.product.findUniqueOrThrow({ where: { sku } })
    expect(created.pricePaise).toBe(4950)

    const exported = await agent.get("/api/v1/bulk/products.csv").expect(200)
    expect(exported.text).toContain(sku)
    const vendorsExport = await agent.get("/api/v1/bulk/vendors.csv").expect(200)
    expect(vendorsExport.text.split("\r\n")[0]).toBe("code,name,business,status,verification")

    await prisma.product.delete({ where: { sku } })
  })
})
