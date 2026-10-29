import express from "express"
import request from "supertest"
import { describe, expect, it, vi } from "vitest"

import { createLedgerRouter } from "../src/modules/ledger/ledger.routes.js"
import type { WorkspacePrincipal } from "../src/modules/ledger/ledger.types.js"

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
    transaction: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { grossAmount: 0, commissionAmount: 0, deliveryFeeAmount: 0, netAmount: 0 },
      }),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as Parameters<typeof createLedgerRouter>[0]["prisma"]

  const router = createLedgerRouter({
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

describe("ledger routes", () => {
  it("GET /workspaces/:workspaceId/ledger/summary returns summary data", async () => {
    const { app } = buildApp()

    const response = await request(app).get(
      "/workspaces/zoauro-food/ledger/summary?start=2026-06-01&end=2026-06-18",
    )

    expect(response.status).toBe(200)
    expect(response.body.data).toHaveProperty("grossOrderValue")
    expect(response.body.data).toHaveProperty("paymentMethods")
  })

  it("GET /workspaces/:workspaceId/ledger/transactions returns a page of rows", async () => {
    const { app } = buildApp()

    const response = await request(app).get("/workspaces/zoauro-food/ledger/transactions")

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual({ items: [], total: 0, page: 1, pageSize: 8 })
  })

  it("returns 401 without a principal", async () => {
    const { app } = buildApp({ principal: null })

    const response = await request(app).get("/workspaces/zoauro-food/ledger/summary")

    expect(response.status).toBe(401)
  })

  it("returns 404 for a workspace the principal cannot access", async () => {
    const { app } = buildApp({ resolveAccessibleWorkspaceIds: async () => ["ws-2"] })

    const response = await request(app).get("/workspaces/zoauro-food/ledger/summary")

    expect(response.status).toBe(404)
  })

  it("rejects an unknown transaction type filter", async () => {
    const { app } = buildApp()

    const response = await request(app).get(
      "/workspaces/zoauro-food/ledger/transactions?type=NOT_A_TYPE",
    )

    expect(response.status).toBe(400)
  })

  it("rejects an out-of-range page size", async () => {
    const { app } = buildApp()

    const response = await request(app).get(
      "/workspaces/zoauro-food/ledger/transactions?pageSize=0",
    )

    expect(response.status).toBe(400)
  })
})
