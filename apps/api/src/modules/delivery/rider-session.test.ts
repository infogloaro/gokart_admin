import { describe, expect, it } from "vitest"
import { generateAppPassword, hashAppPassword, verifyAppPassword } from "./rider-session"

describe("rider app passwords", () => {
  it("generates 12 characters without look-alike letters", () => {
    const password = generateAppPassword()
    expect(password).toHaveLength(12)
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/)
  })

  it("accepts the right password and rejects any other", () => {
    const password = generateAppPassword()
    const stored = hashAppPassword(password)
    expect(stored.startsWith("scrypt:")).toBe(true)
    expect(stored).not.toContain(password)
    expect(verifyAppPassword(password, stored)).toBe(true)
    expect(verifyAppPassword(`${password}x`, stored)).toBe(false)
    expect(verifyAppPassword(password.toLowerCase(), stored)).toBe(false)
  })

  it("salts each hash, so the same password never gives the same stored value", () => {
    expect(hashAppPassword("Sample1234AB")).not.toBe(hashAppPassword("Sample1234AB"))
  })

  it("rejects a stored value it does not recognise", () => {
    expect(verifyAppPassword("anything", "plain-text")).toBe(false)
    expect(verifyAppPassword("anything", "md5:abc:def")).toBe(false)
  })
})
