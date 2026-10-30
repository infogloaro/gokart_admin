// Server-side sessions in Redis. The browser only holds a random token in an
// httpOnly cookie; Redis stores its hash, so a Redis dump cannot be replayed.
import { createHash, randomBytes } from "node:crypto"
import type { CookieOptions, Response } from "express"
import { isProd } from "../config/env"
import { redis } from "./redis"

export const SESSION_COOKIE = "gk_session"
const TTL_SECONDS = 12 * 60 * 60

export type SessionData = {
  memberId: string
  createdAt: number
  userAgent?: string | undefined
  ip?: string | undefined
}

const key = (token: string) => `sess:${createHash("sha256").update(token).digest("hex")}`
/** Public id for a session: the end of its hash, never the token. */
const idOfKey = (k: string) => k.slice(-16)
const memberIndex = (memberId: string) => `sess:member:${memberId}`

export const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProd,
  path: "/",
  maxAge: TTL_SECONDS * 1000,
}

export async function createSession(
  res: Response,
  memberId: string,
  device: { userAgent?: string | undefined; ip?: string | undefined } = {},
) {
  const token = randomBytes(32).toString("base64url")
  const data: SessionData = {
    memberId,
    createdAt: Date.now(),
    userAgent: device.userAgent?.slice(0, 300),
    ip: device.ip,
  }
  await redis
    .multi()
    .set(key(token), JSON.stringify(data), "EX", TTL_SECONDS)
    .sadd(memberIndex(memberId), key(token))
    .expire(memberIndex(memberId), TTL_SECONDS)
    .exec()
  res.cookie(SESSION_COOKIE, token, cookieOptions)
}

/** Reads a session and slides its expiry forward. */
export async function readSession(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null
  const raw = await redis.get(key(token))
  if (!raw) return null
  await redis.expire(key(token), TTL_SECONDS)
  return JSON.parse(raw) as SessionData
}

export async function destroySession(res: Response, token: string | undefined) {
  if (token) await redis.del(key(token))
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: undefined })
}

/** Signs a member out everywhere, e.g. after a password reset or when disabled. */
export async function destroyAllSessions(memberId: string) {
  const keys = await redis.smembers(memberIndex(memberId))
  if (keys.length) await redis.del(...keys)
  await redis.del(memberIndex(memberId))
}

/** The member's signed-in sessions, newest first. Expired ones are pruned from the index. */
export async function listSessions(memberId: string, currentToken: string | undefined) {
  const keys = await redis.smembers(memberIndex(memberId))
  const current = currentToken ? key(currentToken) : null
  const out: (SessionData & { id: string; current: boolean })[] = []
  for (const k of keys) {
    const raw = await redis.get(k)
    if (!raw) {
      await redis.srem(memberIndex(memberId), k)
      continue
    }
    out.push({ ...(JSON.parse(raw) as SessionData), id: idOfKey(k), current: k === current })
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/** Ends one of the member's sessions by its public id. Returns false if there is none. */
export async function destroySessionById(memberId: string, id: string) {
  const keys = await redis.smembers(memberIndex(memberId))
  const k = keys.find((x) => idOfKey(x) === id)
  if (!k) return false
  await redis.multi().del(k).srem(memberIndex(memberId), k).exec()
  return true
}

/** Ends every session except the one making the request; returns how many ended. */
export async function destroyOtherSessions(memberId: string, currentToken: string | undefined) {
  const keep = currentToken ? key(currentToken) : null
  const keys = (await redis.smembers(memberIndex(memberId))).filter((k) => k !== keep)
  if (keys.length)
    await redis
      .multi()
      .del(...keys)
      .srem(memberIndex(memberId), ...keys)
      .exec()
  return keys.length
}
