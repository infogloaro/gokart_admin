import { describe, expect, it } from "vitest"
import { adminsCsv } from "./system"

describe("Admin account CSV export", () => {
  it("exports account scope and protects spreadsheet formula values", () => {
    const csv = adminsCsv([
      {
        id: "member-1",
        name: '=HYPERLINK("https://example.test")',
        email: "admin@example.test",
        status: "active",
        businesses: ["food"],
        zones: [
          {
            id: "zone-1",
            district: "Chennai",
            city: "Chennai",
            location: "T. Nagar",
          },
        ],
        permissions: ["orders.view"],
        authenticatorEnabled: false,
        createdAt: "2026-10-29T10:00:00.000Z",
        lastLoginAt: null,
      },
    ])

    expect(csv).toContain('"Admin ID","Name","Email","Status"')
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"')
    expect(csv).toContain("Chennai / Chennai / T. Nagar (zone-1)")
    expect(csv).toContain('"orders.view"')
    expect(csv).toContain('"No","2026-10-29T10:00:00.000Z",""')
  })
})
