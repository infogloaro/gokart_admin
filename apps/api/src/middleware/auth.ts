// Every protected route runs requireAuth, then requirePermission. Zone and
// business scoping are applied in services through `scope(req)`.
import type { Business, Permission, Role } from "@zoauro/shared"
import type { RequestHandler, Request } from "express"
import { forbidden, unauthorized } from "../lib/errors"
import { SESSION_COOKIE, readSession } from "../lib/session"
import type { Actor } from "../lib/audit"
import { findMemberContext } from "../modules/auth/auth.repository"

export type MemberContext = {
  id: string
  name: string
  email: string
  role: Role
  businesses: Business[]
  /** Empty for Super Admins, meaning every zone. */
  zoneIds: string[]
  permissions: Permission[]
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      member?: MemberContext
      sessionToken?: string
      deliveryFleetId?: string
      riderBoyId?: string
      riderSessionToken?: string
    }
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined
  const session = await readSession(token)
  if (!session) throw unauthorized()
  const member = await findMemberContext(session.memberId)
  if (!member) throw unauthorized("Your account is no longer active.")
  req.member = member
  req.sessionToken = token
  next()
}

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.member?.permissions.includes(permission)) throw forbidden()
    next()
  }

export function currentMember(req: Request): MemberContext {
  if (!req.member) throw unauthorized()
  return req.member
}

export const actorOf = (req: Request): Actor => ({
  id: req.member?.id ?? null,
  name: req.member?.name ?? "Anonymous",
  role: req.member?.role,
  source: auditSource(req),
  userAgent: req.get("user-agent")?.slice(0, 512),
  ip: req.ip,
})

export function auditSource(req: Request): Actor["source"] {
  const source = req.get("x-client-source")
  return source === "web" || source === "mobile_app" || source === "api" ? source : undefined
}

/** Business and zone limits for queries. `zoneIds: null` means no zone limit. */
export function scope(req: Request, business?: Business) {
  const m = currentMember(req)
  if (business && !m.businesses.includes(business))
    throw forbidden("You don't have access to that business.")
  return {
    businesses: business ? [business] : m.businesses,
    zoneIds: m.role === "super_admin" ? null : m.zoneIds,
  }
}
