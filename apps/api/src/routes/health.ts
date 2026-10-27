import { Router } from "express"

import { prisma } from "../lib/prisma.js"
import { redis } from "../lib/redis.js"

export const healthRouter = Router()

healthRouter.get("/", async (_req, res) => {
  const [postgres, redis_] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => "ok" as const).catch(() => "down" as const),
    redis
      .ping()
      .then(() => "ok" as const)
      .catch(() => "down" as const),
  ])

  const status = postgres === "ok" && redis_ === "ok" ? "ok" : "degraded"
  res.status(status === "ok" ? 200 : 503).json({ status, postgres, redis: redis_ })
})
