// Socket.IO for live updates. Browsers connect with the same session cookie as the REST
// API (through the web app's /socket.io proxy) and join one room per zone × business they
// may see, so an Admin never receives partners outside their scope.
import type { Server as HttpServer } from "node:http"
import type { Business, TrackingEvents } from "@zoauro/shared"
import { Server } from "socket.io"
import { env } from "../config/env"
import { findMemberContext } from "../modules/auth/auth.repository"
import { prisma } from "./prisma"
import { readSession, SESSION_COOKIE } from "./session"

let io: Server | null = null

export const room = (zoneId: string, business: Business) => `zone:${zoneId}:${business}`

function cookieValue(header: string | undefined, name: string) {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=")
    if (k === name) return decodeURIComponent(v.join("="))
  }
  return undefined
}

export function attachRealtime(server: HttpServer) {
  io = new Server(server, {
    path: "/socket.io",
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  })
  io.use(async (socket, next) => {
    try {
      const session = await readSession(
        cookieValue(socket.handshake.headers.cookie, SESSION_COOKIE),
      )
      const member = session && (await findMemberContext(session.memberId))
      if (!member) return next(new Error("unauthorized"))
      if (!member.permissions.includes("tracking.view")) return next(new Error("forbidden"))
      socket.data.member = member
      next()
    } catch (e) {
      next(e as Error)
    }
  })
  io.on("connection", async (socket) => {
    const m = socket.data.member as Awaited<ReturnType<typeof findMemberContext>> & {}
    const zoneIds =
      m.role === "super_admin"
        ? (await prisma.zone.findMany({ where: { active: true }, select: { id: true } })).map(
            (z) => z.id,
          )
        : m.zoneIds
    await socket.join(zoneIds.flatMap((z) => m.businesses.map((b) => room(z, b))))
  })
  return io
}

/** Sends an event to everyone watching any of the partner's businesses in that zone. */
export function emitToZone<E extends keyof TrackingEvents>(
  zoneId: string,
  businesses: Business[],
  event: E,
  payload: TrackingEvents[E],
) {
  if (!io || !businesses.length) return
  io.to(businesses.map((b) => room(zoneId, b))).emit(event, payload)
}

export const closeRealtime = () => io?.close()
