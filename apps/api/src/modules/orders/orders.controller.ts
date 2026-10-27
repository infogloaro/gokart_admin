import { ChangeOrderStatusRequest, OrderListQuery } from "@zoauro/shared"
import type { Request, Response } from "express"
import { parse } from "../../lib/errors"
import { actorOf, scope } from "../../middleware/auth"
import * as service from "./orders.service"

export async function list(req: Request, res: Response) {
  const q = parse(OrderListQuery, req.query)
  const s = scope(req, q.business)
  res.json(
    await service.list(
      { ...s, status: q.status, search: q.search, partnerId: q.partnerId },
      q.page,
      q.pageSize,
    ),
  )
}

export async function summary(req: Request, res: Response) {
  res.json(await service.summary(scope(req)))
}

export async function get(req: Request<{ id: string }>, res: Response) {
  res.json(await service.get(req.params.id, scope(req)))
}

export async function changeStatus(req: Request<{ id: string }>, res: Response) {
  const body = parse(ChangeOrderStatusRequest, req.body)
  res.json(await service.changeStatus(req.params.id, scope(req), body, actorOf(req)))
}
