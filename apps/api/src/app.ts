import cookieParser from "cookie-parser"
import express, { Router } from "express"
import helmet from "helmet"
import { errorHandler, notFound } from "./lib/errors"
import { prisma } from "./lib/prisma"
import { redis } from "./lib/redis"
import { authRoutes } from "./modules/auth/auth.routes"
import { orderRoutes } from "./modules/orders/orders.routes"
import { partnerRoutes } from "./modules/partners/partners.routes"
import { vendorRoutes } from "./modules/vendors/vendors.routes"
import { zoneRoutes } from "./modules/zones/zones"
// OpenAPI path registrations, one per module.
import "./modules/auth/auth.openapi"
import "./modules/orders/orders.openapi"
import "./modules/partners/partners.openapi"
import "./modules/vendors/vendors.openapi"

export function createApp() {
  const app = express()
  // The web app proxies /api to us, and Nginx will sit in front in production.
  app.set("trust proxy", 1)
  app.disable("x-powered-by")
  app.use(helmet())
  app.use(express.json({ limit: "1mb" }))
  app.use(cookieParser())

  const v1 = Router()
  v1.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    await redis.ping()
    res.json({ ok: true })
  })
  v1.use("/auth", authRoutes)
  v1.use("/orders", orderRoutes)
  v1.use("/partners", partnerRoutes)
  v1.use("/vendors", vendorRoutes)
  v1.use("/zones", zoneRoutes)
  v1.use(() => {
    throw notFound("Endpoint")
  })

  app.use("/api/v1", v1)
  app.use(errorHandler)
  return app
}
