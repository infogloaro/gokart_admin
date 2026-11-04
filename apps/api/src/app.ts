import cookieParser from "cookie-parser"
import express, { Router } from "express"
import helmet from "helmet"
import { errorHandler, notFound } from "./lib/errors"
import { prisma } from "./lib/prisma"
import { redis } from "./lib/redis"
import { authRoutes } from "./modules/auth/auth.routes"
import { dashboardRoutes, searchRoutes } from "./modules/dashboard/dashboard.routes"
import { deliveryRoutes } from "./modules/delivery/delivery.routes"
import { riderOpsRoutes } from "./modules/rider-ops/rider-ops.routes"
import { auditRoutes } from "./modules/audit/audit"
import { complaintRoutes } from "./modules/complaints/complaints.routes"
import { financeRoutes } from "./modules/finance/finance.routes"
import { alertRoutes } from "./modules/alerts/alerts.routes"
import { bulkRoutes } from "./modules/bulk/bulk"
import { inventoryRoutes } from "./modules/inventory/inventory"
import { ledgerRoutes } from "./modules/ledger/ledger.routes"
import { memberRoutes } from "./modules/members/members"
import { notificationRoutes } from "./modules/notifications/notifications"
import { orderRoutes } from "./modules/orders/orders.routes"
import { partnerRoutes } from "./modules/partners/partners.routes"
import { reportRoutes } from "./modules/reports/reports"
import { settingsRoutes } from "./modules/settings/settings"
import { intakeRoutes, trackingRoutes } from "./modules/tracking/tracking.routes"
import { vendorRoutes } from "./modules/vendors/vendors.routes"
import { zoneRoutes } from "./modules/zones/zones"
// OpenAPI path registrations, one per module.
import "./modules/auth/auth.openapi"
import "./modules/complaints/complaints.openapi"
import "./modules/finance/finance.openapi"
import "./modules/alerts/alerts.openapi"
import "./modules/inventory/inventory.openapi"
import "./modules/ledger/ledger.openapi"
import "./modules/dashboard/dashboard.openapi"
import "./modules/delivery/delivery.openapi"
import "./modules/rider-ops/rider-ops.openapi"
import "./modules/orders/orders.openapi"
import "./modules/notifications/notifications.openapi"
import "./modules/partners/partners.openapi"
import "./modules/tracking/tracking.openapi"
import "./modules/vendors/vendors.openapi"

export function createApp() {
  const app = express()
  // The web app proxies /api to us, and Nginx will sit in front in production.
  app.set("trust proxy", 1)
  app.disable("x-powered-by")
  app.use(helmet())
  // Delivery proof photos are larger; that route sets its own limit.
  const jsonBody = express.json({ limit: "1mb" })
  app.use((req, res, next) => (/\/proof$/.test(req.path) ? next() : jsonBody(req, res, next)))
  app.use(cookieParser())

  const v1 = Router()
  v1.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    await redis.ping()
    res.json({ ok: true })
  })
  v1.use("/auth", authRoutes)
  v1.use("/dashboard", dashboardRoutes)
  v1.use("/delivery", deliveryRoutes)
  v1.use("/delivery", riderOpsRoutes)
  v1.use("/audit", auditRoutes)
  v1.use("/complaints", complaintRoutes)
  v1.use("/finance", financeRoutes)
  v1.use("/inventory", inventoryRoutes)
  v1.use("/bulk", bulkRoutes)
  v1.use("/alerts", alertRoutes)
  v1.use("/ledger", ledgerRoutes)
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
  v1.use("/reports", reportRoutes)
  v1.use(() => {
    throw notFound("Endpoint")
  })

  app.use("/api/v1", v1)
  app.use(errorHandler)
  return app
}
