import cors from "cors"
import express from "express"

import { env } from "./env.js"
import { healthRouter } from "./routes/health.js"

// Keep the existing imports and add the workspace router
// using the actual path shown in workspace.routes.test.ts.

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }))
  app.use(express.json())

  app.use("/health", healthRouter)

  // Register the workspace router here:
  // app.use("/api/workspaces", workspaceRouter);

  return app
}
