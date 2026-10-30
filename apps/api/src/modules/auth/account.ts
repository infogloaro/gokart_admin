// The signed-in member's own account: active sessions and notification preferences.
import { MemberPreferences, type SessionInfo } from "@zoauro/shared"
import type { Request, Response } from "express"
import { audit } from "../../lib/audit"
import { notFound, parse } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { destroyOtherSessions, destroySessionById, listSessions } from "../../lib/session"
import { actorOf, currentMember } from "../../middleware/auth"

export async function sessions(req: Request, res: Response) {
  const rows = await listSessions(currentMember(req).id, req.sessionToken)
  const body: SessionInfo[] = rows.map((s) => ({
    id: s.id,
    current: s.current,
    createdAt: new Date(s.createdAt).toISOString(),
    userAgent: s.userAgent ?? null,
    ip: s.ip ?? null,
  }))
  res.json(body)
}

export async function endSession(req: Request<{ id: string }>, res: Response) {
  const member = currentMember(req)
  const ok = await destroySessionById(member.id, req.params.id)
  if (!ok) throw notFound("Session")
  await audit(prisma, actorOf(req), "auth.session_ended", { type: "member", id: member.id })
  res.status(204).end()
}

export async function endOtherSessions(req: Request, res: Response) {
  const member = currentMember(req)
  const ended = await destroyOtherSessions(member.id, req.sessionToken)
  await audit(
    prisma,
    actorOf(req),
    "auth.other_sessions_ended",
    { type: "member", id: member.id },
    { ended },
  )
  res.json({ ended })
}

export async function preferences(req: Request, res: Response) {
  const m = await prisma.member.findUniqueOrThrow({
    where: { id: currentMember(req).id },
    select: { preferences: true },
  })
  res.json(MemberPreferences.parse(m.preferences ?? {}))
}

export async function savePreferences(req: Request, res: Response) {
  const body = parse(MemberPreferences, req.body)
  const member = currentMember(req)
  await prisma.$transaction(async (tx) => {
    await tx.member.update({ where: { id: member.id }, data: { preferences: body } })
    await audit(
      tx,
      actorOf(req),
      "member.preferences_updated",
      { type: "member", id: member.id },
      body,
    )
  })
  res.json(body)
}
