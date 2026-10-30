// Encryption for small secrets stored in the database (authenticator-app keys).
// AES-256-GCM; stored as "v1:<iv>:<tag>:<ciphertext>" in base64url.
// The key is TOTP_ENCRYPTION_KEY (32 bytes, base64). Outside production it falls back
// to a key derived from SESSION_SECRET so local setups work without extra config.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto"
import { env } from "../config/env"

const key = env.TOTP_ENCRYPTION_KEY
  ? Buffer.from(env.TOTP_ENCRYPTION_KEY, "base64")
  : createHash("sha256").update(`totp:${env.SESSION_SECRET}`).digest()

if (key.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes, base64-encoded")

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(":")
}

/** Reads a stored secret. Values saved before encryption existed are returned as they are. */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith("v1:")) return stored
  const [, iv, tag, data] = stored.split(":") as [string, string, string, string]
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

/** Keyed hash for one-time codes we must recognise later but never show again. */
export const hashForLookup = (purpose: string, value: string) =>
  createHmac("sha256", env.SESSION_SECRET).update(`${purpose}:${value}`).digest("hex")
