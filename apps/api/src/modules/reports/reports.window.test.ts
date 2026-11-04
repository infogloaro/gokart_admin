import { describe, expect, it } from "vitest"
import { customWindow, window } from "./reports"

// 2026-11-04 15:30 IST.
const NOW = Date.parse("2026-11-04T10:00:00Z")
const DAY = 86_400_000

describe("customWindow", () => {
  it("reports a short span per day, from IST midnight of the first day", () => {
    const w = customWindow("2026-10-01", "2026-10-10", NOW)
    expect(w).toMatchObject({ unit: "day", buckets: 10, first: "2026-10-01" })
    expect(w.from.toISOString()).toBe("2026-09-30T18:30:00.000Z")
    expect(w.to.toISOString()).toBe("2026-10-10T18:30:00.000Z")
  })

  it("covers a single day", () => {
    expect(customWindow("2026-10-05", "2026-10-05", NOW)).toMatchObject({ unit: "day", buckets: 1 })
  })

  it("swaps inverted dates", () => {
    const w = customWindow("2026-10-10", "2026-10-01", NOW)
    expect(w).toMatchObject({ unit: "day", buckets: 10, first: "2026-10-01" })
  })

  it("never runs past now", () => {
    const w = customWindow("2026-11-01", "2026-12-31", NOW)
    expect(w.buckets).toBe(4) // 1–4 November
    expect(w.to.getTime()).toBe(NOW)
  })

  it("clamps a span that starts in the future to today", () => {
    expect(customWindow("2027-01-01", "2027-02-01", NOW)).toMatchObject({
      unit: "day",
      buckets: 1,
      first: "2026-11-04",
    })
  })

  it("reports a medium span per week, starting on the Monday on or before the first day", () => {
    const w = customWindow("2026-09-01", "2026-10-30", NOW) // a Tuesday, 60 days
    expect(w).toMatchObject({ unit: "week", first: "2026-08-31", buckets: 9 })
  })

  it("reports a long span per month", () => {
    const w = customWindow("2026-04-01", "2026-10-17", NOW)
    expect(w).toMatchObject({ unit: "month", first: "2026-04-01", buckets: 7 })
  })

  it("limits a span to three years", () => {
    const w = customWindow("2020-01-01", "2026-11-04", NOW)
    const days = Math.round((Math.min(w.to.getTime(), NOW) - w.from.getTime()) / DAY)
    expect(days).toBeLessThanOrEqual(1095)
    expect(w.unit).toBe("month")
  })
})

describe("window", () => {
  it("keeps the fixed periods as they were", () => {
    expect(window("daily", NOW)).toMatchObject({ unit: "day", buckets: 14, first: "2026-10-22" })
    expect(window("weekly", NOW)).toMatchObject({ unit: "week", buckets: 8, first: "2026-09-14" })
    expect(window("monthly", NOW)).toMatchObject({ unit: "month", buckets: 6, first: "2026-06-01" })
  })

  it("uses the picked range for a custom period", () => {
    const w = window("custom", NOW, { from: "2026-10-01", to: "2026-10-03" })
    expect(w).toMatchObject({ unit: "day", buckets: 3 })
  })
})
