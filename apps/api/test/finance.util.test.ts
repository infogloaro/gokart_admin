import { describe, expect, it } from "vitest"

import {
  accrualFactor,
  computeAdminEarnings,
  computePartnerEarnings,
  cycleRange,
  displayPayoutStatus,
  partnerPlanLabel,
} from "../src/modules/finance/finance.util.js"

describe("accrualFactor", () => {
  it("is exactly 1 for a full calendar month", () => {
    const factor = accrualFactor({
      start: new Date("2026-09-01T00:00:00Z"),
      end: new Date("2026-09-30T23:59:59Z"),
    })
    expect(factor).toBeCloseTo(1, 10)
  })

  it("prorates a partial month by days elapsed", () => {
    const factor = accrualFactor({
      start: new Date("2026-10-01T00:00:00Z"),
      end: new Date("2026-10-30T10:00:00Z"),
    })
    expect(factor).toBeCloseTo(30 / 31, 10)
    expect(Math.round(14000 * factor)).toBe(13548)
  })
})

describe("computePartnerEarnings", () => {
  it("combines salary, per-delivery, fee share, bonus and deductions", () => {
    const result = computePartnerEarnings({
      plan: { monthlySalary: 12000, fixedPay: 0, perDeliveryRate: 8, feeSharePercent: 0 },
      deliveries: 326,
      deliveryFees: 0,
      factor: 30 / 31,
      bonus: 750,
      deductions: 200,
    })
    expect(result.salary).toBe(11613)
    expect(result.perDelivery).toBe(2608)
    expect(result.earnings).toBe(11613 + 2608 + 750 - 200)
  })

  it("pays a percentage of delivery fees", () => {
    const result = computePartnerEarnings({
      plan: { monthlySalary: 0, fixedPay: 0, perDeliveryRate: 0, feeSharePercent: 60 },
      deliveries: 10,
      deliveryFees: 1000,
      factor: 1,
      bonus: 0,
      deductions: 0,
    })
    expect(result.commission).toBe(600)
  })
})

describe("computeAdminEarnings", () => {
  const plan = {
    monthlySalary: 45000,
    commissionPercent: 2,
    incentiveAmount: 8000,
    onTimeThreshold: 92,
  }
  const base = {
    plan,
    partners: 3,
    delivered: 100,
    managedPlatformRevenue: 100000,
    factor: 1,
    bonus: 0,
    deductions: 0,
  }

  it("books the incentive only when the cycle is closed and the target is met", () => {
    expect(computeAdminEarnings({ ...base, onTime: 93, cycleClosed: false }).incentive).toBe(0)
    expect(computeAdminEarnings({ ...base, onTime: 93, cycleClosed: true }).incentive).toBe(8000)
    expect(computeAdminEarnings({ ...base, onTime: 90, cycleClosed: true }).incentive).toBe(0)
  })
})

describe("payout helpers", () => {
  it("marks unpaid payouts past their due date as overdue", () => {
    const due = new Date("2026-10-05T00:00:00Z")
    const now = new Date("2026-10-30T00:00:00Z")
    expect(displayPayoutStatus("PENDING_APPROVAL", due, now)).toBe("Overdue")
    expect(displayPayoutStatus("APPROVED", due, now)).toBe("Overdue")
    expect(displayPayoutStatus("PAID", due, now)).toBe("Paid")
    expect(displayPayoutStatus("PENDING_APPROVAL", new Date("2026-11-05T00:00:00Z"), now)).toBe(
      "Pending approval",
    )
  })

  it("describes pay plans and cycles", () => {
    expect(
      partnerPlanLabel({
        monthlySalary: 14000,
        fixedPay: 0,
        perDeliveryRate: 10,
        feeSharePercent: 0,
      }),
    ).toBe("₹14,000/mo salary + ₹10/delivery")
    const closed = cycleRange("2026-09", new Date("2026-10-30T00:00:00Z"))
    expect(closed.open).toBe(false)
    expect(cycleRange("2026-10", new Date("2026-10-30T00:00:00Z")).open).toBe(true)
  })
})
