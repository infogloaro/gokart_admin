import express from "express"
import request from "supertest"
import { describe, expect, it, vi } from "vitest"

import { createWorkspaceRouter } from "../src/modules/workspace.routes.js"
import type { WorkspacePrincipal } from "../src/modules/workspace.types.js"

const activeWorkspace = { id: "ws-1", name: "ZOAURO FOOD", slug: "zoauro-food", status: "ACTIVE" }

function buildApp(options: {
  principal?: WorkspacePrincipal | null
  resolveAccessibleWorkspaceIds?: (principal: WorkspacePrincipal) => Promise<string[]>
  prismaOverrides?: Partial<Record<string, unknown>>
}) {
  const prisma = {
    workspace: {
      findMany: vi.fn().mockResolvedValue([activeWorkspace]),
      findUnique: vi.fn().mockResolvedValue(activeWorkspace),
    },
    activeWorkspaceContext: {
      findUnique: vi.fn().mockResolvedValue({
        userId: "user-1",
        workspaceId: "ws-1",
        workspace: activeWorkspace,
      }),
      upsert: vi.fn().mockResolvedValue({
        userId: "user-1",
        workspaceId: "ws-1",
        workspace: activeWorkspace,
      }),
    },
    ...options.prismaOverrides,
  } as unknown as Parameters<typeof createWorkspaceRouter>[0]["prisma"]

  const router = createWorkspaceRouter({
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

  return { app, prisma }
}

describe("workspace routes", () => {
  it("GET /workspaces returns the accessible workspaces", async () => {
    const { app } = buildApp({})

    const response = await request(app).get("/workspaces")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: [activeWorkspace] })
  })

  it("GET /workspaces returns 401 when there is no authenticated principal", async () => {
    const { app } = buildApp({ principal: null })

    const response = await request(app).get("/workspaces")

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: { message: "Authentication required" } })
  })

  it("GET /workspaces/active returns the stored active workspace", async () => {
    const { app } = buildApp({})

    const response = await request(app).get("/workspaces/active")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { workspace: activeWorkspace } })
  })

  it("PUT /workspaces/active switches the active workspace", async () => {
    const { app, prisma } = buildApp({})

    const response = await request(app).put("/workspaces/active").send({ workspaceId: "ws-1" })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { workspace: activeWorkspace } })
    expect(prisma.activeWorkspaceContext.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    )
  })

  it("PUT /workspaces/active returns 400 for a missing workspaceId", async () => {
    const { app } = buildApp({})

    const response = await request(app).put("/workspaces/active").send({})

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: { message: "workspaceId is required" } })
  })

  it("PUT /workspaces/active returns 404 for an inaccessible workspace", async () => {
    const { app } = buildApp({ resolveAccessibleWorkspaceIds: async () => ["ws-2"] })

    const response = await request(app).put("/workspaces/active").send({ workspaceId: "ws-1" })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: { message: "Workspace not found or access denied" } })
  })
})
