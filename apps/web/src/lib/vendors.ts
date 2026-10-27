"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import type {
  Business,
  CreateVendorRequest,
  VendorDecision,
  VendorStatus,
  VerificationStatus,
} from "@zoauro/shared"

export type VendorQuery = {
  business?: Business | undefined
  status?: VendorStatus | undefined
  search?: string | undefined
  page: number
  pageSize: number
}

export const useVendors = (q: VendorQuery) =>
  useQuery({
    queryKey: ["vendors", "list", q],
    queryFn: () => api("get", "/vendors", { query: q }),
    placeholderData: keepPreviousData,
  })

export const useVendorSummary = () =>
  useQuery({ queryKey: ["vendors", "summary"], queryFn: () => api("get", "/vendors/summary") })

export const useVendor = (id: string | null) =>
  useQuery({
    queryKey: ["vendors", "detail", id],
    queryFn: () => api("get", "/vendors/{id}", { params: { id: id! } }),
    enabled: Boolean(id),
  })

export function useCreateVendor() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateVendorRequest) => api("post", "/vendors", { body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["vendors"] }),
  })
}

export function useVendorDecision() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; decision: VendorDecision; reason?: string }) =>
      api("post", "/vendors/{id}/decision", {
        params: { id: v.id },
        body: { decision: v.decision, ...(v.reason && { reason: v.reason }) },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ["vendors"] }),
  })
}

export function vendorStatusTone(s: VendorStatus) {
  if (s === "active") return "success"
  if (s === "pending_review") return "warning"
  return "danger"
}

export const verificationTone = (s: VerificationStatus) =>
  s === "verified" ? "success" : s === "rejected" ? "danger" : "warning"

export const documentLabel: Record<string, string> = {
  gst_certificate: "GST certificate",
  fssai_licence: "FSSAI licence",
  pan: "PAN card",
  bank_proof: "Bank proof",
  storefront_photo: "Storefront photo",
  aadhaar: "Aadhaar card",
  driving_licence: "Driving licence",
  vehicle_rc: "Registration certificate",
  insurance: "Insurance",
  photo: "Photo",
}

const actionLabel: Record<string, string> = {
  "vendor.created": "Vendor added for review",
  "vendor.approved": "Approved",
  "vendor.rejected": "Rejected",
  "vendor.suspended": "Suspended",
  "vendor.reactivated": "Reactivated",
  "partner.submitted": "Application submitted",
  "partner.approved": "Approved",
  "partner.rejected": "Rejected",
  "partner.suspended": "Suspended",
  "partner.reactivated": "Reactivated",
}
export const activityLabel = (action: string) => actionLabel[action] ?? action

export const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

export const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })

/**
 * Drops the named optional fields when blank, so they stay absent rather than "".
 * Required fields keep "" so the schema reports its own message for them.
 */
export function withoutBlanks<T extends Record<string, unknown>>(o: T, optional: (keyof T)[]): T {
  return Object.fromEntries(
    Object.entries(o).filter(
      ([k, v]) => !(optional.includes(k) && typeof v === "string" && v.trim() === ""),
    ),
  ) as T
}

/** Turns a Zod error into the first message per top-level field. */
export function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const i of issues) out[i.path.map(String).join(".")] ??= i.message
  return out
}
