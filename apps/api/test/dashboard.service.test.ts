import { describe, expect, it, vi } from "vitest"

import { createDashboardService } from "../src/modules/dashboard/dashboard.service.js"
import {
  buildTrendBuckets,
  distributionBucket,
  formatChange,
  formatInr,
  percentChange,
  previousRange,
} from "../src/modules/dashboard/dashboard.util.js"
import type { WorkspacePrincipal } from "../src/modules/dashboard/dashboard.types.js"

const principal: WorkspacePrincipal = { userId: "user-1" }

const workspace = { id: "ws-1", slug: "zoauro-food", name: "ZOAURO FOOD" }

function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    workspace: {
      findMany: vi.fn().mockResolvedValue([workspace]),
    },
    order: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { grossValue: 0, platformRevenue: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    vendor: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    deliveryPartner: {
      count: vi.fn().mockResolvedValue(0),
    },
    complaint: {
      count: vi.fn().mockResolvedValue(0),
    },
    refundCase: {
      aggregate: vi.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: 0 } }),
    },
    partnerDocument: {
      count: vi.fn().mockResolvedValue(0),
    },
    ...overrides,
  } as unknown as Parameters<typeof createDashboardService>[0]
}

describe("dashboard.util", () => {
  it("formatInr renders lakh and crore shorthand", () => {
    expect(formatInr(1_26_00_00_000)).toBe("₹126.00Cr")
    expect(formatInr(12_60_000)).toBe("₹12.6L")
    expect(formatInr(4500)).toBe("₹4,500")
  })

  it("percentChange and formatChange handle zero baselines", () => {
    expect(percentChange(0, 0)).toBe(0)
    expect(percentChange(10, 0)).toBe(100)
    expect(formatChange(110, 100)).toBe("+10.0%")
    expect(formatChange(90, 100)).toBe("-10.0%")
  })

  it("previousRange returns an equal-length preceding window", () => {
    const range = { start: new Date("2026-06-01T00:00:00Z"), end: new Date("2026-06-10T23:59:59Z") }
    const prior = previousRange(range)
    const rangeSpan = range.end.getTime() - range.start.getTime()
    const priorSpan = prior.end.getTime() - prior.start.getTime()
    expect(priorSpan).toBe(rangeSpan)
    expect(prior.end.getTime()).toBeLessThan(range.start.getTime())
  })

  it("buildTrendBuckets caps bucket count and spans the full range", () => {
    const range = { start: new Date("2026-06-01T00:00:00Z"), end: new Date("2026-06-30T23:59:59Z") }
    const buckets = buildTrendBuckets(range, 6)
    expect(buckets).toHaveLength(6)
    expect(buckets[0]!.start.getTime()).toBe(range.start.getTime())
    expect(buckets[buckets.length - 1]!.end.getTime()).toBe(range.end.getTime())
  })

  it("distributionBucket maps order statuses to UI buckets", () => {
    expect(distributionBucket("PLACED")).toBe("IN_PROGRESS")
    expect(distributionBucket("PREPARING")).toBe("IN_PROGRESS")
    expect(distributionBucket("ON_THE_WAY")).toBe("IN_PROGRESS")
    expect(distributionBucket("DELIVERED")).toBe("DELIVERED")
    expect(distributionBucket("CANCELLED")).toBe("CANCELLED")
    expect(distributionBucket("REFUNDED")).toBe("REFUNDED")
  })
})

