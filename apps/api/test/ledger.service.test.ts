import { describe, expect, it, vi } from "vitest"

import { createLedgerService } from "../src/modules/ledger/ledger.service.js"
import type { WorkspacePrincipal } from "../src/modules/ledger/ledger.types.js"

const principal: WorkspacePrincipal = { userId: "user-1" }
const workspace = { id: "ws-1", slug: "zoauro-food", name: "ZOAURO FOOD" }

function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    workspace: {
      findMany: vi.fn().mockResolvedValue([workspace]),
    },
    transaction: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { grossAmount: 0, commissionAmount: 0, deliveryFeeAmount: 0, netAmount: 0 },
      }),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as Parameters<typeof createLedgerService>[0]
}

describe("ledger.service", () => {
  const range = { start: new Date("2026-06-01T00:00:00Z"), end: new Date("2026-06-18T23:59:59Z") }

  describe("getSummary", () => {
    it("fails when the workspace slug is not accessible", async () => {
      const prisma = buildPrisma()
      const service = createLedgerService(prisma, async () => ["ws-1"])

      await expect(service.getSummary(principal, "unknown-slug", range)).rejects.toMatchObject({
        status: 404,
      })
    })

    it("computes summary cards and payment-method percentages", async () => {
      const prisma = buildPrisma({
        transaction: {
          aggregate: vi
            .fn()
            .mockResolvedValueOnce({
              _sum: {
                grossAmount: 100000,
                commissionAmount: 11050,
                deliveryFeeAmount: 5950,
                netAmount: 83000,
              },
            })
            .mockResolvedValueOnce({
              _sum: {
                grossAmount: 80000,
                commissionAmount: 10000,
                deliveryFeeAmount: 5000,
                netAmount: 65000,
              },
            })
            .mockResolvedValueOnce({ _sum: { grossAmount: 1900 } }),
          groupBy: vi.fn().mockResolvedValue([
            { paymentMethod: "UPI", _sum: { grossAmount: 42800 } },
            { paymentMethod: "CARD", _sum: { grossAmount: 31400 } },
            { paymentMethod: "COD", _sum: { grossAmount: 18600 } },
            { paymentMethod: "NET_BANKING", _sum: { grossAmount: 5200 } },
            { paymentMethod: "WALLET", _sum: { grossAmount: 2000 } },
          ]),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })

      const service = createLedgerService(prisma, async () => ["ws-1"])
      const result = await service.getSummary(principal, "zoauro-food", range)

      expect(result.grossOrderValue).toEqual({ value: "₹1.0L", caption: "Not platform profit" })
      expect(result.platformCommission.value).toBe("₹11,050")
      expect(result.platformCommission.caption).toBe("+10.5%")
      expect(result.deliveryFees.caption).toBe("+19.0%")
      expect(result.refunds).toEqual({ value: "₹1,900", caption: "1.9% of GTV" })
      expect(result.netPlatformRevenue.value).toBe(
        "₹" + (11050 + 5950 - 1900).toLocaleString("en-IN"),
      )

      const upi = result.paymentMethods.find((method) => method.key === "UPI")!
      expect(upi.percent).toBe(42.8)
      const wallet = result.paymentMethods.find((method) => method.key === "WALLET")!
      expect(wallet.percent).toBe(2)
    })
  })

  describe("getTransactions", () => {
    it("maps repository rows to display-ready ledger rows", async () => {
      const prisma = buildPrisma({
        transaction: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { grossAmount: 0, commissionAmount: 0, deliveryFeeAmount: 0 },
          }),
          groupBy: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(2),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "t-1",
              transactionCode: "TXN-773840",
              reference: "ZOF-88219",
              type: "ORDER_PAYMENT",
              counterparty: "Saffron Table",
              paymentMethod: "UPI",
              grossAmount: 1240,
              commissionAmount: 190,
              deliveryFeeAmount: 81,
              netAmount: 969,
              workspace: { slug: "zoauro-food" },
            },
            {
              id: "t-2",
              transactionCode: "REF-002841",
              reference: "ZOF-88217",
              type: "REFUND",
              counterparty: "Isha P.",
              paymentMethod: "UPI",
              grossAmount: 720,
              commissionAmount: 0,
              deliveryFeeAmount: 0,
              netAmount: -720,
              workspace: { slug: "zoauro-food" },
            },
          ]),
        },
      })

      const service = createLedgerService(prisma, async () => ["ws-1"])
      const result = await service.getTransactions(principal, "zoauro-food", range, {}, 1, 8)

      expect(result.total).toBe(2)
      expect(result.items[0]).toEqual({
        id: "t-1",
        code: "TXN-773840",
        tag: "FOOD",
        reference: "ZOF-88219",
        type: "ORDER_PAYMENT",
        typeLabel: "Order Payment",
        counterparty: "Saffron Table",
        paymentMethod: "UPI",
        gross: "₹1,240",
        fee: "₹271",
        net: "₹969",
        isNegative: false,
      })
      expect(result.items[1]).toEqual({
        id: "t-2",
        code: "REF-002841",
        tag: "FOOD",
        reference: "ZOF-88217",
        type: "REFUND",
        typeLabel: "Refund",
        counterparty: "Isha P.",
        paymentMethod: "UPI",
        gross: "₹720",
        fee: "₹0",
        net: "-₹720",
        isNegative: true,
      })
    })
  })
})
