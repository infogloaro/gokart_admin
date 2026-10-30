import cors from "cors"
import express from "express"

import { env } from "./env.js"
import { prisma } from "./lib/prisma.js"
import { healthRouter } from "./routes/health.js"
import { createWorkspaceRouter } from "./modules/workspace.routes.js"
import { createDashboardRouter } from "./modules/dashboard/dashboard.routes.js"
import { createLedgerRouter } from "./modules/ledger/ledger.routes.js"
import { createFinanceRouter } from "./modules/finance/finance.routes.js"
import type { PrismaClient } from "./generated/client/index.js"

// Authentication and membership resolution are supplied by the auth module
// once it lands. Until then, keep the local development app usable with a
// stable development principal and all active workspaces.
function buildAuthDependencies(prismaClient: PrismaClient) {
  return {
    prisma: prismaClient,
    requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
    getPrincipal: (req: express.Request) => ({
      userId: req.header("x-user-id") ?? "development-user",
    }),
    resolveAccessibleWorkspaceIds: async () => {
      const workspaces = await prismaClient.workspace.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      })
      return workspaces.map(({ id }) => id)
    },
  }
}

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }))
  app.use(express.json())

  app.use("/health", healthRouter)

  const authDependencies = buildAuthDependencies(prisma)

  app.use("/api/workspaces", createWorkspaceRouter(authDependencies))
  app.use("/api/workspaces", createDashboardRouter(authDependencies))
  app.use("/api/workspaces", createLedgerRouter(authDependencies))
  app.use("/api/workspaces", createFinanceRouter(authDependencies))

  app.use(
    (
      error: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(error.status ?? 500).json({
        error: { message: error.message ?? "Internal error" },
      })
    },
  )

  return app
}
