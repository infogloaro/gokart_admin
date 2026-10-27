import {
  CreatePartnerRequest,
  PartnerDecisionRequest,
  PartnerListQuery,
  UpdatePartnerRequest,
} from "@zoauro/shared"
import type { Request, Response } from "express"
import { parse } from "../../lib/errors"
import { actorOf, scope } from "../../middleware/auth"
import * as service from "./partners.service"

export async function list(req: Request, res: Response) {
  const q = parse(PartnerListQuery, req.query)
  const s = scope(req, q.business)
  res.json(
    await service.list(
      { ...s, status: q.status, availability: q.availability, search: q.search },
      q.page,
      q.pageSize,
      q.sort,
    ),
  )
}

export async function summary(req: Request, res: Response) {
  const q = parse(PartnerListQuery.pick({ business: true }), req.query)
  res.json(await service.summary(scope(req, q.business)))
}

export async function get(req: Request<{ id: string }>, res: Response) {
  res.json(await service.get(req.params.id, scope(req)))
}

export async function create(req: Request, res: Response) {
  const body = parse(CreatePartnerRequest, req.body)
  res.status(201).json(await service.create(body, scope(req), actorOf(req)))
}

export async function decide(req: Request<{ id: string }>, res: Response) {
  const body = parse(PartnerDecisionRequest, req.body)
  res.json(await service.decide(req.params.id, scope(req), body, actorOf(req)))
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const body = parse(UpdatePartnerRequest, req.body)
  res.json(await service.update(req.params.id, scope(req), body, actorOf(req)))
}
