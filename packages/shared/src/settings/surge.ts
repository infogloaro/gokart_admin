import { z } from "zod"
import { Business } from "../common/enums"

/** Surge rules read the clock in Indian Standard Time, the same for every state. */
const IST_OFFSET_MINUTES = 330

export const SURGE_KINDS = ["peak", "night", "rain", "festival", "custom"] as const
export const SurgeKind = z.enum(SURGE_KINDS)
export type SurgeKind = z.infer<typeof SurgeKind>

export const SURGE_KIND_LABEL: Record<SurgeKind, string> = {
  peak: "Peak hours",
  night: "Night delivery",
  rain: "Rain",
  festival: "Festival",
  custom: "Custom",
}

const minuteOfDay = z.number().int().min(0).max(1439)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")

const surgeFields = {
  name: z.string().trim().min(2).max(80),
  kind: SurgeKind,
  /** null applies to both businesses. */
  business: Business.nullable(),
  /** Scope, widest to narrowest. null means "all"; a narrower choice implies the wider ones. */
  state: z.string().nullable(),
  districtId: z.string().nullable(),
  zoneId: z.string().nullable(),
  /** 100 = no change, 150 = 1.5x the delivery fee. */
  multiplierPercent: z.number().int().min(101).max(500),
  /** Ceiling on the extra charged, so a surge on a long trip stays bounded. */
  maxExtraPaise: z.number().int().positive().nullable(),
  startMinute: minuteOfDay.nullable(),
  endMinute: minuteOfDay.nullable(),
  /** 0 = Sunday … 6 = Saturday; empty means every day. */
  days: z.array(z.number().int().min(0).max(6)).max(7),
  startsOn: isoDate.nullable(),
  endsOn: isoDate.nullable(),
}

type ScheduleShape = {
  kind: SurgeKind
  startMinute: number | null
  endMinute: number | null
  startsOn: string | null
  endsOn: string | null
}

function checkSchedule(value: ScheduleShape, ctx: z.RefinementCtx) {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message })
  if ((value.startMinute === null) !== (value.endMinute === null))
    issue("startMinute", "Set both a start and an end time, or neither.")
  if ((value.startsOn === null) !== (value.endsOn === null))
    issue("startsOn", "Set both a first and a last date, or neither.")
  if (value.startsOn && value.endsOn && value.endsOn < value.startsOn)
    issue("endsOn", "The last date cannot be before the first date.")
  if (
    (value.kind === "peak" || value.kind === "night") &&
    (value.startMinute === null || value.endMinute === null)
  )
    issue("startMinute", "Choose the hours this surge runs.")
  if (value.kind === "festival" && (value.startsOn === null || value.endsOn === null))
    issue("startsOn", "Choose the dates this festival surge runs.")
  if (value.startMinute !== null && value.startMinute === value.endMinute)
    issue("endMinute", "The end time must differ from the start time.")
}

export const SurgeRuleInput = z.object(surgeFields).superRefine(checkSchedule)
export type SurgeRuleInput = z.infer<typeof SurgeRuleInput>

export const CreateSurgeRuleRequest = z
  .object({ ...surgeFields, active: z.boolean() })
  .superRefine(checkSchedule)
export type CreateSurgeRuleRequest = z.infer<typeof CreateSurgeRuleRequest>

