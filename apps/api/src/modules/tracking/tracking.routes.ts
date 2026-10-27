import { timingSafeEqual } from "node:crypto"
import { Router, type RequestHandler } from "express"
import { intakeKey } from "../../config/env"
import { unauthorized } from "../../lib/errors"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./tracking.controller"

const expected = Buffer.from(intakeKey)

/** The partner app authenticates with a shared key, not a member session. */
const requireIntakeKey: RequestHandler = (req, _res, next) => {
  const got = Buffer.from(String(req.headers["x-intake-key"] ?? ""))
  if (got.length !== expected.length || !timingSafeEqual(got, expected))
    throw unauthorized("Missing or wrong intake key.")
  next()
}

export const intakeRoutes = Router()
  .use(requireIntakeKey)
  .post("/partners/:code/shift", c.shift)
  .post("/partners/:code/location", c.location)
  .post("/orders/:code/status", c.orderProgress)

export const trackingRoutes = Router()
  .use(requireAuth)
  .get("/zones", requirePermission("tracking.view"), c.zones)
  .get("/partners", requirePermission("tracking.view"), c.partners)
  .get("/partners/:id/trail", requirePermission("tracking.view"), c.trail)
  // Admins manage availability for partners in their zones; Super Admins for everyone.
  .post("/partners/:id/availability", requirePermission("partners.manage"), c.override)
