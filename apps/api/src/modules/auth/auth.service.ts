// Two-step sign-in.
// 1. Email or mobile number + password → a challenge listing the member's methods.
// 2. The member picks email, SMS or authenticator app; email/SMS send a 6-digit code.
// 3. The code is checked and a session starts.
// Challenges live in Redis for 10 minutes; codes are stored only as hashes.
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import { hash, verify as verifyPassword } from "@node-rs/argon2"
import type {
  CodeSent,
  LoginChallenge,
  LoginRequest,
  Me,
  MfaMethod,
  MfaOption,
} from "@zoauro/shared"
import { OTP_LENGTH, RECOVERY_CODE_COUNT } from "@zoauro/shared"
import { generateSecret, generateURI, verify as verifyTotp } from "otplib"
import QRCode from "qrcode"
import { env } from "../../config/env"
import type { Actor } from "../../lib/audit"
import { decryptSecret, encryptSecret, hashForLookup } from "../../lib/crypto"
import { badRequest, HttpError, tooMany, unauthorized } from "../../lib/errors"
import { sendMail } from "../../lib/mailer"
import { clearRateLimit, rateLimit } from "../../lib/rate-limit"
import { redis } from "../../lib/redis"
import { sendOtpSms } from "../../lib/sms"
import type { MemberContext } from "../../middleware/auth"
import * as repo from "./auth.repository"

const CHALLENGE_TTL = 10 * 60
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN = 30

type Challenge = {
  memberId: string
  /** What the member typed in step 1, for rate limits and the audit log. */
  via: "email" | "phone"
  identifier: string
  /** Chosen in step 2; null until then. */
  method: MfaMethod | null
  codeHash: string | null
  attempts: number
  sentAt: number
}

const challengeKey = (id: string) => `login:challenge:${id}`
const hashCode = (challengeId: string, code: string) =>
  createHash("sha256").update(`${challengeId}:${code}:${env.SESSION_SECRET}`).digest("hex")

// Compared against when the account is unknown, so both paths take the same time.
const DUMMY_HASH = await hash("not-a-real-password-just-for-timing")

export function maskEmail(email: string) {
  const [user = "", domain = ""] = email.split("@")
  const shown =
    user.length <= 2
      ? (user[0] ?? "")
      : `${user[0]}${"*".repeat(Math.min(user.length - 2, 6))}${user.at(-1)}`
  return `${shown}@${domain}`
}

/** +919840012345 → +91 98•••••345 */
export function maskPhone(phone: string) {
  const local = phone.replace(/^\+91/, "")
  return `+91 ${local.slice(0, 2)}${"•".repeat(Math.max(local.length - 5, 0))}${local.slice(-3)}`
}

type MfaInfo = NonNullable<Awaited<ReturnType<typeof repo.findMfaInfo>>>

function optionsFor(m: MfaInfo): MfaOption[] {
  return [
    { method: "email", destination: maskEmail(m.email), available: true },
    m.phone && m.phoneVerified
      ? { method: "sms", destination: maskPhone(m.phone), available: true }
      : {
          method: "sms",
          destination: m.phone ? maskPhone(m.phone) : "No mobile number on file",
          available: false,
          note: m.phone
            ? "Mobile number not verified yet"
            : "Ask your Super Admin to add your mobile number",
        },
    m.totpEnabled
      ? { method: "totp", destination: "Google or Microsoft Authenticator", available: true }
      : {
          method: "totp",
          destination: "Google or Microsoft Authenticator",
          available: false,
          note: "Set it up after signing in, from your profile",
        },
  ]
}

async function saveChallenge(id: string, c: Challenge, keepTtl = false) {
  if (keepTtl) await redis.set(challengeKey(id), JSON.stringify(c), "KEEPTTL")
  else await redis.set(challengeKey(id), JSON.stringify(c), "EX", CHALLENGE_TTL)
}

async function loadChallenge(challengeId: string) {
  const raw = await redis.get(challengeKey(challengeId))
  if (!raw)
    throw new HttpError(
      410,
      "challenge_expired",
      "This sign-in has expired. Go back and sign in again.",
    )
  return JSON.parse(raw) as Challenge
}

