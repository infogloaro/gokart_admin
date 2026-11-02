import {
  AssignPartnerRequest,
  ChangeOrderStatusRequest,
  OrderFilterOptionsQuery,
  OrderListQuery,
} from "@zoauro/shared"
import type { Request, Response } from "express"
import { parse } from "../../lib/errors"
import { actorOf, currentMember, scope } from "../../middleware/auth"
import { z } from "zod"
import * as service from "./orders.service"

export async function list(req: Request, res: Response) {
  const q = parse(OrderListQuery, req.query)
  const s = scope(req, q.business)
  res.json(
    await service.list(
      {
        ...s,
        status: q.status,
        search: q.search,
        districtId: q.districtId,
        zoneId: q.zoneId,
        adminId: q.adminId,
        deliveryFleetId: q.deliveryFleetId,
        deliveryPartnerId: q.deliveryPartnerId,
        deliveryBoyId: q.deliveryBoyId,
        partnerId: q.partnerId,
        vendorId: q.vendorId,
        delayed: q.delayed,
        fromDate: q.fromDate,
        toDate: q.toDate,
      },
      q.page,
      q.pageSize,
    ),
  )
}

export async function summary(req: Request, res: Response) {
  res.json(await service.summary(scope(req)))
}

export async function filterOptions(req: Request, res: Response) {
  const q = parse(OrderFilterOptionsQuery, req.query)
  res.json(await service.filterOptions(scope(req, q.business)))
}

export async function get(req: Request<{ id: string }>, res: Response) {
  res.json(await service.get(req.params.id, scope(req)))
}

export async function changeStatus(req: Request<{ id: string }>, res: Response) {
  const body = parse(ChangeOrderStatusRequest, req.body)
  res.json(await service.changeStatus(req.params.id, scope(req), body, actorOf(req)))
}

export async function candidates(req: Request<{ id: string }>, res: Response) {
  res.json(await service.candidates(req.params.id, scope(req)))
}

export async function assign(req: Request<{ id: string }>, res: Response) {
  const body = parse(AssignPartnerRequest, req.body)
  res.json(await service.assign(req.params.id, scope(req), body, actorOf(req)))
}

export async function assignBoy(req: Request<{ id: string }>, res: Response) {
  const body = parse(z.object({ boyId: z.string().min(1), version: z.number().int() }), req.body)
  res.json(await service.assignBoy(req.params.id, scope(req), body, actorOf(req)))
}

export async function autoAssignBoy(req: Request<{ id: string }>, res: Response) {
  const member = currentMember(req)
  res.json(await service.autoAssignBoy(req.params.id, scope(req), member, actorOf(req)))
}
