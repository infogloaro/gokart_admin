"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@zoauro/api-client"
import type {
  Business,
  CreateDeliveryFleetRequest,
  DeliveryBoyApplicationRequest,
  DeliveryBoySubmissionRequest,
  DeliveryBoyReviewRequest,
  DeliveryFleetReviewRequest,
  RequestDeliveryFleetRequest,
  UpdateDeliveryFleetRequest,
} from "@zoauro/shared"
import { fileProblem } from "./documents"

export type FleetQuery = {
  status?: "pending_approval" | "active" | "suspended" | "rejected"
  business?: Business
  districtId?: string
  zoneId?: string
  search?: string
  page: number
  pageSize: number
}

export type DeliveryBoyQuery = {
  status?:
    | "pending_admin"
    | "pending_super"
    | "corrections_requested"
    | "rejected"
    | "active"
    | "suspended"
  districtId?: string
  zoneId?: string
  fleetId?: string
  search?: string
  page: number
  pageSize: number
}

export const useDeliveryFleets = (query: FleetQuery, enabled = true) =>
  useQuery({
    queryKey: ["delivery", "fleets", query],
    queryFn: () => api("get", "/delivery/fleets", { query }),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useDeliveryBoys = (query: DeliveryBoyQuery, enabled = true) =>
  useQuery({
    queryKey: ["delivery", "boys", query],
    queryFn: () => api("get", "/delivery/boys", { query }),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useCreateDeliveryFleet = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateDeliveryFleetRequest) => api("post", "/delivery/fleets", { body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["delivery", "fleets"] }),
  })
}

/** Admin's request: the partner stays pending until Super Admin approves it. */
export const useRequestDeliveryFleet = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: RequestDeliveryFleetRequest) =>
      api("post", "/delivery/fleet-requests", { body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["delivery", "fleets"] }),
  })
}

export const useReviewDeliveryFleet = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: DeliveryFleetReviewRequest }) =>
      api("post", "/delivery/fleets/{id}/review", { params: { id: input.id }, body: input.body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["delivery", "fleets"] }),
  })
}

export const useFleetHistory = (id: string | null) =>
  useQuery({
    queryKey: ["delivery", "fleet-history", id],
    queryFn: () => api("get", "/delivery/fleets/{id}/history", { params: { id: id! } }),
    enabled: Boolean(id),
  })

export const useBoyHistory = (id: string | null) =>
  useQuery({
    queryKey: ["delivery", "boy-history", id],
    queryFn: () => api("get", "/delivery/boys/{id}/history", { params: { id: id! } }),
    enabled: Boolean(id),
  })

export async function uploadDeliveryBoyDocument(
  credential: string,
  boyId: string,
  kind: string,
  file: File,
) {
  const problem = fileProblem(file)
  if (problem) throw new ApiError(400, "bad_request", problem)
  const res = await fetch(
    `/api/v1/delivery/intake/fleet/me/boys/${encodeURIComponent(boyId)}/documents/${encodeURIComponent(kind)}`,
    {
      method: "PUT",
      headers: {
        "x-partner-credential": credential,
        "Content-Type": file.type,
        "x-file-name": encodeURIComponent(file.name),
      },
      body: file,
    },
  )
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const error = data?.error
    throw new ApiError(
      res.status,
      error?.code ?? "http_error",
      error?.message ??
        (res.status === 413 ? "That file is too large." : `Upload failed (${res.status})`),
      error?.fields,
    )
  }
}

export const useUpdateDeliveryFleet = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: UpdateDeliveryFleetRequest }) =>
      api("patch", "/delivery/fleets/{id}", { params: { id: input.id }, body: input.body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["delivery", "fleets"] }),
  })
}

export const useRotateFleetCredential = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      api("post", "/delivery/fleets/{id}/credential", {
        params: { id: input.id },
        body: { reason: input.reason },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["delivery", "fleets"] }),
  })
}

export const useAssignFleetZone = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; zoneId: string; replaceCurrent: boolean; reason: string }) =>
      api("post", "/delivery/fleets/{id}/zones/{zoneId}", {
        params: { id: input.id, zoneId: input.zoneId },
        body: { replaceCurrent: input.replaceCurrent, reason: input.reason },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["delivery", "fleets"] }),
  })
}

const fleetHeaders = (credential: string) => ({ "x-partner-credential": credential })

export const getFleetPartnerProfile = (credential: string) =>
  api("get", "/delivery/intake/fleet/me", { headers: fleetHeaders(credential) })

export const getFleetPartnerBoys = (credential: string) =>
  api("get", "/delivery/intake/fleet/me/boys", { headers: fleetHeaders(credential) })

export const requestDeliveryBoyOtp = (credential: string, phone: string) =>
  api("post", "/delivery/intake/fleet/me/boys/otp", {
    headers: fleetHeaders(credential),
    body: { phone },
  })

export const submitFleetDeliveryBoy = (credential: string, body: DeliveryBoySubmissionRequest) =>
  api("post", "/delivery/intake/fleet/me/boys", {
    headers: fleetHeaders(credential),
    body,
  })

export const correctFleetDeliveryBoy = (
  credential: string,
  id: string,
  body: DeliveryBoyApplicationRequest & { reason: string },
) =>
  api("patch", "/delivery/intake/fleet/me/boys/{id}", {
    params: { id },
    headers: fleetHeaders(credential),
    body,
  })

export const useReviewDeliveryBoy = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: DeliveryBoyReviewRequest }) =>
      api("post", "/delivery/boys/{id}/review", { params: { id: input.id }, body: input.body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["delivery", "boys"] }),
  })
}

export const useVerifyBoyDocument = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; docId: string; verified: boolean; reason: string }) =>
      api("post", "/delivery/boys/{id}/documents/{docId}/verify", {
        params: { id: input.id, docId: input.docId },
        body: { verified: input.verified, reason: input.reason },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["delivery", "boys"] }),
  })
}

/** A rider's approval steps, for the partner who submitted them. */
export const getFleetBoyHistory = (credential: string, id: string) =>
  api("get", "/delivery/intake/fleet/me/boys/{id}/history", {
    params: { id },
    headers: { "x-partner-credential": credential },
  })
