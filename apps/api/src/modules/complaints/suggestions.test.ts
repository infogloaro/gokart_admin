import { describe, expect, it } from "vitest"
import { suggestComplaintHandling } from "./suggestions"

describe("complaint handling suggestions", () => {
  it("starts from the category's usual priority", () => {
    expect(
      suggestComplaintHandling({ category: "late_delivery", claimPaise: null, text: "late" })
        .priority,
    ).toBe("medium")
    expect(
      suggestComplaintHandling({ category: "not_delivered", claimPaise: null, text: "" }).priority,
    ).toBe("high")
  })

  it("makes large refund claims urgent", () => {
    expect(
      suggestComplaintHandling({ category: "missing_item", claimPaise: 150_000, text: "" })
        .priority,
    ).toBe("urgent")
  })

  it("raises a small refund claim to high", () => {
    expect(
      suggestComplaintHandling({ category: "late_delivery", claimPaise: 5_000, text: "" }).priority,
    ).toBe("high")
  })

  it("makes health and safety mentions urgent", () => {
    const result = suggestComplaintHandling({
      category: "quality",
      claimPaise: null,
      text: "I felt sick after eating, there was glass in it",
    })
    expect(result.priority).toBe("urgent")
    expect(result.reasons.join(" ")).toContain("health or safety")
  })

  it("always offers at least one reply", () => {
    for (const category of ["late_delivery", "damaged", "payment", "partner_behaviour"] as const)
      expect(
        suggestComplaintHandling({ category, claimPaise: null, text: "" }).replies.length,
      ).toBeGreaterThan(0)
  })
})
