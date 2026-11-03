import { describe, expect, it } from "vitest"
import { INDIA_GEOGRAPHY } from "./modules/geography-catalog"
import { mergeGeography } from "./modules/geography"

describe("geography", () => {
  it("catalog covers all states and union territories", () => {
    expect(INDIA_GEOGRAPHY).toHaveLength(36)
    const names = INDIA_GEOGRAPHY.map((item) => item.state)
    expect(names).toEqual(expect.arrayContaining(["Tamil Nadu", "Ladakh", "Delhi"]))
    expect(INDIA_GEOGRAPHY.every((item) => item.districts.length > 0)).toBe(true)
  })

  it("merges data-derived entries into the catalog without duplicates", () => {
    const merged = mergeGeography(
      [{ state: "Kerala", districts: ["Ernakulam"] }],
      [
        { state: "Kerala", districts: ["Ernakulam", "Kochi Metro"] },
        { state: "Atlantis", districts: ["Core"] },
      ],
    )
    expect(merged).toEqual([
      { state: "Atlantis", districts: ["Core"] },
      { state: "Kerala", districts: ["Ernakulam", "Kochi Metro"] },
    ])
  })
})
