// Small read-only module: a route, controller and repository in one file until it grows.
import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { currentMember, requireAuth } from "../../middleware/auth"
import { json, errors, registry } from "../../openapi/registry"
import { geographyOptions } from "../geography"

export const Zone = z.object({
  id: z.string(),
  district: z.string(),
  districtId: z.string(),
  city: z.string(),
  location: z.string(),
})

const listZones = (zoneIds: string[] | null) =>
  prisma.zone.findMany({
    where: { active: true, ...(zoneIds && { id: { in: zoneIds } }) },
    select: { id: true, district: true, districtId: true, city: true, location: true },
    orderBy: [{ district: "asc" }, { city: "asc" }, { location: "asc" }],
  })

async function list(req: Request, res: Response) {
  const m = currentMember(req)
  res.json(await listZones(m.role === "super_admin" ? null : m.zoneIds))
}

async function geography(req: Request, res: Response) {
  const m = currentMember(req)
  res.json(await geographyOptions(m.role === "super_admin" ? null : m.zoneIds))
}

export const zoneRoutes = Router().use(requireAuth).get("/", list).get("/geography", geography)

registry.registerPath({
  method: "get",
  path: "/zones",
  tags: ["Zones"],
  summary: "Service areas the member can see",
  responses: { 200: json(z.array(registry.register("Zone", Zone)), "Zones"), ...errors(401) },
})

registry.registerPath({
  method: "get",
  path: "/zones/geography",
  tags: ["Zones"],
  summary: "States and districts the member can filter Finance and Reports by",
  responses: {
    200: json(
      z.array(z.object({ state: z.string(), districts: z.array(z.string()) })),
      "States with their districts",
    ),
    ...errors(401),
  },
})
