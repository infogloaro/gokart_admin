"use client"
// Live tracking: REST for the first load, Socket.IO for every change after that.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import {
  STALE_AFTER_SECONDS,
  type Business,
  type TrackedLocation,
  type TrackedPartner,
  type TrackingEvents,
} from "@zoauro/shared"
import { useEffect, useState } from "react"
import { io } from "socket.io-client"

const partnersKey = (business?: Business) => ["tracking", "partners", business ?? "all"] as const

export const useTrackingZones = () =>
  useQuery({
    queryKey: ["tracking", "zones"],
    queryFn: () => api("get", "/tracking/zones"),
    staleTime: 5 * 60_000,
  })

export const useTrackedPartners = (business?: Business) =>
  useQuery({
    queryKey: partnersKey(business),
    queryFn: async () => {
      const partners = await api("get", "/tracking/partners", {
        query: business ? { business } : {},
      })
      return [...new Map(partners.map((partner) => [partner.id, partner])).values()]
    },
  })

export const useTrail = (id: string | null, minutes = 30) =>
  useQuery({
    queryKey: ["tracking", "trail", id, minutes],
    queryFn: () =>
      api("get", "/tracking/partners/{id}/trail", { params: { id: id! }, query: { minutes } }),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  })

export function useAvailabilityOverride() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; availability: "available" | "offline"; reason: string }) =>
      api("post", "/tracking/partners/{id}/availability", {
        params: { id: v.id },
        body: { availability: v.availability, reason: v.reason },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tracking"] })
      void client.invalidateQueries({ queryKey: ["partners"] })
    },
  })
}

export type Connection = "connecting" | "live" | "offline"

/**
 * Keeps every cached tracking list current from the server's zone rooms, and refreshes
 * partner tables when someone's availability changes. Mount once per screen.
 */
export function useTrackingSocket(): Connection {
  const client = useQueryClient()
  const [state, setState] = useState<Connection>("connecting")

  useEffect(() => {
    const socket = io({ path: "/socket.io", withCredentials: true })
    let refreshInterval: ReturnType<typeof setInterval> | undefined
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["tracking", "partners"] })
    }
    const startRefresh = () => {
      if (!refreshInterval) refreshInterval = setInterval(refresh, 30_000)
    }
    const stopRefresh = () => {
      if (refreshInterval) clearInterval(refreshInterval)
      refreshInterval = undefined
    }
    const patch = (partnerId: string, change: (p: TrackedPartner) => TrackedPartner) => {
      for (const [key, list] of client.getQueriesData<TrackedPartner[]>({
        queryKey: ["tracking", "partners"],
      }))
        if (list)
          client.setQueryData(
            key,
            list.map((p) => (p.id === partnerId ? change(p) : p)),
          )
    }
    socket.on("connect", () => {
      setState("live")
      stopRefresh()
      refresh()
    })
    socket.on("disconnect", () => {
      setState("offline")
      startRefresh()
    })
    socket.on("connect_error", () => {
      setState("offline")
      startRefresh()
    })
    socket.on("partner:location", (e: TrackingEvents["partner:location"]) =>
      patch(e.partnerId, (p) => ({ ...p, location: e.location })),
    )
    socket.on("partner:availability", (e: TrackingEvents["partner:availability"]) => {
      patch(e.partnerId, (p) => ({ ...p, availability: e.availability }))
      // Current order and table badges come from the server again.
      void client.invalidateQueries({ queryKey: ["tracking", "partners"] })
      void client.invalidateQueries({ queryKey: ["partners"] })
    })
    return () => {
      stopRefresh()
      socket.disconnect()
    }
  }, [client])

  return state
}

/** "12s ago", "4 min ago", "2 h ago". */
export function ago(iso: string | undefined, now = Date.now()) {
  if (!iso) return "never"
  const at = new Date(iso).getTime()
  if (!Number.isFinite(at)) return "unknown"
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return `${Math.round(s / 3600)} h ago`
}

export function hasValidLocation(
  location: TrackedLocation | null | undefined,
): location is TrackedLocation {
  return Boolean(
    location &&
    Number.isFinite(location.lat) &&
    location.lat >= -90 &&
    location.lat <= 90 &&
    Number.isFinite(location.lng) &&
    location.lng >= -180 &&
    location.lng <= 180,
  )
}

export function isStaleLocation(location: TrackedLocation, now = Date.now()) {
  const at = new Date(location.at).getTime()
  return !Number.isFinite(at) || at > now || now - at > STALE_AFTER_SECONDS * 1000
}

/** Re-renders every few seconds so "x ago" labels stay right. */
export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export const availabilityTone = (a: TrackedPartner["availability"]) =>
  a === "available" ? "success" : a === "on_delivery" ? "info" : "neutral"
