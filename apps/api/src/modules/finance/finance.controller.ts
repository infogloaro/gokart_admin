import {
  AccountType,
  AdjustmentRequest,
  CycleQuery,
  DecideRequest,
  GeneratePayoutsRequest,
  NewPayChangeRequest,
  PayoutListQuery,
  PayoutVersionRequest,
  PayPayoutRequest,
  PlanChangeRequest,
  RejectPayoutRequest,
  RemittanceRequest,
  ReportPeriod,
} from "@zoauro/shared"
import type { Request, Response } from "express"
import { cycleOf } from "./rules"
import { parse } from "../../lib/errors"
import { actorOf, currentMember } from "../../middleware/auth"
import { GeoQuery, geoZoneIds } from "../geography"
import * as service from "./finance.service"
import { reconcile } from "./reconciliation"
import { z } from "zod"

type Id = Request<{ id: string }>
const cycleFrom = (req: Request) => parse(CycleQuery, req.query).cycle ?? cycleOf(service.today())

export const cycles = (_req: Request, res: Response) => void res.json(service.cycles())

/** Zones inside the State / District filter, or null when no filter is set. */
const geoOf = (req: Request) => geoZoneIds(parse(GeoQuery, req.query), null)

export async function overview(req: Request, res: Response) {
  res.json(await service.overview(cycleFrom(req), await geoOf(req)))
}

export async function account(req: Request<{ type: string; id: string }>, res: Response) {
  res.json(
    await service.account(parse(AccountType, req.params.type), req.params.id, cycleFrom(req)),
  )
}

export async function payouts(req: Request, res: Response) {
  res.json(await service.listPayouts(parse(PayoutListQuery, req.query), await geoOf(req)))
}

export async function payout(req: Id, res: Response) {
  res.json(await service.getPayout(req.params.id))
}

export async function generate(req: Request, res: Response) {
  const { cycle } = parse(GeneratePayoutsRequest, req.body)
  res.status(201).json(await service.generate(cycle, actorOf(req)))
}

export async function approve(req: Id, res: Response) {
  const { version } = parse(PayoutVersionRequest, req.body)
  res.json(await service.approve(req.params.id, version, actorOf(req)))
}

export async function reject(req: Id, res: Response) {
  const b = parse(RejectPayoutRequest, req.body)
  res.json(await service.reject(req.params.id, b.version, b.reason, actorOf(req)))
}

export async function pay(req: Id, res: Response) {
  res.json(await service.pay(req.params.id, parse(PayPayoutRequest, req.body), actorOf(req)))
}

export async function recalculate(req: Id, res: Response) {
  const { version } = parse(PayoutVersionRequest, req.body)
  res.json(await service.recalculate(req.params.id, version, actorOf(req)))
}

export async function remit(req: Request, res: Response) {
  await service.remit(parse(RemittanceRequest, req.body), actorOf(req))
  res.status(201).end()
}

export async function adjust(req: Request, res: Response) {
  await service.adjust(parse(AdjustmentRequest, req.body), actorOf(req))
  res.status(201).end()
}

export async function setPlan(req: Request<{ type: string; id: string }>, res: Response) {
  const b = parse(PlanChangeRequest, req.body)
  await service.setPlan(
    parse(AccountType, req.params.type),
    req.params.id,
    b.plan,
    b.reason,
    actorOf(req),
  )
  res.status(204).end()
}

export async function requests(_req: Request, res: Response) {
  res.json(await service.requests())
}

export async function requestChange(req: Request, res: Response) {
  await service.requestChange(
    parse(NewPayChangeRequest, req.body),
    actorOf(req),
    currentMember(req).role,
  )
  res.status(201).end()
}

export async function approveRequest(req: Id, res: Response) {
  await service.decide(
    req.params.id,
    true,
    parse(DecideRequest, req.body ?? {}).reason,
    actorOf(req),
  )
  res.status(204).end()
}

export async function rejectRequest(req: Id, res: Response) {
  await service.decide(
    req.params.id,
    false,
    parse(DecideRequest, req.body ?? {}).reason,
    actorOf(req),
  )
  res.status(204).end()
}

export async function movements(_req: Request, res: Response) {
  res.json(await service.movements())
}

export async function report(req: Request, res: Response) {
  res.json(
    await service.report(parse(ReportPeriod, req.query.period ?? "monthly"), await geoOf(req)),
  )
}

export async function auditTrail(_req: Request, res: Response) {
  res.json(await service.auditTrail())
}

export async function reconciliation(req: Request, res: Response) {
  const range = parse(
    z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }),
    req.query,
  )
  res.json(await reconcile(range))
}
