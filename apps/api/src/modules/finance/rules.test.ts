import type { AdminPlan, PartnerPlan } from "@zoauro/shared"
import { describe, expect, it } from "vitest"
import {
  adminDayPay,
  adminIncentive,
  adminStatement,
  cycleDays,
  dayShare,
  dueDateFor,
  partnerDayPay,
  partnerStatement,
  planOn,
  type DayAccrual,
  type PartnerActivity,
} from "./rules"

const partnerPlan: PartnerPlan = {
  salaryPaise: 1_400_000,
  fixedPaise: 0,
  perDeliveryPaise: 1_000,
  commissionPct: 0,
}
const adminPlan: AdminPlan = {
  salaryPaise: 4_500_000,
  commissionPct: 2,
  targetOnTimePct: 92,
  incentivePaise: 800_000,
}
const activity = (deliveries: number, onTime = deliveries): PartnerActivity => ({
  deliveries,
  onTime,
  codPaise: deliveries * 15_000,
  feesPaise: deliveries * 3_800,
  revenuePaise: deliveries * 9_000,
})

function accrue(plan: PartnerPlan, days: string[], perDay = 10): DayAccrual[] {
  return days.map((day) => ({
    day,
    ...activity(perDay),
    ...partnerDayPay(plan, day, activity(perDay)),
  }))
}

describe("daily shares", () => {
  it("add up exactly to the monthly amount over a full month", () => {
    for (const cycle of ["2026-02", "2026-04", "2026-10"]) {
      const days = cycleDays(cycle, "2099-01-01")
      expect(days.reduce((t, d) => t + dayShare(1_400_000, d), 0)).toBe(1_400_000)
      expect(days.reduce((t, d) => t + dayShare(4_500_001, d), 0)).toBe(4_500_001)
    }
  })
  it("stop at today for the running cycle", () => {
    expect(cycleDays("2026-10", "2026-10-26")).toHaveLength(26)
  })
})

describe("plans", () => {
  it("use the latest version that started on or before the day", () => {
    const history = [
      { from: "2026-08-01", plan: "A" },
      { from: "2026-10-15", plan: "B" },
    ]
    expect(planOn(history, "2026-10-14")).toBe("A")
    expect(planOn(history, "2026-10-15")).toBe("B")
  })
})

describe("partner statement", () => {
  it("itemises salary and per-delivery pay with readable formulas", () => {
    const days = accrue(partnerPlan, cycleDays("2026-09", "2026-12-31"))
    const st = partnerStatement({
      cycle: "2026-09",
      today: "2026-10-26",
      history: [{ from: "2026-08-01", plan: partnerPlan }],
      days,
      adjustments: [
        {
          kind: "deduction",
          amountPaise: 30_000,
          reason: "Damaged packaging claim",
          day: "2026-09-22",
          by: "Arjun Menon",
        },
      ],
      remittedPaise: 0,
    })
    expect(st.parts.salary).toBe(1_400_000)
    expect(st.parts.incentive).toBe(30 * 10 * 1_000)
    expect(st.totalPaise).toBe(1_400_000 + 300_000 - 30_000)
    expect(st.lines.map((l) => l.label)).toEqual(["Salary", "Per-delivery incentive", "Deduction"])
    expect(st.lines[0]!.formula).toBe("₹14,000/month, accrued for 30 of 30 days")
    expect(st.outstandingPaise).toBe(st.codPaise)
  })

  it("accrues per day when the plan changes mid-cycle", () => {
    const raised = { ...partnerPlan, perDeliveryPaise: 3_500 }
    const history = [
      { from: "2026-08-01", plan: partnerPlan },
      { from: "2026-10-16", plan: raised },
    ]
    const days = cycleDays("2026-10", "2026-10-20").map((day) => {
      const a = activity(10)
      return { day, ...a, ...partnerDayPay(planOn(history, day), day, a) }
    })
    const st = partnerStatement({
      cycle: "2026-10",
      today: "2026-10-20",
      history,
      days,
      adjustments: [],
      remittedPaise: 0,
    })
    expect(st.parts.incentive).toBe(15 * 10 * 1_000 + 5 * 10 * 3_500)
    expect(st.lines.find((l) => l.label === "Per-delivery incentive")!.formula).toContain(
      "plan changed mid-cycle",
    )
  })

  it("rounds commission per day, not on the monthly total", () => {
    const plan = { salaryPaise: 0, fixedPaise: 0, perDeliveryPaise: 0, commissionPct: 55 }
    const a = { ...activity(1), feesPaise: 3_801 }
    expect(partnerDayPay(plan, "2026-10-01", a).commissionPaise).toBe(2_091) // 2090.55 → 2091
  })
})

describe("admin pay", () => {
  it("takes commission on managed partners' platform revenue", () => {
    expect(adminDayPay(adminPlan, "2026-10-01", activity(100)).commissionPaise).toBe(18_000)
  })
  it("pays the incentive only after the cycle closes and the target is met", () => {
    expect(adminIncentive(adminPlan, 100, 95, false)).toBe(0)
    expect(adminIncentive(adminPlan, 100, 95, true)).toBe(800_000)
    expect(adminIncentive(adminPlan, 100, 90, true)).toBe(0)
  })
  it("shows the incentive as pending in a running cycle", () => {
    const days = cycleDays("2026-10", "2026-10-26").map((day) => ({
      day,
      ...activity(100, 95),
      salaryPaise: dayShare(adminPlan.salaryPaise, day),
      fixedPaise: 0,
      incentivePaise: 0,
      commissionPaise: adminDayPay(adminPlan, day, activity(100)).commissionPaise,
      managedPartners: 3,
    }))
    const st = adminStatement({
      cycle: "2026-10",
      today: "2026-10-26",
      history: [{ from: "2026-08-01", plan: adminPlan }],
      days,
      adjustments: [],
    })
    expect(st.parts.incentive).toBe(0)
    expect(st.lines[2]!.formula).toMatch(
      /^Evaluated at cycle close · on-time 95.0% so far vs target 92%/,
    )
  })
})

it("payouts fall due on the 5th of the next month", () => {
  expect(dueDateFor("2026-10")).toBe("2026-11-05")
  expect(dueDateFor("2026-12")).toBe("2027-01-05")
})
