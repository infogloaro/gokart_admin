// Rider app sign-in with a phone number and an app password the team issues.
// Sessions are opaque tokens kept in Redis for 12 hours; the token is sent back on each request
// in the x-rider-token header.
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto"
import type { RequestHandler } from "express"
import { hashForLookup } from "../../lib/crypto"
import { unauthorized } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"

const SESSION_SECONDS = 12 * 60 * 60
const LOGIN_WINDOW_SECONDS = 15 * 60
const MAX_FAILED_LOGINS = 10
// No 0, O, 1 or I, so a password read out loud or copied by hand is not mistaken.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

export const generateAppPassword = () =>
  Array.from({ length: 12 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join("")

export function hashAppPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`
}

export function verifyAppPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":")
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, "hex")
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length)
  return timingSafeEqual(actual, expected)
}

const sessionKey = (token: string) => `rider-session:${hashForLookup("rider-session", token)}`

export async function createRiderSession(boyId: string): Promise<string> {
  const token = `grs_${randomBytes(32).toString("base64url")}`
  await redis.set(sessionKey(token), boyId, "EX", SESSION_SECONDS)
  return token
}

export async function endRiderSession(token: string): Promise<void> {
  await redis.del(sessionKey(token))
}

/** Reads the rider the token belongs to, or null when the token is unknown or expired. */
export async function riderForToken(token: string): Promise<string | null> {
  return redis.get(sessionKey(token))
}

export const requireRiderSession: RequestHandler = async (req, _res, next) => {
  const token = req.get("x-rider-token")
  if (!token || token.length > 200) throw unauthorized("Sign in to the rider app first.")
  const boyId = await riderForToken(token)
  if (!boyId) throw unauthorized("Your session has ended. Sign in again.")
  req.riderBoyId = boyId
  req.riderSessionToken = token
  next()
}

/** Checks phone and app password. Failed attempts are counted per phone for 15 minutes. */
export async function loginRider(
  phone: string,
  password: string,
): Promise<{ boyId: string } | null> {
  const failKey = `rider-login-fail:${hashForLookup("rider-login", phone)}`
  const failures = Number((await redis.get(failKey)) ?? 0)
  if (failures >= MAX_FAILED_LOGINS) {
    throw unauthorized("Too many failed attempts. Try again in 15 minutes.")
  }
  // Riders were saved with and without the +91 prefix, so match either form.
  const local = phone.replace(/\D/g, "").slice(-10)
  const boy = await prisma.deliveryBoy.findFirst({
    where: { phone: { in: [`+91${local}`, local, `91${local}`] } },
    select: { id: true, status: true, appPasswordHash: true },
  })
  const ok =
    !!boy &&
    !!boy.appPasswordHash &&
    boy.status === "active" &&
    verifyAppPassword(password, boy.appPasswordHash)
  if (!ok || !boy) {
    const count = await redis.incr(failKey)
    if (count === 1) await redis.expire(failKey, LOGIN_WINDOW_SECONDS)
    return null
  }
  await redis.del(failKey)
  return { boyId: boy.id }
}
