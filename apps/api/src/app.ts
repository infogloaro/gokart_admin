import cors from "cors"
import express from "express"

import { env } from "./env.js"
import { healthRouter } from "./routes/health.js"

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.WEB_ORIGIN }))
  app.use(express.json())

  app.use("/health", healthRouter)

  return app
}
