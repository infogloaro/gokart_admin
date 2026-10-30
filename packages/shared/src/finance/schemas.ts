// Pay plans and payouts. All amounts are integer paise.
import { z } from "zod"
import { Paise } from "../common/money"

export const PartnerPlan = z.object({
  salaryPaise: Paise.nonnegative(), // per month, accrued daily
  fixedPaise: Paise.nonnegative(), // per month, accrued daily
  perDeliveryPaise: Paise.nonnegative(),
  commissionPct: z.number().min(0).max(100), // of delivery fees earned
})
export type PartnerPlan = z.infer<typeof PartnerPlan>

export const AdminPlan = z.object({
  salaryPaise: Paise.nonnegative(),
  commissionPct: z.number().min(0).max(100), // of platform revenue from managed partners
  targetOnTimePct: z.number().min(0).max(100),
  incentivePaise: Paise.nonnegative(), // paid at cycle close when the target is met
})
export type AdminPlan = z.infer<typeof AdminPlan>

export const ACCOUNT_TYPES = ["partner", "admin"] as const
export const AccountType = z.enum(ACCOUNT_TYPES)
export type AccountType = z.infer<typeof AccountType>

export const PAYOUT_STATUSES = [
  "pending_approval",
  "approved",
  "paid",
  "settled",
  "rejected",
] as const
export const PayoutStatus = z.enum(PAYOUT_STATUSES)
export type PayoutStatus = z.infer<typeof PayoutStatus>

export const payoutFlow: Record<PayoutStatus, readonly PayoutStatus[]> = {
  pending_approval: ["approved", "rejected"],
  approved: ["paid", "rejected"],
  paid: ["settled"],
  settled: [],
  rejected: [],
}

export const PayoutLine = z.object({ label: z.string(), formula: z.string(), amountPaise: Paise })
export type PayoutLine = z.infer<typeof PayoutLine>

export const MarkPaidRequest = z.object({
  reference: z.string().trim().min(6, "Enter the bank UTR / reference"),
  method: z.string().trim().min(2),
  paidOn: z.iso.date(),
})
