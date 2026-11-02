import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPES } from "@zoauro/shared"
import express, { Router } from "express"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./partners.controller"

export const partnerRoutes = Router()
  .use(requireAuth)
  .get("/", requirePermission("partners.view"), c.list)
  .get("/summary", requirePermission("partners.view"), c.summary)
  .get("/draft", requirePermission("partners.manage"), c.getDraft)
  .put("/draft", requirePermission("partners.manage"), c.saveDraft)
  .get("/:id", requirePermission("partners.view"), c.get)
  .post("/", requirePermission("partners.manage"), c.create)
  // Profile edits are a Super Admin action, like decisions.
  .patch("/:id", requirePermission("partners.approve"), c.update)
  .post("/:id/decision", requirePermission("partners.approve"), c.decide)
  // Documents: raw PDF / JPG / PNG bodies up to 10 MB, checked again in the service.
  .put(
    "/:id/documents/:kind",
    requirePermission("partners.manage"),
    express.raw({ type: [...DOCUMENT_TYPES], limit: DOCUMENT_MAX_BYTES }),
    c.uploadDocument,
  )
  .get("/:id/documents/:docId/file", requirePermission("partners.view"), c.documentFile)
  .post("/:id/documents/:docId/verify", requirePermission("partners.approve"), c.verifyDocument)
