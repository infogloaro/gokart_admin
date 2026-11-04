import { describe, expect, it } from "vitest"
import {
  CreateSurgeRuleRequest,
  quoteDeliveryFee,
  surgeApplies,
  type SurgeCandidate,
} from "./surge"

// 2026-11-04 (a Wednesday) at 14:30 UTC is 20:00 in IST.
const at = (iso: string) => new Date(iso)
const EVENING = at("2026-11-04T14:30:00Z")
const LATE = at("2026-11-04T18:30:00Z") // 00:00 IST on Thursday
const NOON = at("2026-11-04T06:30:00Z") // 12:00 IST

const rule = (over: Partial<SurgeCandidate> = {}): SurgeCandidate => ({
  name: "Dinner rush",
  business: null,
  state: null,
  districtId: null,
  zoneId: null,
  multiplierPercent: 150,
  maxExtraPaise: null,
  startMinute: 19 * 60,
  endMinute: 22 * 60,
  days: [],
  startsOn: null,
  endsOn: null,
  active: true,
  ...over,
})
const ctx = {
  business: "food" as const,
  state: "Tamil Nadu",
  districtId: "d1",
  zoneId: "z1",
}
const fee = { baseFeePaise: 3800, perKmPaise: 600, freeAbovePaise: 49900 }

describe("surgeApplies", () => {
  it("matches inside the hours, in IST, and not outside them", () => {
    expect(surgeApplies(rule(), { ...ctx, at: EVENING })).toBe(true)
    expect(surgeApplies(rule(), { ...ctx, at: NOON })).toBe(false)
  })

  it("handles a window that crosses midnight", () => {
    const night = rule({ startMinute: 22 * 60, endMinute: 6 * 60 })
    expect(surgeApplies(night, { ...ctx, at: LATE })).toBe(true)
    expect(surgeApplies(night, { ...ctx, at: NOON })).toBe(false)
  })

  it("respects weekdays, dates, business, zone and the on/off switch", () => {
    expect(surgeApplies(rule({ days: [3] }), { ...ctx, at: EVENING })).toBe(true) // Wednesday
    expect(surgeApplies(rule({ days: [0, 6] }), { ...ctx, at: EVENING })).toBe(false)
    const diwali = rule({
      startMinute: null,
      endMinute: null,
      startsOn: "2026-11-04",
      endsOn: "2026-11-06",
    })
    expect(surgeApplies(diwali, { ...ctx, at: EVENING })).toBe(true)
    expect(
      surgeApplies(
        { ...diwali, endsOn: "2026-11-03", startsOn: "2026-11-01" },
        { ...ctx, at: EVENING },
      ),
    ).toBe(false)
    expect(surgeApplies(rule({ business: "mart" }), { ...ctx, at: EVENING })).toBe(false)
    expect(surgeApplies(rule({ zoneId: "other" }), { ...ctx, at: EVENING })).toBe(false)
    expect(surgeApplies(rule({ zoneId: "z1" }), { ...ctx, at: EVENING })).toBe(true)
    expect(surgeApplies(rule({ active: false }), { ...ctx, at: EVENING })).toBe(false)
  })
})

describe("surgeApplies geography", () => {
  it("scopes a rule to a state, a district or a zone", () => {
    const here = { ...ctx, at: EVENING }
    expect(surgeApplies(rule({ state: "Tamil Nadu" }), here)).toBe(true)
    expect(surgeApplies(rule({ state: "Kerala" }), here)).toBe(false)
    expect(surgeApplies(rule({ state: "Tamil Nadu", districtId: "d1" }), here)).toBe(true)
    expect(surgeApplies(rule({ state: "Tamil Nadu", districtId: "d2" }), here)).toBe(false)
    expect(surgeApplies(rule({ districtId: "d1", zoneId: "z9" }), here)).toBe(false)
    expect(surgeApplies(rule({ state: "Tamil Nadu", districtId: "d1", zoneId: "z1" }), here)).toBe(
      true,
    )
  })
})

describe("quoteDeliveryFee", () => {
  const quote = (
    surgeRules: SurgeCandidate[],
    over: { cartPaise?: number; distanceKm?: number } = {},
  ) =>
    quoteDeliveryFee({
      fee,
      distanceKm: over.distanceKm ?? 5,
      cartPaise: over.cartPaise ?? 30000,
      surgeRules,
      at: EVENING,
      ...ctx,
    })

  it("charges base plus distance with no surge", () => {
    const q = quote([])
    expect(q).toMatchObject({ subtotalPaise: 6800, totalPaise: 6800, surge: null })
  })

  it("multiplies the delivery fee", () => {
    const q = quote([rule()])
    expect(q.surge).toMatchObject({ extraPaise: 3400, capped: false })
    expect(q.totalPaise).toBe(10200)
  })

  it("never stacks: the strongest rule wins and the others are listed", () => {
    const q = quote([
      rule({ name: "A", multiplierPercent: 120 }),
      rule({ name: "B", multiplierPercent: 200 }),
    ])
    expect(q.surge?.name).toBe("B")
    expect(q.matched).toEqual(["B", "A"])
    expect(q.totalPaise).toBe(13600)
  })

  it("caps the extra", () => {
    const q = quote([rule({ maxExtraPaise: 1000 })])
    expect(q.surge).toMatchObject({ extraPaise: 1000, capped: true })
    expect(q.totalPaise).toBe(7800)
  })

  it("keeps delivery free above the cart threshold, surge or not", () => {
    const q = quote([rule()], { cartPaise: 60000 })
    expect(q).toMatchObject({ freeDelivery: true, totalPaise: 0, surge: null })
  })
})

describe("CreateSurgeRuleRequest", () => {
  const base = {
    name: "Rain",
    kind: "rain",
    business: null,
    state: null,
    districtId: null,
    zoneId: null,
    multiplierPercent: 140,
    maxExtraPaise: null,
    startMinute: null,
    endMinute: null,
    days: [],
    startsOn: null,
    endsOn: null,
    active: true,
  }

  it("accepts a rain rule with no schedule", () => {
    expect(CreateSurgeRuleRequest.safeParse(base).success).toBe(true)
  })

  it("requires hours for peak and night, and dates for festival", () => {
    expect(CreateSurgeRuleRequest.safeParse({ ...base, kind: "peak" }).success).toBe(false)
    expect(CreateSurgeRuleRequest.safeParse({ ...base, kind: "festival" }).success).toBe(false)
    expect(
      CreateSurgeRuleRequest.safeParse({
        ...base,
        kind: "night",
        startMinute: 1320,
        endMinute: 360,
      }).success,
    ).toBe(true)
  })

  it("rejects a multiplier of 100% or less and inverted dates", () => {
    expect(CreateSurgeRuleRequest.safeParse({ ...base, multiplierPercent: 100 }).success).toBe(
      false,
    )
    expect(
      CreateSurgeRuleRequest.safeParse({
        ...base,
        kind: "festival",
        startsOn: "2026-11-06",
        endsOn: "2026-11-01",
      }).success,
    ).toBe(false)
  })
})
