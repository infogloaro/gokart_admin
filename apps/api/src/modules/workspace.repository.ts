import type { PrismaClient } from "@prisma/client"

export function createWorkspaceRepository(prisma: PrismaClient) {
  return {
    listByIds(ids: string[]) {
      if (ids.length === 0) {
        return Promise.resolve([])
      }

      return prisma.workspace.findMany({
        where: {
          id: { in: ids },
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
        orderBy: { name: "asc" },
      })
    },

    findById(id: string) {
      return prisma.workspace.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      })
    },

    findActiveByUserId(userId: string) {
      return prisma.activeWorkspaceContext.findUnique({
        where: { userId },
        include: { workspace: true },
      })
    },

    saveActiveWorkspace(userId: string, workspaceId: string) {
      return prisma.activeWorkspaceContext.upsert({
        where: { userId },
        create: { userId, workspaceId },
        update: { workspaceId },
        include: { workspace: true },
      })
    },
  }
}
