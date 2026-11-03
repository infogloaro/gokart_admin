"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"

export type AlertStatus = "open" | "resolved"
export type AlertKindFilter =
  | "delayed_order"
  | "payment_failed"
  | "vendor_issue"
  | "security"
  | "document_expiry"
  | "rider_off_zone"

export const useAlerts = (status: AlertStatus, page: number, kind?: AlertKindFilter) =>
  useQuery({
    queryKey: ["alerts", status, page, kind ?? "all"],
    queryFn: () => api("get", "/alerts", { query: { status, page, pageSize: 30, kind } }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

export function useResolveAlerts() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      ids.length === 1
        ? api("post", "/alerts/{id}/resolve", { params: { id: ids[0]! } }).then(() => ({
            resolved: 1,
          }))
        : api("post", "/alerts/resolve-many", { body: { ids } }),
    onSettled: () => client.invalidateQueries({ queryKey: ["alerts"] }),
  })
}
