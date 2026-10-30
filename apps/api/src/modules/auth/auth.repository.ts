import { Permission, type MfaMethod } from "@zoauro/shared"
import { audit, type Actor } from "../../lib/audit"
import { prisma } from "../../lib/prisma"
import type { MemberContext } from "../../middleware/auth"

export const findMemberByEmail = (email: string) => prisma.member.findUnique({ where: { email } })
export const findMemberByPhone = (phone: string) => prisma.member.findUnique({ where: { phone } })

/** Everything needed to offer and check second-step methods. */
export const findMfaInfo = (id: string) =>
  prisma.member.findUnique({
    where: { id },
    select: {
      email: true,
      name: true,
      phone: true,
      phoneVerified: true,
      totpEnabled: true,
      totpSecret: true,
      totpLastStep: true,
      preferredMfa: true,
      _count: { select: { recoveryCodes: { where: { usedAt: null } } } },
    },
  })

export const findPasswordHash = (id: string) =>
  prisma.member.findUnique({ where: { id }, select: { passwordHash: true } })

export async function findMemberContext(id: string): Promise<MemberContext | null> {
  const m = await prisma.member.findUnique({
    where: { id },
    include: { businesses: true, zones: true, permissions: true },
  })
  if (!m || m.status !== "active") return null
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    businesses: m.businesses.map((b) => b.business),
    zoneIds: m.zones.map((z) => z.zoneId),
    // Ignore keys that no longer exist in packages/shared.
    permissions: m.permissions
      .map((p) => p.permission)
      .filter((p): p is Permission => Permission.safeParse(p).success),
  }
}

/** Records the sign-in and remembers the method for next time. */
export const recordSignIn = (actor: Actor, method: MfaMethod, via: "email" | "phone") =>
  prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: actor.id! },
      data: { lastLoginAt: new Date(), preferredMfa: method },
    })
    await audit(tx, actor, "auth.signed_in", { type: "member", id: actor.id! }, { method, via })
  })

export const recordSignOut = (actor: Actor) =>
  audit(prisma, actor, "auth.signed_out", { type: "member", id: actor.id! })

/** Turns the authenticator on with a fresh set of backup codes (replacing any old ones). */
export const enableTotp = (
  actor: Actor,
  memberId: string,
  encryptedSecret: string,
  acceptedStep: number,
  codeHashes: string[],
) =>
  prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: { totpSecret: encryptedSecret, totpEnabled: true, totpLastStep: acceptedStep },
    })
    await tx.memberRecoveryCode.deleteMany({ where: { memberId } })
    await tx.memberRecoveryCode.createMany({
      data: codeHashes.map((codeHash) => ({ memberId, codeHash })),
    })
    await audit(tx, actor, "auth.totp_enabled", { type: "member", id: memberId })
  })

export const replaceRecoveryCodes = (actor: Actor, memberId: string, codeHashes: string[]) =>
  prisma.$transaction(async (tx) => {
    await tx.memberRecoveryCode.deleteMany({ where: { memberId } })
    await tx.memberRecoveryCode.createMany({
      data: codeHashes.map((codeHash) => ({ memberId, codeHash })),
    })
    await audit(tx, actor, "auth.recovery_codes_regenerated", { type: "member", id: memberId })
  })

export const disableTotp = (actor: Actor, memberId: string) =>
  prisma.$transaction(async (tx) => {
    const m = await tx.member.update({
      where: { id: memberId },
      data: { totpSecret: null, totpEnabled: false, totpLastStep: null },
      select: { preferredMfa: true },
    })
    if (m.preferredMfa === "totp")
      await tx.member.update({ where: { id: memberId }, data: { preferredMfa: "email" } })
    await tx.memberRecoveryCode.deleteMany({ where: { memberId } })
    await audit(tx, actor, "auth.totp_disabled", { type: "member", id: memberId })
  })

/** Records an accepted authenticator code's time step. Only succeeds for a newer step,
 *  so the same code can't be accepted twice, even by two requests at once. */
export async function claimTotpStep(memberId: string, step: number) {
  const { count } = await prisma.member.updateMany({
    where: { id: memberId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  })
  return count === 1
}

/** Marks a backup code used. Only succeeds once per code. */
export async function useRecoveryCode(memberId: string, codeHash: string) {
  const { count } = await prisma.memberRecoveryCode.updateMany({
    where: { memberId, codeHash, usedAt: null },
    data: { usedAt: new Date() },
  })
  return count === 1
}

export const recordRecoveryUse = (actor: Actor, left: number) =>
  audit(prisma, actor, "auth.recovery_code_used", { type: "member", id: actor.id! }, { left })
