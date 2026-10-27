import { describe, expect, it } from "vitest"

import { BUSINESS_LABELS, businessSchema, orderStatusSchema } from "../src/index.js"

describe("businessSchema", () => {
  it("accepts the known business codes", () => {
    expect(businessSchema.parse("FOOD")).toBe("FOOD")
    expect(businessSchema.parse("MART")).toBe("MART")
  })

  it("has a label for every business code", () => {
    expect(Object.keys(BUSINESS_LABELS)).toEqual(businessSchema.options)
  })
})

describe("orderStatusSchema", () => {
  it("rejects a status that is not in the flow", () => {
    expect(() => orderStatusSchema.parse("SHIPPED")).toThrow()
  })
})
