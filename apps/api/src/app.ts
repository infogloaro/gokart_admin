import cors from "cors"
import express from "express"

import { env } from "./env.js"
import { prisma } from "./lib/prisma.js"
import { healthRouter } from "./routes/health.js"
import { createWorkspaceRouter } from "./modules/workspace.routes.js"
import { createDashboardRouter } from "./modules/dashboard/dashboard.routes.js"

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }))
  app.use(express.json())

  app.use("/health", healthRouter)

  // Authentication and membership resolution are supplied by the auth module
  // once it lands. Until then, keep the local development app usable with a
  // stable development principal and all active workspaces.
  const workspaceRouter = createWorkspaceRouter({
    prisma,
    requireAuth: (_req, _res, next) => next(),
    getPrincipal: (req) => ({
      userId: req.header("x-user-id") ?? "development-user",
    }),
    resolveAccessibleWorkspaceIds: async () => {
      const workspaces = await prisma.workspace.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      })
      return workspaces.map(({ id }) => id)
    },
  })

  app.use("/api/workspaces", workspaceRouter)

  const dashboardRouter = createDashboardRouter({
    prisma,
    requireAuth: (_req, _res, next) => next(),
    getPrincipal: (req) => ({
      userId: req.header("x-user-id") ?? "development-user",
    }),
    resolveAccessibleWorkspaceIds: async () => {
      const workspaces = await prisma.workspace.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      })
      return workspaces.map(({ id }) => id)
    },
  })

  app.use("/api/workspaces", dashboardRouter)

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
