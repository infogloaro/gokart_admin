import {
  NotificationActivityReadList,
  NotificationActivityReadQuery,
  NotificationActivityReadRequest,
} from "@zoauro/shared"
import { errors, json, noContent, registry } from "../../openapi/registry"

const tags = ["Notifications"]

registry.registerPath({
  method: "get",
  path: "/notifications/activity-read",
  tags,
  summary: "List acknowledged pending activity items for the signed-in member",
  request: { query: NotificationActivityReadQuery },
  responses: { 200: json(NotificationActivityReadList), ...errors(400, 401) },
})
registry.registerPath({
  method: "post",
  path: "/notifications/activity-read",
  tags,
  summary: "Acknowledge one accessible pending activity item",
  request: { body: json(NotificationActivityReadRequest) },
  responses: { 204: noContent, ...errors(400, 401, 403, 404) },
})
