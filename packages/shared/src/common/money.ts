// Money is always an integer number of paise. Convert to rupees only for display.
import { z } from "zod"

export const Paise = z.number().int().safe()
export type Paise = number

export const rupeesToPaise = (rupees: number): Paise => Math.round(rupees * 100)

const inrFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })

/** ₹1,23,456.50 style. Whole-rupee amounts drop the decimals. */
export function formatINR(paise: Paise, opts: { decimals?: boolean } = {}): string {
  if (!Number.isInteger(paise)) throw new Error(`formatINR expects integer paise, got ${paise}`)
  const sign = paise < 0 ? "−" : ""
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const rest = abs % 100
  const showDecimals = opts.decimals ?? rest !== 0
  const whole = inrFormat.format(rupees)
  return `${sign}₹${whole}${showDecimals ? `.${String(rest).padStart(2, "0")}` : ""}`
}

/** Compact form used on dashboards: ₹8.4L, ₹1.1Cr. */
export function formatINRCompact(paise: Paise): string {
  const rupees = paise / 100
  const abs = Math.abs(rupees)
  const sign = rupees < 0 ? "−" : ""
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2).replace(/\.?0+$/, "")}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1).replace(/\.0$/, "")}L`
  return formatINR(Math.round(paise / 100) * 100)
}

/** Splits a total into `parts` integer shares that add up exactly to the total. */
export function splitPaise(total: Paise, parts: number): Paise[] {
  const out: Paise[] = []
  for (let i = 0; i < parts; i++)
    out.push(Math.floor((total * (i + 1)) / parts) - Math.floor((total * i) / parts))
  return out
}

/** Percentage of an amount, rounded half-up to whole paise. `pct` may be fractional (1.5). */
export const percentOf = (amount: Paise, pct: number): Paise => Math.round((amount * pct) / 100)
