import { describe, expect, it } from "vitest"
import { scoreVendor } from "./scorecard"

const at = (minutesAfterOrder: number) => {
  const placedAt = new Date("2026-11-01T10:00:00Z")
  return { placedAt, deliveredAt: new Date(placedAt.getTime() + minutesAfterOrder * 60_000) }
}

describe("vendor scorecards", () => {
  it("is healthy when orders arrive on time and few are cancelled", () => {
    const score = scoreVendor({
      business: "food",
      orders: [
        { status: "delivered", ...at(20) },
        { status: "delivered", ...at(25) },
        { status: "delivered", ...at(30) },
      ],
      complaints: 0,
    })
    expect(score.onTimePct).toBe(1)
    expect(score.needsAttention).toBe(false)
  })

  it("flags slow, cancelling, or complained-about vendors with a reason each", () => {
    const score = scoreVendor({
      business: "food",
      orders: [
        { status: "delivered", ...at(90) },
        { status: "cancelled", ...at(5) },
        { status: "delivered", ...at(20) },
      ],
      complaints: 6,
    })
    expect(score.needsAttention).toBe(true)
    expect(score.reasons.length).toBe(3)
  })

  it("has no on-time figure before anything is delivered", () => {
    expect(scoreVendor({ business: "mart", orders: [], complaints: 0 }).onTimePct).toBeNull()
  })
})
