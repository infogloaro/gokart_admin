import { describe, expect, it } from "vitest"
import { redactAuditDetail } from "./audit"

describe("audit metadata redaction", () => {
  it("redacts sensitive values recursively while keeping safe event metadata", () => {
    expect(
      redactAuditDetail({
        method: "email",
        changes: { status: { before: "pending", after: "approved" } },
        credentials: { passwordHash: "hash", accessToken: "token" },
        authorization: "Bearer secret",
      }),
    ).toEqual({
      method: "email",
      changes: { status: { before: "pending", after: "approved" } },
      credentials: "[redacted]",
      authorization: "[redacted]",
    })
  })

  it("bounds large metadata and leaves historical null details readable", () => {
    expect(redactAuditDetail(null)).toBeNull()
    expect(redactAuditDetail({ value: "x".repeat(5000) })).toEqual({
      value: "x".repeat(4000),
    })
    expect(redactAuditDetail({ value: ["x".repeat(5000)] })).toEqual({
      value: ["x".repeat(4000)],
    })
  })
})
