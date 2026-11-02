import { describe, expect, it } from "vitest"
import { INDIA_GEOGRAPHY } from "../src/modules/geography-catalog.js"
import { mergeGeography, parseGeoFilter } from "../src/modules/geography.js"

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

  it("requires a state when a district is given", () => {
    expect(parseGeoFilter({ state: "Kerala", district: "Ernakulam" })).toEqual({
      state: "Kerala",
      district: "Ernakulam",
    })
    expect(() => parseGeoFilter({ district: "Ernakulam" })).toThrow(/state is required/)
  })
})