/** Step 1: check the password and list the ways to get a code. */
export async function startLogin(
  input: LoginRequest,
  ip: string | undefined,
): Promise<LoginChallenge> {
  const via = "email" in input ? "email" : "phone"
  const identifier = "email" in input ? input.email : input.phone
  const wrong =
    via === "email"
      ? "The email or password is incorrect."
      : "The mobile number or password is incorrect."

  await rateLimit(
    `login:id:${identifier}`,
    10,
    15 * 60,
    "Too many sign-in attempts. Try again in 15 minutes.",
  )
  if (ip)
    await rateLimit(`login:ip:${ip}`, 50, 15 * 60, "Too many sign-in attempts from this network.")

  const member =
    via === "email"
      ? await repo.findMemberByEmail(identifier)
      : await repo.findMemberByPhone(identifier)
  const ok = await verifyPassword(member?.passwordHash ?? DUMMY_HASH, input.password)
  if (!member || !ok || member.status !== "active") throw unauthorized(`${wrong} Please try again.`)

  const info = (await repo.findMfaInfo(member.id))!
  const options = optionsFor(info)
  // Preselect the method that matches how they signed in: mobile number → SMS,
  // email → email code. SMS falls back to email when the number isn't verified.
  const smsReady = options.some((o) => o.method === "sms" && o.available)
  const preferred = via === "phone" && smsReady ? "sms" : "email"

  const challengeId = randomUUID()
  await saveChallenge(challengeId, {
    memberId: member.id,
    via,
    identifier,
    method: null,
    codeHash: null,
    attempts: 0,
    sentAt: 0,
  })
  return { challengeId, options, preferred, expiresInSeconds: CHALLENGE_TTL }
}

/** Step 2: use the chosen method. Email and SMS get a fresh code; the authenticator app needs nothing sent. */
export async function sendCode(challengeId: string, method: MfaMethod): Promise<CodeSent> {
  const c = await loadChallenge(challengeId)
  const info = await repo.findMfaInfo(c.memberId)
  if (!info) throw unauthorized("Your account is no longer active.")
  const option = optionsFor(info).find((o) => o.method === method)!
  if (!option.available)
    throw badRequest(option.note ?? "That method isn't available for your account.")

  if (method !== "totp") {
    const wait = RESEND_COOLDOWN - Math.floor((Date.now() - c.sentAt) / 1000)
    if (c.method === method && wait > 0)
      throw tooMany(`Wait ${wait} seconds before asking for another code.`)
    const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0")
    if (method === "email") {
      await sendMail(
        info.email,
        `${code} is your GoKart sign-in code`,
        `Your GoKart Admin sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't try to sign in, change your password and tell your Super Admin.`,
      )
      if (env.NODE_ENV === "development")
        console.info(`[dev] sign-in code for ${info.email}: ${code}`)
    } else {
      await sendOtpSms(info.phone!, code)
    }
    c.codeHash = hashCode(challengeId, code)
    c.sentAt = Date.now()
  } else {
    c.codeHash = null
  }
  c.method = method
  c.attempts = 0
  await saveChallenge(challengeId, c, true)
  return {
    method,
    destination: option.destination,
    resendInSeconds: method === "totp" ? 0 : RESEND_COOLDOWN,
  }
}

/** Step 3: check the code and return the member to start a session for. */
export async function verifyLogin(
  challengeId: string,
  code: string,
  requestActor: Pick<Actor, "ip" | "source" | "userAgent">,
) {
  const c = await loadChallenge(challengeId)
  if (!c.method) throw badRequest("Choose how you want to receive your code first.")
  if (c.attempts >= MAX_ATTEMPTS) {
    await redis.del(challengeKey(challengeId))
    throw tooMany("Too many incorrect codes. Go back and sign in again.")
  }

  let ok = false
  if (c.method === "totp") {
    const info = await repo.findMfaInfo(c.memberId)
    ok = Boolean(info?.totpEnabled) && (await checkTotp(c.memberId, info!, code))
  } else if (c.codeHash) {
    const a = Buffer.from(hashCode(challengeId, code)),
      b = Buffer.from(c.codeHash)
    ok = a.length === b.length && timingSafeEqual(a, b)
  }

  if (!ok) {
    c.attempts++
    await saveChallenge(challengeId, c, true)
    throw badRequest("The verification code is incorrect. Please try again.", {
      code: [`${MAX_ATTEMPTS - c.attempts} attempts left`],
    })
  }

  await redis.del(challengeKey(challengeId))
  await clearRateLimit(`login:id:${c.identifier}`)
  const member = await repo.findMemberContext(c.memberId)
  if (!member) throw unauthorized("Your account is no longer active.")
  await repo.recordSignIn(
    { ...requestActor, id: member.id, name: member.name, role: member.role },
    c.method,
    c.via,
  )
  return member
}

