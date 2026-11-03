// Posts a payout to the ledger when it is paid: the payee's payable account is debited and the
// payouts cash account is credited, in one balanced transaction keyed by the payout code.
// Posting is idempotent, so retrying a payment or running the backfill never doubles an entry.
import type { Prisma } from "../../generated/prisma/client"

type PayoutLike = { code: string; accountType: string; accountId: string; amountPaise: number }

export async function postPayoutToLedger(
  tx: Prisma.TransactionClient,
  payout: PayoutLike,
  reference: string,
  at: Date,
) {
  const existing = await tx.ledgerTransaction.findFirst({
    where: { reference: payout.code, kind: `${payout.accountType}_payout` },
    select: { id: true },
  })
  if (existing) return false
  await tx.ledgerTransaction.create({
    data: {
      kind: `${payout.accountType}_payout`,
      reference: payout.code,
      memo: `Paid via ${reference}`,
      at,
      entries: {
        create: [
          {
            account: `payable:${payout.accountType}:${payout.accountId}`,
            debitPaise: payout.amountPaise,
            creditPaise: 0,
          },
          { account: "cash:payouts", debitPaise: 0, creditPaise: payout.amountPaise },
        ],
      },
    },
  })
  return true
}
