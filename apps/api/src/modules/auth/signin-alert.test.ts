import { describe, expect, it } from "vitest"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"
import { recordSignIn } from "./auth.repository"

// A sign-in from a network the member has not used recently raises a security alert.
describe("new network sign-in alert", () => {
  it("alerts Super Admins when a member signs in from an unfamiliar network", async () => {
    let ready = true
    try {
      await prisma.$queryRaw`SELECT 1`
      await redis.ping()
    } catch {
      ready = false
    }
    if (!ready) return

    const member = await prisma.member.findUniqueOrThrow({
      where: { email: "ravi.chandran@gokart.in" },
    })
    const actor = {
      id: member.id,
      name: member.name,
      role: member.role,
      source: "api",
      ip: "127.0.0.1",
    }
    // Establish a known network first.
    await recordSignIn(actor, "email", "email")

    const newIp = `198.51.100.${Math.floor(Math.random() * 200) + 20}`
    await recordSignIn({ ...actor, ip: newIp }, "email", "email")

    const alert = await prisma.operationalAlert.findFirst({
      where: { kind: "security", body: { contains: newIp } },
    })
    expect(alert).not.toBeNull()
    expect(alert!.business).toBeNull()
    expect(alert!.title).toBe("Sign-in from a new network")
  })
})
