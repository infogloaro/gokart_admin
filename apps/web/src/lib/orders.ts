"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import type { Business, Order, OrderStatus } from "@zoauro/shared"

export type OrderQuery = {
  business?: Business | undefined
  status?: OrderStatus | undefined
  search?: string | undefined
  partnerId?: string | undefined
  vendorId?: string | undefined
  page: number
  pageSize: number
}

export const useOrders = (q: OrderQuery) =>
  useQuery({
    queryKey: ["orders", "list", q],
    queryFn: () => api("get", "/orders", { query: q }),
    placeholderData: keepPreviousData,
  })

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
