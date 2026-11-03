import { describe, expect, it } from "vitest"
import { judge, usualCount } from "./insights"

describe("zone order insights", () => {
  it("computes the usual count and spread", () => {
    expect(usualCount([10, 10, 10, 10])).toEqual({ mean: 10, sd: 0 })
    expect(usualCount([])).toEqual({ mean: 0, sd: 0 })
  })

  it("flags a day well above the usual count", () => {
    const history = [10, 12, 9, 11, 10, 10, 12, 9]
    expect(judge(40, history).flagged).toBe(true)
    expect(judge(40, history).reason).toContain("usually about 10")
  })

  it("does not flag an ordinary day or a tiny count", () => {
    const history = [10, 12, 9, 11, 10, 10, 12, 9]
    expect(judge(12, history).flagged).toBe(false)
    expect(judge(3, [0, 0, 0, 0]).flagged).toBe(false)
  })
})

describe("quiet zones", () => {
  it("does not flag a quiet zone for a small day", () => {
    expect(judge(9, [0, 0, 1, 0, 0, 0, 0, 0]).flagged).toBe(false)
    expect(judge(12, [0, 0, 1, 0, 0, 0, 0, 0]).flagged).toBe(true)
  })
})
