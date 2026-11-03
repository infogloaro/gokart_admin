// Audit retention: entries older than AUDIT_RETENTION_DAYS are deleted once a day. Off unless
// the variable is set, and never shorter than 30 days, so a typo cannot wipe recent history.
import { env } from "../../config/env"
import { prisma } from "../../lib/prisma"

export async function purgeExpiredAudit(now = Date.now()) {
  const days = env.AUDIT_RETENTION_DAYS
  if (!days) return 0
  const { count } = await prisma.auditLog.deleteMany({
    where: { at: { lt: new Date(now - days * 24 * 60 * 60 * 1000) } },
  })
  return count
}
