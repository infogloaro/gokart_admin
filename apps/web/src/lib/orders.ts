"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import type { Business, Order, OrderStatus } from "@zoauro/shared"

export type OrderQuery = {
  business?: Business | undefined
  status?: OrderStatus | undefined
  search?: string | undefined
  districtId?: string | undefined
  zoneId?: string | undefined
  adminId?: string | undefined
  deliveryFleetId?: string | undefined
  deliveryPartnerId?: string | undefined
  deliveryBoyId?: string | undefined
  partnerId?: string | undefined
  vendorId?: string | undefined
  fromDate?: string | undefined
  toDate?: string | undefined
  /** "true" for orders past their time limit (sent as a query string). */
  delayed?: "true" | undefined
  page: number
  pageSize: number
}

export const useOrders = (q: OrderQuery, enabled = true, refetchInterval?: number) =>
  useQuery({
    queryKey: ["orders", "list", q],
    queryFn: () => api("get", "/orders", { query: q }),
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval,
  })

export const useOrderFilterOptions = (business?: Business) =>
  useQuery({
    queryKey: ["orders", "filters", business],
    queryFn: () => api("get", "/orders/filters", { query: { business } }),
  })

/** One order with its status history. */
export const useOrder = (id: string | null) =>
  useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: () => api("get", "/orders/{id}", { params: { id: id! } }),
    enabled: Boolean(id),
  })

/** Partners who could take the order (same business and area, on shift). */
export const useOrderCandidates = (id: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ["orders", "candidates", id],
    queryFn: () => api("get", "/orders/{id}/partners", { params: { id: id! } }),
    enabled: Boolean(id) && enabled,
  })

export function useAssignPartner() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { order: Order; partnerId: string }) =>
      api("post", "/orders/{id}/assign", {
        params: { id: v.order.id },
        body: { partnerId: v.partnerId, version: v.order.version },
      }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["orders"] })
      void client.invalidateQueries({ queryKey: ["partners"] })
      void client.invalidateQueries({ queryKey: ["tracking"] })
    },
  })
}

export function useChangeOrderStatus() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { order: Order; to: OrderStatus; reason?: string }) =>
      api("post", "/orders/{id}/status", {
        params: { id: v.order.id },
        body: { to: v.to, version: v.order.version, ...(v.reason && { reason: v.reason }) },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ["orders"] }),
  })
}

export function statusTone(s: OrderStatus) {
  if (s === "delivered") return "success"
  if (s === "cancelled" || s === "refund_requested" || s === "refunded") return "danger"
  if (s === "placed" || s === "accepted" || s === "preparing" || s === "packed") return "warning"
  return "info"
}

export const paymentTone = (s: Order["paymentStatus"]) =>
  s === "paid" ? "success" : s === "pending" ? "warning" : "danger"

export const paymentLabel = (o: Order) =>
  `${o.paymentMethod === "cod" ? "Cash on delivery" : o.paymentMethod.toUpperCase()} · ${o.paymentStatus[0]!.toUpperCase()}${o.paymentStatus.slice(1)}`

export const placedLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

/** Riders who could take this order now, least busy first. */
export const useRiderSuggestions = (id: string | null) =>
  useQuery({
    queryKey: ["orders", "rider-suggestions", id],
    queryFn: () => api("get", "/delivery/orders/{id}/suggestions", { params: { id: id! } }),
    enabled: Boolean(id),
  })

/** Assigns a chosen rider, or the least busy one when no rider is given. */
export function useAssignRider() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { order: Order; boyId?: string }) =>
      v.boyId
        ? api("post", "/orders/{id}/assign-boy", {
            params: { id: v.order.id },
            body: { boyId: v.boyId, version: v.order.version },
          })
        : api("post", "/orders/{id}/auto-assign-boy", { params: { id: v.order.id } }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["orders"] })
      void client.invalidateQueries({ queryKey: ["delivery"] })
    },
  })
}