/** Step 3 with a one-time backup code, for someone without their authenticator app. */
export async function verifyRecoveryLogin(
  challengeId: string,
  recoveryCode: string,
  requestActor: Pick<Actor, "ip" | "source" | "userAgent">,
) {
  const c = await loadChallenge(challengeId)
  const info = await repo.findMfaInfo(c.memberId)
  if (!info?.totpEnabled)
    throw badRequest("Backup codes only work when an authenticator app is set up.")
  if (c.attempts >= MAX_ATTEMPTS) {
    await redis.del(challengeKey(challengeId))
    throw tooMany("Too many incorrect codes. Go back and sign in again.")
  }

  const ok = await repo.useRecoveryCode(
    c.memberId,
    hashForLookup(`recovery:${c.memberId}`, recoveryCode),
  )
  if (!ok) {
    c.attempts++
    await saveChallenge(challengeId, c, true)
    throw badRequest("That backup code isn't valid or has already been used.", {
      recoveryCode: [`${MAX_ATTEMPTS - c.attempts} attempts left`],
    })
  }

  await redis.del(challengeKey(challengeId))
  await clearRateLimit(`login:id:${c.identifier}`)
  const member = await repo.findMemberContext(c.memberId)
  if (!member) throw unauthorized("Your account is no longer active.")
  const actor = { ...requestActor, id: member.id, name: member.name, role: member.role }
  const left = info._count.recoveryCodes - 1
  await repo.recordSignIn(actor, "totp", c.via)
  await repo.recordRecoveryUse(actor, left)
  await sendMail(
    info.email,
    "A GoKart backup code was used",
    `Someone signed in to your GoKart Admin account with a backup code. You have ${left} backup ${left === 1 ? "code" : "codes"} left.\n\nIf this wasn't you, change your password and tell your Super Admin straight away. If you've lost your phone, turn off the authenticator app in My profile and set it up again.`,
  )
  return member
}

export const signOut = (actor: Actor) => repo.recordSignOut(actor)

/** Sends another code by the method already chosen. */
export async function resendCode(challengeId: string) {
  const c = await loadChallenge(challengeId)
  if (!c.method) throw badRequest("Choose how you want to receive your code first.")
  if (c.method === "totp") throw badRequest("Use the current code from your authenticator app.")
  return sendCode(challengeId, c.method)
}

export async function me(m: MemberContext): Promise<Me> {
  const info = await repo.findMfaInfo(m.id)
  const initials = m.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return {
    ...m,
    initials,
    phone: info?.phone ? maskPhone(info.phone) : null,
    totpEnabled: Boolean(info?.totpEnabled),
    recoveryCodesLeft: info?.totpEnabled ? info._count.recoveryCodes : 0,
    preferredMfa: info?.preferredMfa ?? "email",
  }
}

// ---------- authenticator app ----------

// Accept the current 30-second code and the one either side, for small clock drift.
const TOTP_TOLERANCE_SECONDS = 30

/** Checks an authenticator code and records its time step so it can't be used again. */
async function checkTotp(
  memberId: string,
  info: { totpSecret: string | null; totpLastStep: number | null },
  code: string,
) {
  if (!info.totpSecret) return false
  const result = await verifyTotp({
    secret: decryptSecret(info.totpSecret),
    token: code,
    epochTolerance: TOTP_TOLERANCE_SECONDS,
    ...(info.totpLastStep !== null && { afterTimeStep: info.totpLastStep }),
  })
  if (!result.valid || !("timeStep" in result)) return false
  return repo.claimTotpStep(memberId, result.timeStep)
}

