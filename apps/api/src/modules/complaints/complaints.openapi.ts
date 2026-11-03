import {
  AssignComplaintRequest,
  Assignee,
  Business,
  Complaint,
  ComplaintDetail,
  ComplaintListQuery,
  ComplaintNoteRequest,
  ComplaintSummary,
  EscalateComplaintRequest,
  paged,
  ReopenComplaintRequest,
  ResolveComplaintRequest,
} from "@zoauro/shared"
import { z } from "zod"
import { errors, json, registry } from "../../openapi/registry"

const tags = ["Complaints"]
const id = z.object({ id: z.string() })
const DetailRef = registry.register("ComplaintDetail", ComplaintDetail)

registry.registerPath({
  method: "get",
  path: "/complaints",
  tags,
  summary: "Complaints in the member's businesses and zones (open work unless a status is given)",
  request: { query: ComplaintListQuery },
  responses: {
    200: json(paged(registry.register("Complaint", Complaint)), "A page of complaints"),
    ...errors(400, 401, 403),
  },
})
registry.registerPath({
  method: "get",
  path: "/complaints/summary",
  tags,
  summary: "Counts by status, urgent and unassigned",
  request: { query: z.object({ business: Business.optional() }) },
  responses: { 200: json(ComplaintSummary, "Counts"), ...errors(401, 403) },
})
registry.registerPath({
  method: "get",
  path: "/complaints/{id}",
  tags,
  summary: "One complaint with its history",
  request: { params: id },
  responses: { 200: json(DetailRef, "The complaint"), ...errors(401, 403, 404) },
})
registry.registerPath({
  method: "get",
  path: "/complaints/{id}/assignees",
  tags,
  summary: "Members who can work this complaint",
  request: { params: id },
  responses: { 200: json(z.array(Assignee), "Members"), ...errors(401, 403, 404) },
})

const action = (path: string, summary: string, body: z.ZodType) =>
  registry.registerPath({
    method: "post",
    path: `/complaints/{id}/${path}`,
    tags,
    summary,
    request: { params: id, body: { content: { "application/json": { schema: body } } } },
    responses: {
      200: json(DetailRef, "The updated complaint"),
      ...errors(400, 401, 403, 404, 409),
    },
  })
action(
  "assign",
  "Assign or unassign (version-checked, audited, notifies the assignee)",
  AssignComplaintRequest,
)
action("escalate", "Escalate to the Super Admin (notifies Super Admins)", EscalateComplaintRequest)
action("resolve", "Resolve with a resolution note", ResolveComplaintRequest)
action("reopen", "Reopen a resolved complaint", ReopenComplaintRequest)
action("notes", "Add an internal note", ComplaintNoteRequest)

registry.registerPath({
  method: "get",
  path: "/complaints/{id}/suggestions",
  tags: ["Complaints"],
  summary: "Suggested priority, reasons, and reply wording (suggestions only)",
  request: { params: id },
  responses: {
    200: json(
      z.object({
        priority: z.enum(["low", "medium", "high", "urgent"]),
        reasons: z.array(z.string()),
        replies: z.array(z.object({ title: z.string(), body: z.string() })),
      }),
      "Suggested handling",
    ),
    ...errors(401, 403, 404),
  },
})

registry.registerPath({
  method: "get",
  path: "/complaints/{id}/suggested-assignee",
  tags: ["Complaints"],
  summary: "Who should take this complaint: the eligible person with the fewest open complaints",
  request: { params: id },
  responses: {
    200: json(
      z.object({
        suggested: z
          .object({ id: z.string(), name: z.string(), openCount: z.number().int() })
          .nullable(),
        candidates: z.array(
          z.object({ id: z.string(), name: z.string(), openCount: z.number().int() }),
        ),
      }),
      "Suggested assignee",
    ),
    ...errors(401, 403, 404),
  },
})
