import { describe, expect, it } from "vitest"
import { window } from "./reports"

describe("yearly reporting window", () => {
  it("covers five calendar years starting on 1 January, Indian time", () => {
    // 4 Nov 2026 in India
    const now = Date.parse("2026-11-04T12:00:00+05:30")
    const w = window("yearly", now)
    expect(w.unit).toBe("year")
    expect(w.buckets).toBe(5)
    expect(w.first).toBe("2022-01-01")
    expect(w.from.toISOString()).toBe("2021-12-31T18:30:00.000Z")
  })
})
