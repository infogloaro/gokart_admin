"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import type {
  AdminMember,
  AuditModule,
  AuditSource,
  Role,
  CreateDistrictRequest,
  CreateAdminRequest,
  CreateFeeRuleRequest,
  CreateSurgeRuleRequest,
  SurgePreviewRequest,
  CreateZoneRequest,
  UpdateDistrictRequest,
  UpdateAdminRequest,
  UpdateZoneRequest,
} from "@zoauro/shared"
import { businessName } from "@zoauro/shared"

const csvCell = (value: string) => {
  const safe = /^[\s=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

/** CSV for the complete current Admin list, retaining the active search/status filters. */
export function adminsCsv(members: AdminMember[]) {
  const rows = [
    [
      "Admin ID",
      "Name",
      "Email",
      "Status",
      "Businesses",
      "Service areas",
      "Permissions",
      "Authenticator enabled",
      "Created at",
      "Last login",
    ],
    ...members.map((member) => [
      member.id,
      member.name,
      member.email,
      member.status,
      member.businesses.map((business) => businessName[business]).join("; "),
      member.zones
        .map((zone) => `${zone.district} / ${zone.city} / ${zone.location} (${zone.id})`)
        .join("; "),
      member.permissions.join("; "),
      member.authenticatorEnabled ? "Yes" : "No",
      member.createdAt,
      member.lastLoginAt ?? "",
    ]),
  ]
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n")
}

export const useAdmins = (search: string, status: "all" | "active" | "disabled") =>
  useQuery({
    queryKey: ["system", "members", search, status],
    queryFn: () =>
      api("get", "/members", {
        query: { search: search || undefined, status: status === "all" ? undefined : status },
      }),
    placeholderData: keepPreviousData,
  })

export function useCreateAdmin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAdminRequest) => api("post", "/members", { body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["system", "members"] }),
  })
}

export function useUpdateAdmin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: UpdateAdminRequest }) =>
      api("patch", "/members/{id}", { params: { id: input.id }, body: input.body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["system", "members"] }),
  })
}

export const useManagedZones = () =>
  useQuery({
    queryKey: ["system", "zones"],
    queryFn: () => api("get", "/settings/zones"),
  })

export const useManagedDistricts = () =>
  useQuery({
    queryKey: ["system", "districts"],
    queryFn: () => api("get", "/settings/districts"),
  })

export function useCreateDistrict() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateDistrictRequest) => api("post", "/settings/districts", { body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["system", "districts"] })
      void client.invalidateQueries({ queryKey: ["system", "zones"] })
      void client.invalidateQueries({ queryKey: ["zones"] })
    },
  })
}

export function useUpdateDistrict() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: UpdateDistrictRequest }) =>
      api("patch", "/settings/districts/{id}", { params: { id: input.id }, body: input.body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["system", "districts"] })
      void client.invalidateQueries({ queryKey: ["system", "zones"] })
      void client.invalidateQueries({ queryKey: ["zones"] })
    },
  })
}

export function useDeleteDistrict() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api("delete", "/settings/districts/{id}", { params: { id } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["system", "districts"] })
      void client.invalidateQueries({ queryKey: ["geography"] })
    },
  })
}

export function useDeleteZone() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api("delete", "/settings/zones/{id}", { params: { id } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["system", "zones"] })
      void client.invalidateQueries({ queryKey: ["system", "districts"] })
      void client.invalidateQueries({ queryKey: ["zones"] })
    },
  })
}

export function useCreateZone() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateZoneRequest) => api("post", "/settings/zones", { body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["system", "zones"] })
      void client.invalidateQueries({ queryKey: ["zones"] })
    },
  })
}

export function useUpdateZone() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: UpdateZoneRequest }) =>
      api("patch", "/settings/zones/{id}", { params: { id: input.id }, body: input.body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["system", "zones"] })
      void client.invalidateQueries({ queryKey: ["zones"] })
    },
  })
}

export type FeeFilters = {
  business?: "food" | "mart"
  zoneId?: string
  page: number
  pageSize: number
}

export const useFeeRules = (filters: FeeFilters) =>
  useQuery({
    queryKey: ["system", "fees", filters],
    queryFn: () => api("get", "/settings/fees", { query: filters }),
    placeholderData: keepPreviousData,
  })

export function useCreateFeeRule() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateFeeRuleRequest) => api("post", "/settings/fees", { body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["system", "fees"] }),
  })
}

export type AuditFilters = {
  search?: string
  module?: AuditModule
  actor?: string
  role?: Role
  action?: string
  source?: AuditSource
  ip?: string
  from?: string
  to?: string
  page: number
  pageSize: number
}

export const useAuditLogs = (filters: AuditFilters) =>
  useQuery({
    queryKey: ["system", "audit", filters],
    queryFn: () => api("get", "/audit", { query: filters }),
    placeholderData: keepPreviousData,
  })

/** Downloads every audit event matching the visible filters, not only the current page. */
/** The server builds the CSV for the filters on screen (the same rules, up to 10,000 entries). */
export function auditExportUrl(
  filters: Omit<AuditFilters, "page" | "pageSize">,
  format: "csv" | "xlsx" = "csv",
) {
  const params = new URLSearchParams({ format })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, String(value))
  return `/api/v1/audit/export?${params}`
}

export const useSurgeRules = () =>
  useQuery({
    queryKey: ["system", "surge"],
    queryFn: () => api("get", "/settings/surge"),
  })

export function useSaveSurgeRule() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | null; body: CreateSurgeRuleRequest }) =>
      input.id
        ? api("put", "/settings/surge/{id}", { params: { id: input.id }, body: input.body })
        : api("post", "/settings/surge", { body: input.body }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["system", "surge"] }),
  })
}

export function useSetSurgeActive() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api("patch", "/settings/surge/{id}/active", {
        params: { id: input.id },
        body: { active: input.active },
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["system", "surge"] }),
  })
}

export function useDeleteSurgeRule() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api("delete", "/settings/surge/{id}", { params: { id } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["system", "surge"] }),
  })
}

export const useSurgePreview = () =>
  useMutation({
    mutationFn: (body: SurgePreviewRequest) => api("post", "/settings/surge/preview", { body }),
  })
