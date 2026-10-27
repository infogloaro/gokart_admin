import {
  AvailabilityOverrideRequest,
  IntakeOrderStatusRequest,
  LocationPing,
  ShiftRequest,
  TrackingQuery,
  TrailQuery,
} from "@zoauro/shared"
import type { Request, Response } from "express"
import { parse } from "../../lib/errors"
import { actorOf, scope } from "../../middleware/auth"
import * as service from "./tracking.service"

// ---- intake ----

export async function shift(req: Request<{ code: string }>, res: Response) {
  const body = parse(ShiftRequest, req.body)
  res.json(await service.shift(req.params.code, body.action))
}

export async function location(req: Request<{ code: string }>, res: Response) {
  const body = parse(LocationPing, req.body)
  res.status(202).json(await service.recordLocation(req.params.code, body))
}

export async function orderProgress(req: Request<{ code: string }>, res: Response) {
  const body = parse(IntakeOrderStatusRequest, req.body)
  res.json(await service.orderProgress(req.params.code, body.partnerCode, body.to))
}

// ---- portals ----

export async function zones(req: Request, res: Response) {
  res.json(await service.zones(scope(req)))
}

export async function partners(req: Request, res: Response) {
  const q = parse(TrackingQuery, req.query)
  res.json(await service.partners(scope(req, q.business), q.zoneId))
}

export async function trail(req: Request<{ id: string }>, res: Response) {
  const q = parse(TrailQuery, req.query)
  res.json(await service.trail(req.params.id, scope(req), q.minutes))
}

export async function override(req: Request<{ id: string }>, res: Response) {
  const body = parse(AvailabilityOverrideRequest, req.body)
  res.json(await service.override(req.params.id, scope(req), body, actorOf(req)))
}
