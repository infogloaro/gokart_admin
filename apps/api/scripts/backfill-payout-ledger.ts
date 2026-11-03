// Posts every paid or settled payout that is not in the ledger yet. Safe to run more than once.
// Usage: pnpm --filter @zoauro/api exec tsx --env-file=.env scripts/backfill-payout-ledger.ts
import { prisma } from "../src/lib/prisma"
import { postPayoutToLedger } from "../src/modules/finance/ledger-posting"

const payouts = await prisma.payout.findMany({
  where: { status: { in: ["paid", "settled"] } },
  select: {
    code: true,
    accountType: true,
    accountId: true,
    amountPaise: true,
    paidRef: true,
    paidAt: true,
  },
})
let posted = 0
for (const payout of payouts) {
  const done = await prisma.$transaction((tx) =>
    postPayoutToLedger(tx, payout, payout.paidRef ?? payout.code, payout.paidAt ?? new Date()),
  )
  if (done) posted += 1
}
console.log(`Payouts checked: ${payouts.length}, newly posted to the ledger: ${posted}`)
await prisma.$disconnect()
