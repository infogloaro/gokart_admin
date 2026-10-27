import type { PrismaClient } from "@prisma/client"
import { createWorkspaceRepository } from "./workspace.repository.js"
import type { ResolveAccessibleWorkspaceIds, WorkspacePrincipal } from "./workspace.types.js"

function fail(message: string, status: number): never {
  throw Object.assign(new Error(message), { status })
}

export function createWorkspaceService(
  prisma: PrismaClient,
  resolveAccessibleWorkspaceIds: ResolveAccessibleWorkspaceIds,
) {
  const repository = createWorkspaceRepository(prisma)

  async function getAccessibleIds(principal: WorkspacePrincipal) {
    const ids = await resolveAccessibleWorkspaceIds(principal)

    if (!Array.isArray(ids)) {
      fail("Unable to resolve workspace access", 500)
    }

    return [...new Set(ids)]
  }

  return {
    async listWorkspaces(principal: WorkspacePrincipal) {
      const ids = await getAccessibleIds(principal)
      return repository.listByIds(ids)
    },

    async getActiveWorkspace(principal: WorkspacePrincipal) {
      const ids = await getAccessibleIds(principal)
      const active = await repository.findActiveByUserId(principal.userId)

      if (!active || !ids.includes(active.workspaceId)) {
        return { workspace: null }
      }

      if (active.workspace.status !== "ACTIVE") {
        return { workspace: null }
      }

      return { workspace: active.workspace }
    },

    async setActiveWorkspace(principal: WorkspacePrincipal, workspaceId: string) {
      const ids = await getAccessibleIds(principal)

      if (!ids.includes(workspaceId)) {
        fail("Workspace not found or access denied", 404)
      }

      const workspace = await repository.findById(workspaceId)

      if (!workspace || workspace.status !== "ACTIVE") {
        fail("Workspace not found or access denied", 404)
      }

      const saved = await repository.saveActiveWorkspace(principal.userId, workspaceId)

      return { workspace: saved.workspace }
    },
  }
}
