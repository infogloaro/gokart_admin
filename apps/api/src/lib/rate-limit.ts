import { redis } from "./redis"
import { tooMany } from "./errors"

/** Fixed-window limiter. Throws 429 once `limit` hits within `windowSeconds`. */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
  message: string,
) {
  const k = `rl:${bucket}`
  const count = await redis.incr(k)
  if (count === 1) await redis.expire(k, windowSeconds)
  if (count > limit) throw tooMany(message)
}

export const clearRateLimit = (bucket: string) => redis.del(`rl:${bucket}`)
