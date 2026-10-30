import { describe, expect, it, vi } from "vitest"

import { createDashboardService } from "../src/modules/dashboard/dashboard.service.js"
import { parseRevenueQuery } from "../src/modules/dashboard/dashboard.validation.js"
import type { WorkspacePrincipal } from "../src/modules/dashboard/dashboard.types.js"

const principal: WorkspacePrincipal = { userId: "user-1" }
const mart = { id: "ws-2", slug: "gloaro-mart", name: "GLOARO MART" }
const range = { start: new Date("2026-06-01T00:00:00Z"), end: new Date("2026-06-18T23:59:59Z") }

function buildPrisma(workspaces = [mart]) {
  return {
    workspace: { findMany: vi.fn().mockResolvedValue(workspaces) },
    order: {
      aggregate: vi
        .fn()
        .mockResolvedValueOnce({
          _count: { _all: 100 },
          _sum: {
            grossValue: 500000,
            platformRevenue: 85000,
            commissionAmount: 59500,
            deliveryFeeAmount: 17850,
          },
        })
        .mockResolvedValueOnce({
          _count: { _all: 80 },
          _sum: {
            grossValue: 400000,
            platformRevenue: 68000,
            commissionAmount: 47600,
            deliveryFeeAmount: 14280,
          },
        }),
      findMany: vi.fn().mockImplementation((args: { select?: Record<string, unknown> }) => {
        if (args.select?.orderNumber) {
          return Promise.resolve([
            {
              id: "ord-1",
              orderNumber: "GLM-46093",
              customerName: "Siddharth M.",
              status: "ON_THE_WAY",
              paymentStatus: "PAID",
              grossValue: 3890,
              workspace: { name: "GLOARO MART" },
              vendor: { name: "Northstar Essentials" },
              deliveryPartner: { name: "Pooja Nair" },
            },
          ])
        }
        return Promise.resolve([
          { placedAt: new Date("2026-06-02T10:00:00Z"), grossValue: 3000, platformRevenue: 510 },
          { placedAt: new Date("2026-06-17T10:00:00Z"), grossValue: 1000, platformRevenue: 170 },
        ])
      }),
    },
  } as unknown as Parameters<typeof createDashboardService>[0]
}

describe("dashboard.service getRevenue", () => {
  it("builds metrics, composition, sales series and transactions for one business", async () => {
    const service = createDashboardService(buildPrisma(), async () => ["ws-2"])
    const result = await service.getRevenue(principal, "all", "gloaro-mart", range)

    expect(result.business).toEqual({ slug: "gloaro-mart", name: "GLOARO MART" })
    expect(result.metrics.map((metric) => metric.label)).toEqual([
      "Gross order value",
      "Platform revenue",
      "Orders",
      "Avg order value",
      "Commission earned",
      "Delivery fees",
    ])
    expect(result.metrics[2]).toEqual({ label: "Orders", value: "100", change: "+25.0%" })
    expect(result.metrics[3]).toEqual({
      label: "Avg order value",
      value: "₹5,000",
      change: "+0.0%",
    })

    expect(result.composition).toEqual([
      { label: "Commission", value: 70 },
      { label: "Delivery fees", value: 21 },
      { label: "Other fees", value: 9 },
    ])

    expect(result.sales.series.map((series) => series.label)).toEqual([
      "Gross value",
      "Platform revenue",
    ])
    expect(result.sales.days.length).toBe(result.sales.series[0]!.points.length)

    expect(result.transactions).toEqual([
      {
        id: "GLM-46093",
        customer: "Siddharth M.",
        business: "GLOARO MART",
        vendor: "Northstar Essentials",
        partner: "Pooja Nair",
        payment: "Paid",
        status: "On The Way",
        amount: "₹3,890",
      },
    ])
  })

  it("returns 404 when the business is outside the accessible workspaces", async () => {
    const service = createDashboardService(buildPrisma(), async () => ["ws-2"])

    await expect(service.getRevenue(principal, "all", "zoauro-food", range)).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe("parseRevenueQuery", () => {
  it("requires the business query parameter", () => {
    expect(() => parseRevenueQuery({ workspaceId: "all" }, {})).toThrow("business is required")
  })

  it("returns the business slug alongside the date range", () => {
    const parsed = parseRevenueQuery(
      { workspaceId: "all" },
      { business: " gloaro-mart ", start: "2026-06-01", end: "2026-06-18" },
    )
    expect(parsed.businessSlug).toBe("gloaro-mart")
    expect(parsed.workspaceSlug).toBe("all")
  })
})
