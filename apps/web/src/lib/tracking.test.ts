import type { TrackedLocation } from "@zoauro/shared"
import { describe, expect, it } from "vitest"
import { hasValidLocation, isStaleLocation } from "./tracking"

const location = (overrides: Partial<TrackedLocation> = {}): TrackedLocation => ({
  lat: 12.9716,
  lng: 77.5946,
  speedKmh: null,
  heading: null,
  at: new Date(820_000).toISOString(),
  ...overrides,
})

describe("tracking location helpers", () => {
  it("accepts only finite geographic coordinates", () => {
    expect(hasValidLocation(location())).toBe(true)
    expect(hasValidLocation(location({ lat: 91 }))).toBe(false)
    expect(hasValidLocation(location({ lng: Number.NaN }))).toBe(false)
    expect(hasValidLocation(null)).toBe(false)
  })

  it("marks a location stale only after the configured 180-second threshold", () => {
    expect(isStaleLocation(location(), 1_000_000)).toBe(false)
    expect(isStaleLocation(location(), 1_000_001)).toBe(true)
  })

  it("treats an invalid or future timestamp as stale", () => {
    expect(isStaleLocation(location({ at: "not-a-date" }), 1_000_000)).toBe(true)
    expect(isStaleLocation(location({ at: new Date(1_000_001).toISOString() }), 1_000_000)).toBe(
      true,
    )
  })
})
