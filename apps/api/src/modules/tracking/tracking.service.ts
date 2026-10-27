// Availability rules and live locations.
//
//   offline      — the shift ended, an Admin took the partner offline, or no ping for
//                  STALE_AFTER_SECONDS.
//   available    — on shift and carrying nothing.
//   on_delivery  — on shift and carrying an order (assigned, picked up, out for delivery).
//
// "On delivery" is never set by hand: it follows the partner's orders.
import {
  canTransition,
  orderStatusLabel,
  STALE_AFTER_SECONDS,
  type Business,
  type LocationPing,
  type OrderStatus,
  type PartnerAvailability,
  type TrackedLocation,
  type TrackedPartner,
} from "@zoauro/shared"
import type { Actor } from "../../lib/audit"
import { badRequest, forbidden, notFound } from "../../lib/errors"
import { emitToZone } from "../../lib/realtime"
import * as orders from "../orders/orders.repository"
import * as repo from "./tracking.repository"

type Scope = { businesses: Business[]; zoneIds: string[] | null }

const businessesOf = (p: repo.TrackedRow) => p.businesses.map((b) => b.business)

function inScope(p: repo.TrackedRow, scope: Scope) {
  return (
    businessesOf(p).some((b) => scope.businesses.includes(b)) &&
    (!scope.zoneIds || scope.zoneIds.includes(p.zoneId))
  )
}

async function announce(p: repo.TrackedRow) {
  const current = (await repo.carrying([p.id])).get(p.id)
  emitToZone(p.zoneId, businessesOf(p), "partner:availability", {
    partnerId: p.id,
    zoneId: p.zoneId,
    availability: p.availability,
    currentOrderCode: current?.code ?? null,
  })
}

/**
 * Re-derives availability for an on-shift partner from the orders they carry. Partners
 * who are offline stay offline: only a new shift (or an Admin) brings them back.
 */
export async function refreshAvailability(partnerId: string) {
  const p = await repo.findById(partnerId)
  if (!p || p.status !== "active" || p.availability === "offline") return
  const carrying = (await repo.carrying([p.id])).has(p.id)
  const next: PartnerAvailability = carrying ? "on_delivery" : "available"
  if (next !== p.availability) await announce(await repo.setAvailability(p.id, next))
}

async function approvedByCode(code: string) {
  const p = await repo.findByCode(code)
  if (!p) throw notFound("Delivery partner")
  if (p.status !== "active")
    throw forbidden("Only approved partners can go online or report a location.")
  return p
}

// ---- intake (partner app) ----

export async function shift(code: string, action: "start" | "end") {
  const p = await approvedByCode(code)
  if (action === "end") {
    if (p.availability === "on_delivery")
      throw badRequest("Finish or hand over the current order before ending the shift.")
    if (p.availability !== "offline") await announce(await repo.setAvailability(p.id, "offline"))
    await repo.forgetSeen(p.id)
  } else {
    if (p.availability === "offline") await repo.setAvailability(p.id, "available")
    await refreshAvailability(p.id)
    const after = await repo.findById(p.id)
    if (after) await announce(after)
  }
  return { code: p.code, availability: (await repo.findById(p.id))!.availability }
}

export async function recordLocation(code: string, ping: LocationPing) {
  const p = await approvedByCode(code)
  if (p.availability === "offline")
    throw badRequest("Start a shift before sending locations.", { shift: ["Offline"] })
  const loc: TrackedLocation = {
    lat: ping.lat,
    lng: ping.lng,
    speedKmh: ping.speedKmh ?? null,
    heading: ping.heading ?? null,
    at: ping.at ?? new Date().toISOString(),
  }
  await Promise.all([repo.saveLatest(p.id, loc), repo.appendHistory(p.id, loc)])
  emitToZone(p.zoneId, businessesOf(p), "partner:location", {
    partnerId: p.id,
    zoneId: p.zoneId,
    location: loc,
  })
  return { received: true }
}

const partnerActor = (p: { id: string; name: string }): Actor => ({
  id: null,
  name: `Partner app · ${p.name}`,
})

