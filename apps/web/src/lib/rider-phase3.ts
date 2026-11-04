// Rider shifts, earnings statements, profile change approvals, analytics and app passwords.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import type { EarningsQuery, RiderProfileChangeQuery, RiderShiftQuery } from "@zoauro/shared"

const LIVE = 30_000

export const useRiderShifts = (query: RiderShiftQuery) =>
  useQuery({
    queryKey: ["rider-phase3", "shifts", query],
    queryFn: () => api("get", "/delivery/shifts", { query }),
    refetchInterval: LIVE,
  })

export function useEndShift() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api("post", "/delivery/shifts/{id}/end", { params: { id } }),
    onSettled: () => client.invalidateQueries({ queryKey: ["rider-phase3"] }),
  })
}

export const useEarnings = (query: Omit<EarningsQuery, "format">) =>
  useQuery({
    queryKey: ["rider-phase3", "earnings", query],
    queryFn: () => api("get", "/delivery/earnings", { query }),
  })

export const useProfileChanges = (query: RiderProfileChangeQuery) =>
  useQuery({
    queryKey: ["rider-phase3", "profile-changes", query],
    queryFn: () => api("get", "/delivery/profile-changes", { query }),
    refetchInterval: LIVE,
  })

export function useDecideProfileChange() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; approve: boolean; reason?: string }) =>
      input.approve
        ? api("post", "/delivery/profile-changes/{id}/approve", {
            params: { id: input.id },
            body: {},
          })
        : api("post", "/delivery/profile-changes/{id}/reject", {
            params: { id: input.id },
            body: { reason: input.reason ?? "" },
          }),
    onSettled: () => client.invalidateQueries({ queryKey: ["rider-phase3"] }),
  })
}

export const useRiderAnalytics = (days: number) =>
  useQuery({
    queryKey: ["rider-phase3", "analytics", days],
    queryFn: () => api("get", "/delivery/analytics", { query: { days } }),
  })

export function useIssueAppPassword() {
  return useMutation({
    mutationFn: (id: string) => api("post", "/delivery/boys/{id}/app-password", { params: { id } }),
  })
}
