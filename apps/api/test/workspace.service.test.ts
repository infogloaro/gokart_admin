import { describe, expect, it, vi } from "vitest"

import { createWorkspaceService } from "../src/modules/workspace.service.js"
import type { WorkspacePrincipal } from "../src/modules/workspace.types.js"

const principal: WorkspacePrincipal = { userId: "user-1" }

function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    workspace: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    activeWorkspaceContext: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    ...overrides,
  } as unknown as Parameters<typeof createWorkspaceService>[0]
}

describe("workspace.service", () => {
  describe("listWorkspaces", () => {
    it("lists only the workspaces the principal can access", async () => {
      const prisma = buildPrisma()
      prisma.workspace.findMany.mockResolvedValue([
        { id: "ws-1", name: "ZOAURO FOOD", slug: "zoauro-food", status: "ACTIVE" },
      ])

      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(["ws-1", "ws-1", "ws-2"])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      const result = await service.listWorkspaces(principal)

      expect(resolveAccessibleWorkspaceIds).toHaveBeenCalledWith(principal)
      expect(prisma.workspace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ["ws-1", "ws-2"] }, status: "ACTIVE" } }),
      )
      expect(result).toEqual([
        { id: "ws-1", name: "ZOAURO FOOD", slug: "zoauro-food", status: "ACTIVE" },
      ])
    })

    it("skips the database when the principal has no accessible workspaces", async () => {
      const prisma = buildPrisma()
      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue([])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      const result = await service.listWorkspaces(principal)

      expect(prisma.workspace.findMany).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it("fails when the resolver does not return an array", async () => {
      const prisma = buildPrisma()
      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(null as never)
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      await expect(service.listWorkspaces(principal)).rejects.toMatchObject({
        message: "Unable to resolve workspace access",
        status: 500,
      })
    })
  })

  describe("getActiveWorkspace", () => {
    it("returns the active workspace when it is accessible and active", async () => {
      const prisma = buildPrisma()
      prisma.activeWorkspaceContext.findUnique.mockResolvedValue({
        userId: "user-1",
        workspaceId: "ws-1",
        workspace: { id: "ws-1", name: "ZOAURO FOOD", slug: "zoauro-food", status: "ACTIVE" },
      })

      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(["ws-1"])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      const result = await service.getActiveWorkspace(principal)

      expect(result).toEqual({
        workspace: { id: "ws-1", name: "ZOAURO FOOD", slug: "zoauro-food", status: "ACTIVE" },
      })
    })

    it("returns null when no active workspace is stored", async () => {
      const prisma = buildPrisma()
      prisma.activeWorkspaceContext.findUnique.mockResolvedValue(null)

      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(["ws-1"])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      const result = await service.getActiveWorkspace(principal)

      expect(result).toEqual({ workspace: null })
    })

    it("returns null when the active workspace is no longer accessible", async () => {
      const prisma = buildPrisma()
      prisma.activeWorkspaceContext.findUnique.mockResolvedValue({
        userId: "user-1",
        workspaceId: "ws-2",
        workspace: { id: "ws-2", name: "GLOARO MART", slug: "gloaro-mart", status: "ACTIVE" },
      })

      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(["ws-1"])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      const result = await service.getActiveWorkspace(principal)

      expect(result).toEqual({ workspace: null })
    })

    it("returns null when the active workspace is no longer ACTIVE", async () => {
      const prisma = buildPrisma()
      prisma.activeWorkspaceContext.findUnique.mockResolvedValue({
        userId: "user-1",
        workspaceId: "ws-1",
        workspace: { id: "ws-1", name: "ZOAURO FOOD", slug: "zoauro-food", status: "SUSPENDED" },
      })

      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(["ws-1"])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      const result = await service.getActiveWorkspace(principal)

      expect(result).toEqual({ workspace: null })
    })
  })

  describe("setActiveWorkspace", () => {
    it("saves and returns the new active workspace", async () => {
      const prisma = buildPrisma()
      prisma.workspace.findUnique.mockResolvedValue({
        id: "ws-1",
        name: "ZOAURO FOOD",
        slug: "zoauro-food",
        status: "ACTIVE",
      })
      prisma.activeWorkspaceContext.upsert.mockResolvedValue({
        userId: "user-1",
        workspaceId: "ws-1",
        workspace: { id: "ws-1", name: "ZOAURO FOOD", slug: "zoauro-food", status: "ACTIVE" },
      })

      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(["ws-1"])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      const result = await service.setActiveWorkspace(principal, "ws-1")

      expect(prisma.activeWorkspaceContext.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          create: { userId: "user-1", workspaceId: "ws-1" },
          update: { workspaceId: "ws-1" },
        }),
      )
      expect(result).toEqual({
        workspace: { id: "ws-1", name: "ZOAURO FOOD", slug: "zoauro-food", status: "ACTIVE" },
      })
    })

    it("rejects a workspace the principal cannot access", async () => {
      const prisma = buildPrisma()
      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(["ws-1"])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      await expect(service.setActiveWorkspace(principal, "ws-2")).rejects.toMatchObject({
        message: "Workspace not found or access denied",
        status: 404,
      })
      expect(prisma.workspace.findUnique).not.toHaveBeenCalled()
    })

    it("rejects a workspace that is not ACTIVE", async () => {
      const prisma = buildPrisma()
      prisma.workspace.findUnique.mockResolvedValue({
        id: "ws-1",
        name: "ZOAURO FOOD",
        slug: "zoauro-food",
        status: "SUSPENDED",
      })

      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(["ws-1"])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      await expect(service.setActiveWorkspace(principal, "ws-1")).rejects.toMatchObject({
        message: "Workspace not found or access denied",
        status: 404,
      })
      expect(prisma.activeWorkspaceContext.upsert).not.toHaveBeenCalled()
    })

    it("rejects a workspace id that no longer exists", async () => {
      const prisma = buildPrisma()
      prisma.workspace.findUnique.mockResolvedValue(null)

      const resolveAccessibleWorkspaceIds = vi.fn().mockResolvedValue(["ws-1"])
      const service = createWorkspaceService(prisma, resolveAccessibleWorkspaceIds)

      await expect(service.setActiveWorkspace(principal, "ws-1")).rejects.toMatchObject({
        message: "Workspace not found or access denied",
        status: 404,
      })
    })
  })
})
