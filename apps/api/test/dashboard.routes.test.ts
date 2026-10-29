import express from "express"
import request from "supertest"
import { describe, expect, it, vi } from "vitest"

import { createDashboardRouter } from "../src/modules/dashboard/dashboard.routes.js"
import type { WorkspacePrincipal } from "../src/modules/dashboard/dashboard.types.js"

const workspace = { id: "ws-1", slug: "zoauro-food", name: "ZOAURO FOOD" }

function buildApp(
  options: {
    principal?: WorkspacePrincipal | null
    resolveAccessibleWorkspaceIds?: (principal: WorkspacePrincipal) => Promise<string[]>
  } = {},
) {
  const prisma = {
    workspace: {
      findMany: vi.fn().mockImplementation((args: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in
        if (ids) return Promise.resolve(ids.includes(workspace.id) ? [workspace] : [])
        return Promise.resolve([workspace])
      }),
    },
    order: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { grossValue: 0, platformRevenue: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    vendor: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    deliveryPartner: { count: vi.fn().mockResolvedValue(0) },
    complaint: { count: vi.fn().mockResolvedValue(0) },
    refundCase: {
      aggregate: vi.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: 0 } }),
    },
    partnerDocument: { count: vi.fn().mockResolvedValue(0) },
  } as unknown as Parameters<typeof createDashboardRouter>[0]["prisma"]

  const router = createDashboardRouter({
    prisma,
    requireAuth: (_req, _res, next) => next(),
    getPrincipal: () =>
      "principal" in options ? (options.principal ?? null) : { userId: "user-1" },
    resolveAccessibleWorkspaceIds: options.resolveAccessibleWorkspaceIds ?? (async () => ["ws-1"]),
  })

  const app = express()
  app.use(express.json())
  app.use("/workspaces", router)
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(err.status ?? 500).json({ error: { message: err.message ?? "Internal error" } })
    },
  )

  return { app }
}

describe("dashboard routes", () => {
  it("GET /workspaces/:workspaceId/dashboard returns live data for an accessible workspace", async () => {
    const { app } = buildApp()

    const response = await request(app).get(
      "/workspaces/zoauro-food/dashboard?start=2026-06-01&end=2026-06-18",
    )

    expect(response.status).toBe(200)
    expect(response.body.data).toHaveProperty("metrics")
    expect(response.body.data).toHaveProperty("trend")
    expect(response.body.data).toHaveProperty("orderDistribution")
    expect(response.body.data).toHaveProperty("transactions")
    expect(response.body.data).toHaveProperty("attention")
  })

  it("GET /workspaces/:workspaceId/overview returns 401 without a principal", async () => {
    const { app } = buildApp({ principal: null })

    const response = await request(app).get("/workspaces/zoauro-food/overview")

    expect(response.status).toBe(401)
  })

  it("returns 400 when start is after end", async () => {
    const { app } = buildApp()

    const response = await request(app).get(
      "/workspaces/zoauro-food/dashboard?start=2026-06-18&end=2026-06-01",
    )

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: { message: "start must be on or before end" } })
  })

  it("returns 400 for an invalid date", async () => {
    const { app } = buildApp()

    const response = await request(app).get(
      "/workspaces/zoauro-food/dashboard?start=not-a-date&end=2026-06-18",
    )

    expect(response.status).toBe(400)
  })

  it("returns 404 for a workspace the principal cannot access", async () => {
    const { app } = buildApp({ resolveAccessibleWorkspaceIds: async () => ["ws-2"] })

    const response = await request(app).get("/workspaces/zoauro-food/overview")

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: { message: "Workspace not found or access denied" } })
  })

  it("GET /workspaces/all/dashboard aggregates every accessible workspace", async () => {
    const { app } = buildApp()

    const response = await request(app).get("/workspaces/all/dashboard")

    expect(response.status).toBe(200)
    expect(response.body.data.trend.series).toHaveLength(1)
  })
})
