import { describe, expect, it } from "vitest"

import { createApiClient } from "../src/index.js"

describe("createApiClient", () => {
  it("creates a typed fetch client scoped to the given base URL", () => {
    const client = createApiClient("http://localhost:4000")

    expect(typeof client.GET).toBe("function")
    expect(typeof client.POST).toBe("function")
  })
})