// Backup codes: 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const s = Array.from(
      { length: 8 },
      () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
    ).join("")
    return `${s.slice(0, 4)}-${s.slice(4)}`
  })
}
const recoveryHashes = (memberId: string, codes: string[]) =>
  codes.map((code) => hashForLookup(`recovery:${memberId}`, code))

/** Re-checks the password before a sensitive security change. */
async function confirmPassword(m: MemberContext, password: string) {
  await rateLimit(`pwconfirm:${m.id}`, 5, 15 * 60, "Too many attempts. Try again in 15 minutes.")
  const row = await repo.findPasswordHash(m.id)
  if (!row || !(await verifyPassword(row.passwordHash, password)))
    throw badRequest("That password isn't right.", { password: ["Incorrect password"] })
  await clearRateLimit(`pwconfirm:${m.id}`)
}

const pendingTotpKey = (id: string) => `totp:pending:${id}`

export async function startTotpSetup(m: MemberContext) {
  const info = await repo.findMfaInfo(m.id)
  if (info?.totpEnabled)
    throw badRequest("An authenticator app is already set up. Turn it off first to switch phones.")
  const secret = generateSecret()
  await redis.set(pendingTotpKey(m.id), encryptSecret(secret), "EX", 10 * 60)
  const otpauthUrl = generateURI({ issuer: "GoKart Admin", label: m.email, secret })
  return {
    otpauthUrl,
    qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }),
    manualKey: secret.match(/.{1,4}/g)!.join(" "),
  }
}

/** Turns the app on once its first code checks out, and returns the backup codes (shown once). */
export async function confirmTotpSetup(m: MemberContext, code: string, actor: Actor) {
  const pending = await redis.get(pendingTotpKey(m.id))
  if (!pending) throw new HttpError(410, "setup_expired", "Setup expired. Start again.")
  const result = await verifyTotp({
    secret: decryptSecret(pending),
    token: code,
    epochTolerance: TOTP_TOLERANCE_SECONDS,
  })
  if (!result.valid || !("timeStep" in result))
    throw badRequest("That code doesn't match. Check the time on your phone and try again.")
  const codes = newRecoveryCodes()
  await repo.enableTotp(actor, m.id, pending, result.timeStep, recoveryHashes(m.id, codes))
  await redis.del(pendingTotpKey(m.id))
  return { recoveryCodes: codes }
}

/** A fresh set of backup codes; the old ones stop working. */
export async function regenerateRecoveryCodes(m: MemberContext, password: string, actor: Actor) {
  await confirmPassword(m, password)
  const info = await repo.findMfaInfo(m.id)
  if (!info?.totpEnabled) throw badRequest("Set up an authenticator app first.")
  const codes = newRecoveryCodes()
  await repo.replaceRecoveryCodes(actor, m.id, recoveryHashes(m.id, codes))
  return { recoveryCodes: codes }
}

/** Turns the authenticator app off (e.g. a lost or replaced phone) and deletes its backup codes. */
export async function disableTotp(m: MemberContext, password: string, actor: Actor) {
  await confirmPassword(m, password)
  await repo.disableTotp(actor, m.id)
  await sendMail(
    m.email,
    "Authenticator app turned off",
    "The authenticator app was turned off for your GoKart Admin account. You can still sign in with an email or SMS code.\n\nIf this wasn't you, change your password and tell your Super Admin straight away.",
  )
}

/** Always answers the same way, so the form can't be used to find accounts. */
export async function requestPasswordReset(email: string) {
  await rateLimit(`reset:${email}`, 3, 60 * 60, "Too many reset requests. Try again later.")
  const member = await repo.findMemberByEmail(email)
  if (member?.status === "active")
    await sendMail(
      member.email,
      "Reset your GoKart Admin password",
      "A Super Admin will reset your password and send you a temporary one. If you didn't ask for this, ignore this email.",
    )
}
