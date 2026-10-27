import { afterAll, describe, expect, it } from "vitest"
import request from "supertest"

import { createApp } from "../src/app.js"
import { prisma } from "../src/lib/prisma.js"
import { redis } from "../src/lib/redis.js"

afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

describe("GET /health", () => {
  it("reports ok when postgres and redis are reachable", async () => {
    const response = await request(createApp()).get("/health")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: "ok", postgres: "ok", redis: "ok" })
  })
})
