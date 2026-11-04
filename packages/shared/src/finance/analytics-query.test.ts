import { describe, expect, it } from "vitest"
import { AnalyticsQuery } from "./ops"

describe("AnalyticsQuery", () => {
  it("accepts a custom period with real dates", () => {
    expect(
      AnalyticsQuery.safeParse({ period: "custom", from: "2026-10-06", to: "2026-11-04" }).success,
    ).toBe(true)
  })

  it("needs both dates for a custom period", () => {
    expect(AnalyticsQuery.safeParse({ period: "custom" }).success).toBe(false)
    expect(AnalyticsQuery.safeParse({ period: "custom", from: "2026-10-06" }).success).toBe(false)
  })

  it("rejects text that is not a date", () => {
    for (const bad of ["06-10-2026", "2026/10/06", "dddd-dd-dd", "yesterday"])
      expect(
        AnalyticsQuery.safeParse({ period: "custom", from: bad, to: "2026-11-04" }).success,
      ).toBe(false)
  })

  it("leaves the fixed periods alone", () => {
    expect(AnalyticsQuery.parse({}).period).toBe("monthly")
    expect(AnalyticsQuery.safeParse({ period: "weekly" }).success).toBe(true)
  })
})
