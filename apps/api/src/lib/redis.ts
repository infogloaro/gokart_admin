import { Redis } from "ioredis"
import { env } from "../config/env"

// lazyConnect: scripts that only import modules (OpenAPI generation) never connect.
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true })
