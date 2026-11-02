import {
  AssignComplaintRequest,
  ComplaintListQuery,
  ComplaintNoteRequest,
  EscalateComplaintRequest,
  ReopenComplaintRequest,
  ResolveComplaintRequest,
} from "@zoauro/shared"
import type { Request, Response } from "express"
import { parse } from "../../lib/errors"
import { actorOf, currentMember, scope } from "../../middleware/auth"
import * as service from "./complaints.service"

type Id = Request<{ id: string }>

export async function list(req: Request, res: Response) {
  const q = parse(ComplaintListQuery, req.query)
  const assigneeId =
    q.assignee === "me" ? currentMember(req).id : q.assignee === "none" ? null : undefined
  res.json(
    await service.list(
      {
        ...scope(req, q.business),
        status: q.status,
        priority: q.priority,
        assigneeId,
        search: q.search || undefined,
      },
      q.page,
      q.pageSize,
    ),
  )
}

export async function summary(req: Request, res: Response) {
  const business =
    req.query.business === "food" || req.query.business === "mart" ? req.query.business : undefined
  res.json(await service.summary(scope(req, business)))
}

export async function get(req: Id, res: Response) {
  res.json(await service.get(req.params.id, scope(req)))
}

export async function assignees(req: Id, res: Response) {
  res.json(await service.assignees(req.params.id, scope(req)))
}

export async function assign(req: Id, res: Response) {
  const body = parse(AssignComplaintRequest, req.body)
  res.json(await service.assign(req.params.id, scope(req), body, actorOf(req)))
}

export async function escalate(req: Id, res: Response) {
  const body = parse(EscalateComplaintRequest, req.body)
  res.json(await service.escalate(req.params.id, scope(req), body, actorOf(req)))
}

export async function resolve(req: Id, res: Response) {
  const body = parse(ResolveComplaintRequest, req.body)
  res.json(await service.resolve(req.params.id, scope(req), body, actorOf(req)))
}

export async function reopen(req: Id, res: Response) {
  const body = parse(ReopenComplaintRequest, req.body)
  res.json(await service.reopen(req.params.id, scope(req), body, actorOf(req)))
}

export async function note(req: Id, res: Response) {
  const body = parse(ComplaintNoteRequest, req.body)
  res.json(await service.note(req.params.id, scope(req), body.body, actorOf(req)))
}

export async function suggestions(req: Id, res: Response) {
  res.json(await service.suggestions(req.params.id, scope(req)))
}
