import { describe, expect, it } from "vitest"
import { periods } from "./dashboard.service"

// 2026-11-04 12:00 IST
const now = Date.parse("2026-11-04T06:30:00.000Z")

describe("periods", () => {
  it("keeps rolling windows at their day count", () => {
    expect(periods("30d", now).dates).toHaveLength(30)
    expect(periods("365d", now).dates).toHaveLength(365)
  })

  it("runs the current calendar year from 1 January to today", () => {
    const p = periods("y2026", now)
    expect(p.dates[0]).toBe("2026-01-01")
    expect(p.dates.at(-1)).toBe("2026-11-04")
    expect(p.dates).toHaveLength(308)
  })

  it("runs a past year through 31 December", () => {
    const p = periods("y2025", now)
    expect(p.dates).toHaveLength(365)
    expect(p.dates.at(-1)).toBe("2025-12-31")
    expect(p.previous.to.getTime()).toBeLessThan(p.current.from.getTime())
  })

  it("covers a custom span inclusively, swaps inverted dates and stops at today", () => {
    expect(periods("c2026-03-01_2026-03-10", now).dates).toHaveLength(10)
    expect(periods("c2026-03-10_2026-03-01", now).dates).toHaveLength(10)
    expect(periods("c2026-10-30_2027-01-01", now).dates.at(-1)).toBe("2026-11-04")
  })
})
