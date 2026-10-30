import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPES } from "@zoauro/shared"
import express, { Router } from "express"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./vendors.controller"

export const vendorRoutes = Router()
  .use(requireAuth)
  .get("/", requirePermission("vendors.view"), c.list)
  .get("/summary", requirePermission("vendors.view"), c.summary)
  .get("/:id", requirePermission("vendors.view"), c.get)
  .post("/", requirePermission("vendors.manage"), c.create)
  // Editing a live vendor is a Super Admin action, like decisions.
  .patch("/:id", requirePermission("vendors.approve"), c.update)
  .post("/:id/decision", requirePermission("vendors.approve"), c.decide)
  // Documents: raw PDF / JPG / PNG bodies up to 10 MB, checked again in the service.
  .put(
    "/:id/documents/:kind",
    requirePermission("vendors.manage"),
    express.raw({ type: [...DOCUMENT_TYPES], limit: DOCUMENT_MAX_BYTES }),
    c.uploadDocument,
  )
  .get("/:id/documents/:docId/file", requirePermission("vendors.view"), c.documentFile)
  .post("/:id/documents/:docId/verify", requirePermission("vendors.approve"), c.verifyDocument)