/** The app accepting a ready order, or reporting progress on one it carries. */
export async function orderProgress(orderCode: string, partnerCode: string, to: OrderStatus) {
  const p = await approvedByCode(partnerCode)
  const o = await repo.findOrder(orderCode)
  if (!o) throw notFound("Order")
  if (!businessesOf(p).includes(o.business))
    throw forbidden("This partner doesn't deliver for that business.")

  if (to === "assigned") {
    if (p.availability !== "available")
      throw badRequest("The partner must be online and free to accept an order.")
    if (o.zoneId !== p.zoneId) throw forbidden("That order is outside the partner's service area.")
    if (o.status !== "ready") throw badRequest("Only orders that are ready can be accepted.")
    await repo.assignOrder(o, p.id, partnerActor(p))
  } else {
    if (o.partnerId !== p.id) throw forbidden("This order is assigned to another partner.")
    if (!["picked_up", "out_for_delivery", "delivered"].includes(to))
      throw badRequest("The partner app can only report pickup, departure or delivery.")
    if (!canTransition(o.business, o.status, to))
      throw badRequest(
        `An order that is “${orderStatusLabel(o.business, o.status)}” can't move to “${orderStatusLabel(o.business, to)}”.`,
      )
    await orders.changeStatus(o, o.version, to, partnerActor(p))
  }
  await refreshAvailability(p.id)
  const after = await repo.findOrder(orderCode)
  return { code: o.code, status: after!.status }
}

/** Marks partners offline when their last ping is older than STALE_AFTER_SECONDS. */
export async function sweepStale(now = Date.now()) {
  const stale = await repo.staleSince(now - STALE_AFTER_SECONDS * 1000)
  for (const id of stale) {
    await repo.forgetSeen(id)
    const p = await repo.findById(id)
    // A partner mid-delivery keeps that status; the Admin sees the stale "last seen".
    if (p && p.availability === "available")
      await announce(await repo.setAvailability(id, "offline"))
  }
  return stale.length
}

// ---- portals ----

export async function zones(scope: Scope) {
  const rows = await repo.zones(scope.zoneIds)
  return rows
    .filter((z) => z.lat !== null && z.lng !== null)
    .map((z) => ({
      id: z.id,
      name: `${z.location}, ${z.city}`,
      district: z.district,
      lat: z.lat!,
      lng: z.lng!,
    }))
}

function toTracked(
  p: repo.TrackedRow,
  current: Awaited<ReturnType<typeof repo.carrying>>,
  locations: Map<string, TrackedLocation>,
): TrackedPartner {
  const o = current.get(p.id)
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    phone: p.phone,
    businesses: businessesOf(p),
    zoneId: p.zoneId,
    zoneName: `${p.zone.location}, ${p.zone.city}`,
    vehicleType: p.vehicleType,
    vehicleNumber: p.vehicleNumber,
    availability: p.availability,
    currentOrder: o ? { id: o.id, code: o.code, business: o.business, status: o.status } : null,
    location: locations.get(p.id) ?? null,
  }
}

export async function partners(scope: Scope, zoneId?: string) {
  const rows = await repo.listApproved({ ...scope, zoneId })
  const ids = rows.map((p) => p.id)
  const [current, locations] = await Promise.all([repo.carrying(ids), repo.latest(ids)])
  return rows.map((p) => toTracked(p, current, locations))
}

async function loadInScope(id: string, scope: Scope) {
  const p = await repo.findById(id)
  if (!p || !inScope(p, scope)) throw notFound("Delivery partner")
  return p
}

export async function trail(id: string, scope: Scope, minutes: number) {
  const p = await loadInScope(id, scope)
  const points = await repo.trail(p.id, new Date(Date.now() - minutes * 60_000))
  return points.map((x) => ({ lat: x.lat, lng: x.lng, at: x.at.toISOString() }))
}

/** Admins and Super Admins taking a partner offline or bringing them back online. */
export async function override(
  id: string,
  scope: Scope,
  input: { availability: "available" | "offline"; reason: string },
  actor: Actor,
) {
  const p = await loadInScope(id, scope)
  if (p.status !== "active") throw badRequest("Only approved partners have an availability.")
  if (p.availability === input.availability)
    throw badRequest("The partner already has that status.")
  if (input.availability === "offline" && p.availability === "on_delivery")
    throw badRequest("This partner is carrying an order. Reassign or finish it first.")
  const updated = await repo.overrideAvailability(p, input.availability, input.reason, actor)
  if (input.availability === "offline") await repo.forgetSeen(p.id)
  // Back online: they may still carry an order.
  else await refreshAvailability(p.id)
  const after = (await repo.findById(updated.id))!
  await announce(after)
  const [current, locations] = await Promise.all([repo.carrying([p.id]), repo.latest([p.id])])
  return toTracked(after, current, locations)
}
