import { DashboardQuery, RevenueQuery, SearchQuery } from "@zoauro/shared"
import type { Request, Response } from "express"
import { parse } from "../../lib/errors"
import { currentMember, scope } from "../../middleware/auth"
import * as service from "./dashboard.service"

export async function overview(req: Request, res: Response) {
  const q = parse(DashboardQuery, req.query)
  res.json(await service.overview(scope(req, q.business), q.range))
}

export async function health(req: Request, res: Response) {
  const q = parse(DashboardQuery, req.query)
  res.json(await service.health(scope(req, q.business), q.range))
}

export async function revenue(req: Request, res: Response) {
  const q = parse(RevenueQuery, req.query)
  res.json(await service.revenue(scope(req, q.business), q.business, q.range))
}

export async function search(req: Request, res: Response) {
  const { q } = parse(SearchQuery, req.query)
  const can = currentMember(req).permissions
  res.json(
    await service.search(scope(req), q, {
      orders: can.includes("orders.view"),
      vendors: can.includes("vendors.view"),
      partners: can.includes("partners.view"),
    }),
  )
}
