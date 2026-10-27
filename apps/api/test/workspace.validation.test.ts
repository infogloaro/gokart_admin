import { describe, expect, it } from "vitest"

import { parseWorkspaceId } from "../src/modules/workspace.validation.js"

describe("parseWorkspaceId", () => {
  it("accepts a valid workspaceId and trims whitespace", () => {
    expect(parseWorkspaceId({ workspaceId: " ws-1 " })).toEqual({ workspaceId: "ws-1" })
  })

  it.each([
    ["missing body", undefined],
    ["null body", null],
    ["non-object body", "ws-1"],
    ["missing field", {}],
    ["non-string field", { workspaceId: 123 }],
    ["blank field", { workspaceId: "   " }],
  ])("rejects %s", (_label, value) => {
    expect(() => parseWorkspaceId(value)).toThrowError(
      expect.objectContaining({ message: "workspaceId is required", status: 400 }),
    )
  })
})
