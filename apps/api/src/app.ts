import cookieParser from "cookie-parser"
import express, { Router } from "express"
import helmet from "helmet"
import { errorHandler, notFound } from "./lib/errors"
import { prisma } from "./lib/prisma"
import { redis } from "./lib/redis"
import { authRoutes } from "./modules/auth/auth.routes"
import { dashboardRoutes, searchRoutes } from "./modules/dashboard/dashboard.routes"
import { auditRoutes } from "./modules/audit/audit"
import { complaintRoutes } from "./modules/complaints/complaints.routes"
import { inventoryRoutes } from "./modules/inventory/inventory"
import { memberRoutes } from "./modules/members/members"
import { notificationRoutes } from "./modules/notifications/notifications"
import { orderRoutes } from "./modules/orders/orders.routes"
import { partnerRoutes } from "./modules/partners/partners.routes"
import { settingsRoutes } from "./modules/settings/settings"
import { intakeRoutes, trackingRoutes } from "./modules/tracking/tracking.routes"
import { vendorRoutes } from "./modules/vendors/vendors.routes"
import { zoneRoutes } from "./modules/zones/zones"
// OpenAPI path registrations, one per module.
import "./modules/auth/auth.openapi"
import "./modules/complaints/complaints.openapi"
import "./modules/inventory/inventory.openapi"
import "./modules/dashboard/dashboard.openapi"
import "./modules/orders/orders.openapi"
import "./modules/partners/partners.openapi"
import "./modules/tracking/tracking.openapi"
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
  v1.use("/dashboard", dashboardRoutes)
  v1.use("/audit", auditRoutes)
  v1.use("/complaints", complaintRoutes)
  v1.use("/inventory", inventoryRoutes)
  v1.use("/notifications", notificationRoutes)
  v1.use("/members", memberRoutes)
  v1.use("/orders", orderRoutes)
  v1.use("/partners", partnerRoutes)
  v1.use("/intake", intakeRoutes)
  v1.use("/tracking", trackingRoutes)
  v1.use("/vendors", vendorRoutes)
  v1.use("/zones", zoneRoutes)
  v1.use("/settings", settingsRoutes)
  v1.use("/search", searchRoutes)
  v1.use(() => {
    throw notFound("Endpoint")
  })

  app.use("/api/v1", v1)
  app.use(errorHandler)
  return app
}