export const SurgeRule = z.object({
  id: z.string(),
  ...surgeFields,
  districtName: z.string().nullable(),
  zoneName: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type SurgeRule = z.infer<typeof SurgeRule>

export const SetSurgeActiveRequest = z.object({ active: z.boolean() })

export const SurgePreviewRequest = z.object({
  business: Business,
  /** Where the delivery happens; a zone implies its district and state. */
  state: z.string().nullable(),
  districtId: z.string().nullable(),
  zoneId: z.string().nullable(),
  distanceKm: z.number().min(0).max(200),
  cartPaise: z.number().int().nonnegative(),
  /** The moment to price, so a night or festival rule can be checked ahead of time. */
  at: z.iso.datetime(),
  /** A rule being edited, priced as if it were already active. */
  draft: SurgeRuleInput.nullable(),
})
export type SurgePreviewRequest = z.infer<typeof SurgePreviewRequest>

export type DeliveryFeeBasis = {
  baseFeePaise: number
  perKmPaise: number
  freeAbovePaise: number | null
}

export type SurgeCandidate = Pick<
  SurgeRuleInput,
  | "name"
  | "business"
  | "state"
  | "districtId"
  | "zoneId"
  | "multiplierPercent"
  | "maxExtraPaise"
  | "startMinute"
  | "endMinute"
  | "days"
  | "startsOn"
  | "endsOn"
> & { active: boolean }

const istParts = (at: Date) => {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000)
  return {
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    day: shifted.getUTCDay(),
    date: shifted.toISOString().slice(0, 10),
  }
}

/** True when `rule` is switched on and its business, zone, hours, weekdays and dates all match. */
export function surgeApplies(
  rule: SurgeCandidate,
  ctx: {
    business: "food" | "mart"
    state: string | null
    districtId: string | null
    zoneId: string | null
    at: Date
  },
): boolean {
  if (!rule.active) return false
  if (rule.business && rule.business !== ctx.business) return false
  if (rule.state && rule.state !== ctx.state) return false
  if (rule.districtId && rule.districtId !== ctx.districtId) return false
  if (rule.zoneId && rule.zoneId !== ctx.zoneId) return false
  const { minute, day, date } = istParts(ctx.at)
  if (rule.days.length && !rule.days.includes(day)) return false
  if (rule.startsOn && rule.endsOn && (date < rule.startsOn || date > rule.endsOn)) return false
  if (rule.startMinute !== null && rule.endMinute !== null) {
    const inside =
      rule.startMinute < rule.endMinute
        ? minute >= rule.startMinute && minute < rule.endMinute
        : minute >= rule.startMinute || minute < rule.endMinute // window crosses midnight
    if (!inside) return false
  }
  return true
}

export type DeliveryFeeQuote = {
  baseFeePaise: number
  distanceFeePaise: number
  /** Base plus distance, before any surge. */
  subtotalPaise: number
  freeDelivery: boolean
  surge: {
    name: string
    multiplierPercent: number
    extraPaise: number
    capped: boolean
  } | null
  /** Every rule that matched; only the highest multiplier is charged, so rules never stack. */
  matched: string[]
  totalPaise: number
}

/** Delivery fee for one order: base + distance, free above the cart threshold, then the strongest surge. */
export function quoteDeliveryFee(input: {
  fee: DeliveryFeeBasis
  distanceKm: number
  cartPaise: number
  surgeRules: SurgeCandidate[]
  business: "food" | "mart"
  state: string | null
  districtId: string | null
  zoneId: string | null
  at: Date
}): DeliveryFeeQuote {
  const { fee } = input
  const distanceFeePaise = Math.round(fee.perKmPaise * input.distanceKm)
  const subtotalPaise = fee.baseFeePaise + distanceFeePaise
  const freeDelivery = fee.freeAbovePaise !== null && input.cartPaise >= fee.freeAbovePaise
  const matched = input.surgeRules
    .filter((rule) => surgeApplies(rule, input))
    .sort((a, b) => b.multiplierPercent - a.multiplierPercent)
  const strongest = matched[0]
  if (freeDelivery || !strongest)
    return {
      baseFeePaise: fee.baseFeePaise,
      distanceFeePaise,
      subtotalPaise,
      freeDelivery,
      surge: null,
      matched: matched.map((rule) => rule.name),
      totalPaise: freeDelivery ? 0 : subtotalPaise,
    }
  const uncapped = Math.round((subtotalPaise * (strongest.multiplierPercent - 100)) / 100)
  const extraPaise =
    strongest.maxExtraPaise === null ? uncapped : Math.min(uncapped, strongest.maxExtraPaise)
  return {
    baseFeePaise: fee.baseFeePaise,
    distanceFeePaise,
    subtotalPaise,
    freeDelivery,
    surge: {
      name: strongest.name,
      multiplierPercent: strongest.multiplierPercent,
      extraPaise,
      capped: extraPaise < uncapped,
    },
    matched: matched.map((rule) => rule.name),
    totalPaise: subtotalPaise + extraPaise,
  }
}

export const SurgePreview = z.object({
  feeRule: z
    .object({
      id: z.string(),
      baseFeePaise: z.number().int(),
      perKmPaise: z.number().int(),
      freeAbovePaise: z.number().int().nullable(),
      effectiveFrom: z.iso.datetime(),
      zoneName: z.string().nullable(),
    })
    .nullable(),
  /** The price with the draft left out, for a side-by-side comparison. */
  without: z.object({
    subtotalPaise: z.number().int(),
    totalPaise: z.number().int(),
    freeDelivery: z.boolean(),
    matched: z.array(z.string()),
    surgeName: z.string().nullable(),
    extraPaise: z.number().int(),
  }),
  with: z.object({
    baseFeePaise: z.number().int(),
    distanceFeePaise: z.number().int(),
    subtotalPaise: z.number().int(),
    freeDelivery: z.boolean(),
    matched: z.array(z.string()),
    surgeName: z.string().nullable(),
    multiplierPercent: z.number().int().nullable(),
    extraPaise: z.number().int(),
    capped: z.boolean(),
    totalPaise: z.number().int(),
  }),
})
export type SurgePreview = z.infer<typeof SurgePreview>
