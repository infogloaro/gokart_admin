import { Router } from "express"
import { requireAuth, requirePermission } from "../../middleware/auth"
import * as c from "./complaints.controller"

const view = requirePermission("complaints.view")
const manage = requirePermission("complaints.manage")

export const complaintRoutes = Router()
  .use(requireAuth)
  .get("/", view, c.list)
  .get("/summary", view, c.summary)
  .get("/:id", view, c.get)
  .get("/:id/assignees", manage, c.assignees)
  .get("/:id/suggestions", view, c.suggestions)
  .get("/:id/suggested-assignee", manage, c.suggestAssignee)
  .post("/:id/assign", manage, c.assign)
  .post("/:id/escalate", manage, c.escalate)
  .post("/:id/resolve", manage, c.resolve)
  .post("/:id/reopen", manage, c.reopen)
  .post("/:id/notes", manage, c.note)
