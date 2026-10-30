import { z } from "zod"
import { Business, Role } from "../common/enums"
import { Permission } from "../common/permissions"
import { IndianPhone } from "../common/phone"

export const OTP_LENGTH = 6

const password = z.string().min(1, "Enter your password")

/** Step 1, signing in with an email address. */
export const EmailLogin = z.object({
  email: z.email("Enter a valid email address").transform((v) => v.trim().toLowerCase()),
  password,
})
/** Step 1, signing in with a mobile number (normalised to +91XXXXXXXXXX). */
export const PhoneLogin = z.object({ phone: IndianPhone, password })

export const LoginRequest = z.union([EmailLogin, PhoneLogin])
export type LoginRequest = z.infer<typeof LoginRequest>

/** Ways to receive the second-step code. */
export const MFA_METHODS = ["email", "sms", "totp"] as const
export const MfaMethod = z.enum(MFA_METHODS)
export type MfaMethod = z.infer<typeof MfaMethod>

export const mfaMethodName: Record<MfaMethod, string> = {
  email: "Email code",
  sms: "SMS to mobile",
  totp: "Authenticator app",
}

export const MfaOption = z.object({
  method: MfaMethod,
  /** Partly hidden destination: a******n@gokart.in, +91 98•••••345, "Google or Microsoft Authenticator". */
  destination: z.string(),
  available: z.boolean(),
  /** Why an option can't be used yet, e.g. "Set up in My profile". */
  note: z.string().optional(),
})
export type MfaOption = z.infer<typeof MfaOption>

/** Answer to step 1: the password was right; choose how to get the code. */
export const LoginChallenge = z.object({
  challengeId: z.string(),
  options: z.array(MfaOption),
  /** Preselected method, matching how they signed in (mobile → SMS, email → email). */
  preferred: MfaMethod,
  expiresInSeconds: z.number().int(),
})
export type LoginChallenge = z.infer<typeof LoginChallenge>

/** Step 2: send the code by the chosen method (nothing is sent for an authenticator app). */
export const SendCodeRequest = z.object({ challengeId: z.string().min(1), method: MfaMethod })
export const CodeSent = z.object({
  method: MfaMethod,
  destination: z.string(),
  /** Seconds before another code can be requested. */
  resendInSeconds: z.number().int(),
})
export type CodeSent = z.infer<typeof CodeSent>

export const VerifyCodeRequest = z.object({
  challengeId: z.string().min(1),
  code: z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`),
})
export type VerifyCodeRequest = z.infer<typeof VerifyCodeRequest>

export const ResendCodeRequest = z.object({ challengeId: z.string().min(1) })

export const Me = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: Role,
  initials: z.string(),
  businesses: z.array(Business),
  zoneIds: z.array(z.string()),
  permissions: z.array(Permission),
  /** Partly hidden, or null when no mobile number is on file. */
  phone: z.string().nullable(),
  totpEnabled: z.boolean(),
  /** Unused backup codes left (0 when the authenticator app is off). */
  recoveryCodesLeft: z.number().int(),
  preferredMfa: MfaMethod,
})
export type Me = z.infer<typeof Me>

export const TotpSetup = z.object({
  otpauthUrl: z.string(),
  qrDataUrl: z.string(),
  /** The same secret as text, in groups of 4, for typing into the app by hand. */
  manualKey: z.string(),
})
export const TotpConfirmRequest = z.object({ code: z.string().regex(/^\d{6}$/) })

export const RECOVERY_CODE_COUNT = 10

/** A one-time backup code, ABCD-2345. Case and the dash are optional when typed. */
export const RecoveryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/, "Enter a backup code like ABCD-2345")
  .transform((v) => (v.includes("-") ? v : `${v.slice(0, 4)}-${v.slice(4)}`))

/** Shown once, right after they're created. */
export const RecoveryCodes = z.object({ recoveryCodes: z.array(z.string()) })

/** Step 3 with a backup code instead of the authenticator app. */
export const RecoveryLoginRequest = z.object({
  challengeId: z.string().min(1),
  recoveryCode: RecoveryCode,
})

/** Re-enter the password before turning the authenticator off or making new backup codes. */
export const PasswordConfirmRequest = z.object({
  password: z.string().min(1, "Enter your password"),
})

export const ForgotPasswordRequest = z.object({ email: z.email() })
