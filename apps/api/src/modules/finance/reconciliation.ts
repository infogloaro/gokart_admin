// Reconciliation: checks every payout against its own lines, its payment record and the ledger.
// A payout is "clean" when it adds up, a paid payout carries a payment reference, a paid payout
// is posted to the ledger, and the posted amount matches. Read-only; nothing is changed here.
import { prisma } from "../../lib/prisma"

const STALE_APPROVAL_DAYS = 7
/** Payouts that have been paid out; a settled payout is one that was paid and cleared. */
const PAID = ["paid", "settled"]

export type ReconciliationRow = {
  id: string
  code: string
  accountType: string
  payee: string
  cycle: string
  status: string
  dueDate: string
  payoutPaise: number
  linesPaise: number
  /** Debits posted to the ledger against this payout, or null when nothing is posted. */
  ledgerPaise: number | null
  differencePaise: number
  issues: string[]
}

export type ReconciliationReport = {
  rows: ReconciliationRow[]
  summary: {
    payouts: number
    clean: number
    withIssues: number
    payoutPaise: number
    postedPaise: number
  }
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`

export async function reconcile(range: {
  from?: string
  to?: string
}): Promise<ReconciliationReport> {
  const dueDate =
    range.from || range.to
      ? {
          ...(range.from && { gte: new Date(range.from) }),
          ...(range.to && { lte: new Date(range.to) }),
        }
      : undefined
  const payouts = await prisma.payout.findMany({
    where: dueDate ? { dueDate } : {},
    include: { lines: true },
    orderBy: [{ dueDate: "desc" }, { code: "asc" }],
    take: 500,
  })

  const references = payouts.flatMap((payout) =>
    [payout.code, payout.paidRef].filter(Boolean),
  ) as string[]
  const transactions = references.length
    ? await prisma.ledgerTransaction.findMany({
        where: { reference: { in: references } },
        include: { entries: true },
      })
    : []

  const partnerIds = payouts.filter((p) => p.accountType === "partner").map((p) => p.accountId)
  const adminIds = payouts.filter((p) => p.accountType === "admin").map((p) => p.accountId)
  const [partners, admins] = await Promise.all([
    prisma.partner.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, name: true },
    }),
    prisma.member.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } }),
  ])
  const names = new Map([...partners, ...admins].map((row) => [row.id, row.name]))

  const staleBefore = Date.now() - STALE_APPROVAL_DAYS * 24 * 60 * 60 * 1000
  const rows = payouts.map((payout): ReconciliationRow => {
    const linesPaise = payout.lines.reduce((sum, line) => sum + line.amountPaise, 0)
    const keys = [payout.code, payout.paidRef].filter(Boolean)
    const posted = transactions.filter((tx) => keys.includes(tx.reference))
    const ledgerPaise = posted.length
      ? posted.reduce(
          (sum, tx) => sum + tx.entries.reduce((s, entry) => s + entry.debitPaise, 0),
          0,
        )
      : null

    const issues: string[] = []
    if (linesPaise !== payout.amountPaise)
      issues.push(
        `Lines add up to ${rupees(linesPaise)}, but the payout is ${rupees(payout.amountPaise)}.`,
      )
    if (PAID.includes(payout.status) && (!payout.paidRef || !payout.paidAt))
      issues.push("Marked paid without a payment reference or date.")
    if (PAID.includes(payout.status) && ledgerPaise === null)
      issues.push("Paid, but not posted to the ledger.")
    if (ledgerPaise !== null && ledgerPaise !== payout.amountPaise)
      issues.push(`The ledger shows ${rupees(ledgerPaise)} against this payout.`)
    if (
      payout.status === "approved" &&
      payout.approvedAt &&
      payout.approvedAt.getTime() < staleBefore
    )
      issues.push(`Approved more than ${STALE_APPROVAL_DAYS} days ago and still not paid.`)

    return {
      id: payout.id,
      code: payout.code,
      accountType: payout.accountType,
      payee: names.get(payout.accountId) ?? payout.accountId,
      cycle: payout.cycle,
      status: payout.status,
      dueDate: payout.dueDate.toISOString().slice(0, 10),
      payoutPaise: payout.amountPaise,
      linesPaise,
      ledgerPaise,
      differencePaise: ledgerPaise === null ? 0 : ledgerPaise - payout.amountPaise,
      issues,
    }
  })

  const withIssues = rows.filter((row) => row.issues.length > 0).length
  return {
    rows,
    summary: {
      payouts: rows.length,
      clean: rows.length - withIssues,
      withIssues,
      payoutPaise: rows.reduce((sum, row) => sum + row.payoutPaise, 0),
      postedPaise: rows.reduce((sum, row) => sum + (row.ledgerPaise ?? 0), 0),
    },
  }
}
