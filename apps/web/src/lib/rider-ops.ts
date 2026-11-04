// Rider notices, support tickets and cash handover for the Admin and Super Admin portals.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import type { CodStatus, RiderTicketStatus, SendRiderNoticeRequest } from "@zoauro/shared"

const LIVE = 30_000

export const useRiderTickets = (status: RiderTicketStatus) =>
  useQuery({
    queryKey: ["rider-ops", "support", status],
    queryFn: () => api("get", "/delivery/support", { query: { status, pageSize: 50 } }),
    refetchInterval: LIVE,
  })

export const useCodCollections = (status: CodStatus | undefined) =>
  useQuery({
    queryKey: ["rider-ops", "cod", status ?? "all"],
    queryFn: () =>
      api("get", "/delivery/cod", { query: { ...(status && { status }), pageSize: 50 } }),
    refetchInterval: LIVE,
  })

export function useReplyToTicket() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: string }) =>
      api("post", "/delivery/support/{id}/reply", {
        params: { id: input.id },
        body: { body: input.body },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ["rider-ops"] }),
  })
}

export function useResolveTicket() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api("post", "/delivery/support/{id}/resolve", { params: { id } }),
    onSettled: () => client.invalidateQueries({ queryKey: ["rider-ops"] }),
  })
}

export function useConfirmHandover() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api("post", "/delivery/cod/{id}/handover", { params: { id } }),
    onSettled: () => client.invalidateQueries({ queryKey: ["rider-ops"] }),
  })
}

export function useSendNotice() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: SendRiderNoticeRequest) => api("post", "/delivery/notices", { body }),
    onSettled: () => client.invalidateQueries({ queryKey: ["rider-ops"] }),
  })
}
