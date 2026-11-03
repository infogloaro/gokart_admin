"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"

export type AlertStatus = "open" | "resolved"

export const useAlerts = (status: AlertStatus, page: number) =>
  useQuery({
    queryKey: ["alerts", status, page],
    queryFn: () => api("get", "/alerts", { query: { status, page, pageSize: 30 } }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

export function useResolveAlert() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api("post", "/alerts/{id}/resolve", { params: { id } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["alerts"] }),
  })
}
