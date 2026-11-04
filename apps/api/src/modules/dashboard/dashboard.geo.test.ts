import { describe, expect, it } from "vitest"
import { allocateRiderCost, overallShare, rollUp, type ZoneFigures } from "./dashboard.geo"

const zone = (over: Partial<ZoneFigures>): ZoneFigures => ({
  zoneId: "z1",
  label: "Anna Nagar, Chennai",
  districtId: "d1",
  districtName: "Chennai",
  state: "Tamil Nadu",
  orders: 0,
  delivered: 0,
  cancelled: 0,
  grossPaise: 0,
  platformPaise: 0,
  zoneCostPaise: 0,
  deliveredInView: 0,
  deliveredAll: 0,
  timed: 0,
  onTime: 0,
  openOrders: 0,
  ridersAvailable: 0,
  ...over,
})

describe("allocateRiderCost", () => {
  it("splits a zone's cost by each business's share of deliveries", () => {
    expect(allocateRiderCost(10_000, 30, 100, 0.5)).toBe(3_000)
    expect(allocateRiderCost(10_000, 100, 100, 1)).toBe(10_000)
  })

  it("falls back to the overall share when a zone had no deliveries", () => {
    expect(allocateRiderCost(10_000, 0, 0, 1)).toBe(10_000)
    expect(allocateRiderCost(10_000, 0, 0, 0.25)).toBe(2_500)
  })
})

describe("overallShare", () => {
  it("is 1 when every business is in view, else the share of deliveries", () => {
    const zones = [
      zone({ deliveredInView: 30, deliveredAll: 100 }),
      zone({ deliveredInView: 10, deliveredAll: 20 }),
    ]
    expect(overallShare(zones, true)).toBe(1)
    expect(overallShare(zones, false)).toBeCloseTo(40 / 120)
    expect(overallShare([], false)).toBe(0)
  })
})

describe("rollUp", () => {
  const zones = [
    zone({
      orders: 10,
      delivered: 8,
      cancelled: 2,
      platformPaise: 50_000,
      zoneCostPaise: 20_000,
      deliveredInView: 8,
      deliveredAll: 8,
      timed: 8,
      onTime: 6,
      openOrders: 5,
      ridersAvailable: 2,
    }),
    zone({
      zoneId: "z2",
      label: "T Nagar, Chennai",
      orders: 5,
      delivered: 5,
      platformPaise: 30_000,
      zoneCostPaise: 40_000,
      deliveredInView: 5,
      deliveredAll: 5,
      timed: 5,
      onTime: 5,
      openOrders: 1,
      ridersAvailable: 4,
    }),
    zone({
      zoneId: "z3",
      label: "Kochi",
      districtId: "d9",
      districtName: "Ernakulam",
      state: "Kerala",
      orders: 4,
    }),
  ]

  it("groups by state with margin, rates and rider shortage", () => {
    const rows = rollUp(zones, "state", 1)
    const tn = rows.find((r) => r.key === "Tamil Nadu")!
    expect(tn).toMatchObject({
      zones: 2,
      orders: 15,
      platformPaise: 80_000,
      riderCostPaise: 60_000,
      marginPaise: 20_000,
      cancellationRate: 13.3,
      onTimeRate: 84.6,
      openOrders: 6,
      ridersAvailable: 6,
      riderShortage: 3, // only the first zone is short, by 3
    })
    expect(rows.map((r) => r.key).sort()).toEqual(["Kerala", "Tamil Nadu"])
  })

  it("returns a negative margin when rider cost exceeds platform revenue", () => {
    const row = rollUp([zones[1]!], "zone", 1)[0]!
    expect(row).toMatchObject({ key: "z2", marginPaise: -10_000 })
  })

  it("groups by district and by zone", () => {
    expect(
      rollUp(zones, "district", 1)
        .map((r) => r.key)
        .sort(),
    ).toEqual(["d1", "d9"])
    expect(rollUp(zones, "zone", 1)).toHaveLength(3)
  })

  it("reports no rates when there is nothing to divide", () => {
    const row = rollUp([zones[2]!], "zone", 1)[0]!
    expect(row.onTimeRate).toBeNull()
    expect(row.cancellationRate).toBe(0)
  })
})