describe("dashboard.service", () => {
  const range = { start: new Date("2026-06-01T00:00:00Z"), end: new Date("2026-06-18T23:59:59Z") }

  describe("getDashboard", () => {
    it("fails when the workspace slug is not accessible", async () => {
      const prisma = buildPrisma()
      const service = createDashboardService(prisma, async () => ["ws-1"])

      await expect(service.getDashboard(principal, "unknown-slug", range)).rejects.toMatchObject({
        status: 404,
      })
    })

    it("builds metrics, distribution, transactions and attention from repository data", async () => {
      const prisma = buildPrisma({
        order: {
          count: vi
            .fn()
            .mockResolvedValueOnce(120)
            .mockResolvedValueOnce(100)
            .mockResolvedValueOnce(18)
            .mockResolvedValueOnce(22),
          aggregate: vi
            .fn()
            .mockResolvedValueOnce({ _sum: { grossValue: 500000, platformRevenue: 85000 } })
            .mockResolvedValueOnce({ _sum: { grossValue: 400000, platformRevenue: 70000 } }),
          groupBy: vi.fn().mockResolvedValue([
            { status: "DELIVERED", _count: { _all: 72 } },
            { status: "CANCELLED", _count: { _all: 8 } },
            { status: "REFUNDED", _count: { _all: 4 } },
            { status: "ON_THE_WAY", _count: { _all: 16 } },
          ]),
          findMany: vi.fn().mockImplementation((args: { select?: Record<string, unknown> }) => {
            if (args.select?.orderNumber) {
              return Promise.resolve([
                {
                  id: "ord-1",
                  orderNumber: "ZOF-88219",
                  status: "ON_THE_WAY",
                  grossValue: 1240,
                  workspace: { slug: "zoauro-food" },
                  vendor: { name: "Saffron Table" },
                },
              ])
            }
            return Promise.resolve([])
          }),
        },
        vendor: {
          count: vi.fn().mockImplementation((args: { where: { approvalStatus: string } }) => {
            if (args.where.approvalStatus === "PENDING") return Promise.resolve(2)
            return Promise.resolve(14)
          }),
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: "v-1", createdAt: new Date(Date.now() - 2 * 86400000) }]),
        },
        deliveryPartner: { count: vi.fn().mockResolvedValue(9) },
        complaint: { count: vi.fn().mockResolvedValue(3) },
        refundCase: {
          aggregate: vi.fn().mockResolvedValue({ _count: { _all: 2 }, _sum: { amount: 18420 } }),
        },
        partnerDocument: { count: vi.fn().mockResolvedValue(5) },
      })

      const service = createDashboardService(prisma, async () => ["ws-1"])
      const result = await service.getDashboard(principal, "zoauro-food", range)

      expect(result.metrics[0]).toEqual({ label: "Total orders", value: "120", change: "+20.0%" })
      expect(result.metrics[3]).toEqual({ label: "Active vendors", value: "14", change: "—" })
      expect(result.metrics[7]).toEqual({
        label: "Pending approvals",
        value: "2",
        change: "Review",
      })

      const total = result.orderDistribution.reduce((sum, slice) => sum + slice.value, 0)
      expect(total).toBeGreaterThan(0)
      expect(result.orderDistribution.find((slice) => slice.label === "Delivered")?.value).toBe(72)

      expect(result.transactions).toEqual([
        {
          id: "ZOF-88219",
          vendor: "Saffron Table",
          status: "On The Way",
          tag: "FOOD",
          amount: "₹1,240",
        },
      ])

      expect(result.attention).toContainEqual(
        expect.objectContaining({ icon: "warning", title: "1 vendor approvals pending" }),
      )
      expect(result.attention).toContainEqual(
        expect.objectContaining({ icon: "refund", title: "2 refunds escalated" }),
      )
      expect(result.attention).toContainEqual(
        expect.objectContaining({ icon: "docs", title: "5 partner documents expiring" }),
      )
    })

    it("aggregates across every accessible workspace for the 'all' slug", async () => {
      const martWorkspace = { id: "ws-2", slug: "gloaro-mart", name: "GLOARO MART" }
      const prisma = buildPrisma({
        workspace: { findMany: vi.fn().mockResolvedValue([workspace, martWorkspace]) },
      })

      const service = createDashboardService(prisma, async () => ["ws-1", "ws-2"])
      const result = await service.getDashboard(principal, "all", range)

      expect(result.trend.series).toHaveLength(2)
      expect(result.trend.series.map((series) => series.label)).toEqual([
        "ZOAURO FOOD",
        "GLOARO MART",
      ])
    })
  })

  describe("getOverview", () => {
    it("derives SLA and satisfaction metrics from the order funnel", async () => {
      const placedAt = new Date("2026-06-05T10:00:00Z")
      const acceptedAt = new Date(placedAt.getTime() + 5 * 60000)
      const readyWithinSla = new Date(acceptedAt.getTime() + 10 * 60000)
      const readyOutsideSla = new Date(acceptedAt.getTime() + 60 * 60000)
      const deliveredWithinSla = new Date(acceptedAt.getTime() + 30 * 60000)

      const prisma = buildPrisma({
        order: {
          count: vi.fn().mockResolvedValueOnce(80).mockResolvedValueOnce(60),
          findMany: vi.fn().mockResolvedValue([
            {
              status: "DELIVERED",
              placedAt,
              acceptedAt,
              readyAt: readyWithinSla,
              deliveredAt: deliveredWithinSla,
              rating: 5,
            },
            {
              status: "DELIVERED",
              placedAt,
              acceptedAt,
              readyAt: readyOutsideSla,
              deliveredAt: null,
              rating: 3,
            },
            {
              status: "CANCELLED",
              placedAt,
              acceptedAt: null,
              readyAt: null,
              deliveredAt: null,
              rating: null,
            },
          ]),
        },
        complaint: { count: vi.fn().mockResolvedValue(1) },
      })

      const service = createDashboardService(prisma, async () => ["ws-1"])
      const result = await service.getOverview(principal, "zoauro-food", range)

      const byKey = Object.fromEntries(result.metrics.map((metric) => [metric.key, metric]))
      expect(byKey.acceptance!.value).toBe("66.7%")
      expect(byKey.prepSla!.value).toBe("50.0%")
      expect(byKey.deliveryCompletion!.value).toBe("100.0%")
      expect(byKey.satisfaction!.value).toBe("4.0 / 5")
      expect(result.insight).toContain("above last period")
    })
  })
})
