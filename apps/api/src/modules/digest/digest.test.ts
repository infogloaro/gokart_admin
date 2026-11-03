import { describe, expect, it } from "vitest"
import { digestText, weekKey } from "./digest"

describe("weekly digest", () => {
  it("writes the figures and lists only alert types that happened", () => {
    const text = digestText(
      {
        alertsRaised: 4,
        alertsResolved: 2,
        alertsByKind: { delayed_order: 3, payment_failed: 1, vendor_issue: 0 },
        ridersApproved: 5,
        partnersApproved: 1,
        orders: 120,
        delivered: 110,
      },
      "2026-10-27",
      "2026-11-03",
    )
    expect(text).toContain("Orders: 120 placed, 110 delivered.")
    expect(text).toContain("delayed order: 3")
    expect(text).not.toContain("vendor issue")
  })

  it("keys each week by its Monday", () => {
    // Wednesday 4 Nov 2026 (IST) belongs to the week starting Monday 2 Nov.
    expect(weekKey(Date.parse("2026-11-04T06:00:00Z"))).toBe("2026-11-02")
  })
})
