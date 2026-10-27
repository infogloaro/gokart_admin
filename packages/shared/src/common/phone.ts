import { z } from "zod"

/** Normalises an Indian mobile number to +91XXXXXXXXXX, or returns null. */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "")
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits
  if (local.length === 11 && local.startsWith("0")) return normalizeIndianPhone(local.slice(1))
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null
}

export const IndianPhone = z.string().transform((v, ctx) => {
  const n = normalizeIndianPhone(v)
  if (!n) ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" })
  return n ?? v
})

/** "+919876543210" → "+91 98765 43210". Spaced numbers also stay text in Excel. */
export function formatIndianPhone(phone: string): string {
  const n = normalizeIndianPhone(phone)
  return n ? `+91 ${n.slice(3, 8)} ${n.slice(8)}` : phone
}
