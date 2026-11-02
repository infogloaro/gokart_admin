"use client"
// Hooks for complaints, stored notifications, Mart inventory and the member's account.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import type {
  Business,
  ComplaintDetail,
  ComplaintPriority,
  ComplaintStatus,
  MemberPreferences,
  Product,
  ProductStatus,
} from "@zoauro/shared"

const LIVE = 30_000

// ---------- complaints ----------

export type ComplaintQuery = {
  business?: Business | undefined
  status?: ComplaintStatus | undefined
  priority?: ComplaintPriority | undefined
  assignee?: "me" | "none" | undefined
  search?: string | undefined
  page: number
  pageSize: number
}

export const useComplaints = (q: ComplaintQuery, enabled = true) =>
  useQuery({
    queryKey: ["complaints", "list", q],
    queryFn: () => api("get", "/complaints", { query: q }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE,
    enabled,
  })

export const useComplaintSummary = (business: Business | undefined, enabled = true) =>
  useQuery({
    queryKey: ["complaints", "summary", business],
    queryFn: () => api("get", "/complaints/summary", { query: { business } }),
    refetchInterval: LIVE,
    enabled,
  })

export const useComplaint = (id: string | null) =>
  useQuery({
    queryKey: ["complaints", "detail", id],
    queryFn: () => api("get", "/complaints/{id}", { params: { id: id! } }),
    enabled: Boolean(id),
  })

export const useAssignees = (id: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ["complaints", "assignees", id],
    queryFn: () => api("get", "/complaints/{id}/assignees", { params: { id: id! } }),
    enabled: Boolean(id) && enabled,
    staleTime: 60_000,
  })

type Action =
  | { kind: "assign"; assigneeId: string | null }
  | { kind: "escalate"; reason: string }
  | { kind: "resolve"; resolution: string }
  | { kind: "reopen"; reason: string }
  | { kind: "note"; body: string }

export function useComplaintAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ c, a }: { c: ComplaintDetail; a: Action }) => {
      const params = { id: c.id }
      const version = c.version
      if (a.kind === "assign")
        return api("post", "/complaints/{id}/assign", {
          params,
          body: { version, assigneeId: a.assigneeId },
        })
      if (a.kind === "escalate")
        return api("post", "/complaints/{id}/escalate", {
          params,
          body: { version, reason: a.reason },
        })
      if (a.kind === "resolve")
        return api("post", "/complaints/{id}/resolve", {
          params,
          body: { version, resolution: a.resolution },
        })
      if (a.kind === "reopen")
        return api("post", "/complaints/{id}/reopen", {
          params,
          body: { version, reason: a.reason },
        })
      return api("post", "/complaints/{id}/notes", { params, body: { body: a.body } })
    },
    onSuccess: (data) => client.setQueryData(["complaints", "detail", data.id], data),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["complaints"] })
      void client.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

// ---------- stored notifications ----------

export const useStoredNotifications = (unreadOnly = false, limit = 20) =>
  useQuery({
    queryKey: ["notifications", "stored", unreadOnly, limit],
    queryFn: () =>
      api("get", "/notifications", { query: { unread: unreadOnly ? "true" : undefined, limit } }),
    refetchInterval: LIVE,
  })

export const useNotificationActivityReads = (keys: string[]) =>
  useQuery({
    queryKey: ["notifications", "activity-read", keys],
    queryFn: () => api("get", "/notifications/activity-read", { query: { keys: keys.join(",") } }),
    enabled: keys.length > 0,
  })

export function useMarkRead() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string | "all") =>
      id === "all"
        ? api("post", "/notifications/read-all", {})
        : api("post", "/notifications/{id}/read", { params: { id } }),
    onSettled: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  })
}

export function useMarkActivityRead() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => api("post", "/notifications/activity-read", { body: { key } }),
    onSettled: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  })
}

// ---------- inventory ----------

export type ProductQuery = {
  stock?: "low" | "out" | "in" | undefined
  status?: ProductStatus | undefined
  search?: string | undefined
  page: number
  pageSize: number
}

export const useProducts = (q: ProductQuery) =>
  useQuery({
    queryKey: ["inventory", "list", q],
    queryFn: () => api("get", "/inventory", { query: q }),
    placeholderData: keepPreviousData,
  })

export const useInventorySummary = () =>
  useQuery({ queryKey: ["inventory", "summary"], queryFn: () => api("get", "/inventory/summary") })

export function useAdjustStock() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      p: Product
      change: number
      reason: "restock" | "sold_offline" | "damaged" | "count_correction"
    }) =>
      api("post", "/inventory/{id}/stock", {
        params: { id: v.p.id },
        body: { version: v.p.version, change: v.change, reason: v.reason },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ["inventory"] }),
  })
}

export function useProductStatus() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { p: Product; status: ProductStatus }) =>
      api("post", "/inventory/{id}/status", {
        params: { id: v.p.id },
        body: { version: v.p.version, status: v.status },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ["inventory"] }),
  })
}

export const stockState = (p: Pick<Product, "stock" | "lowStockThreshold">) =>
  p.stock <= 0 ? "out" : p.stock <= p.lowStockThreshold ? "low" : "in"

// ---------- account ----------

export const useSessions = () =>
  useQuery({ queryKey: ["account", "sessions"], queryFn: () => api("get", "/auth/sessions") })

export function useEndSession() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string | "others") => {
      if (id === "others") return (await api("post", "/auth/sessions/end-others", {})).ended
      await api("delete", "/auth/sessions/{id}", { params: { id } })
      return 1
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["account", "sessions"] }),
  })
}

export const usePreferences = () =>
  useQuery({ queryKey: ["account", "preferences"], queryFn: () => api("get", "/auth/preferences") })

export function useSavePreferences() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (p: MemberPreferences) => api("put", "/auth/preferences", { body: p }),
    onSuccess: (data) => client.setQueryData(["account", "preferences"], data),
  })
}

/** "Chrome on Windows" from a user-agent string. */
export function deviceName(ua: string | null) {
  if (!ua) return "Unknown device"
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : ua.split(/[ /]/)[0] || "Browser"
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : ""
  return os ? `${browser} on ${os}` : browser
}

export const useComplaintSuggestions = (id: string | null) =>
  useQuery({
    queryKey: ["complaints", "suggestions", id],
    queryFn: () => api("get", "/complaints/{id}/suggestions", { params: { id: id! } }),
    enabled: Boolean(id),
  })
