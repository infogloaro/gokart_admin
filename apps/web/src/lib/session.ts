"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import { useRouter } from "next/navigation"

export const meKey = ["me"] as const

export const useMe = () => useQuery({ queryKey: meKey, queryFn: () => api("get", "/auth/me") })

export function useLogout() {
  const client = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: () => api("post", "/auth/logout"),
    onSettled: () => {
      client.clear()
      router.replace("/login")
    },
  })
}

export const useOrderSummary = () =>
  useQuery({ queryKey: ["orders", "summary"], queryFn: () => api("get", "/orders/summary") })

/** Service areas the member can see (all of them for Super Admins). */
export const useZones = () =>
  useQuery({ queryKey: ["zones"], queryFn: () => api("get", "/zones"), staleTime: 5 * 60_000 })
