import { describe, expect, it } from "vitest"

import { cn } from "../lib/cn.js"

describe("cn", () => {
  it("merges conflicting tailwind classes, keeping the last one", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4")
  })

  it("drops falsy values", () => {
    const hidden = false
    expect(cn("block", hidden && "hidden", undefined)).toBe("block")
  })
})
