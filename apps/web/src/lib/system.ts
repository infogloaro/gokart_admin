"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import type {
  AdminMember,
  AuditLogEntry,
  AuditModule,
  AuditSource,
  Role,
  CreateAdminRequest,
  CreateFeeRuleRequest,
  CreateZoneRequest,
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
export async function auditCsv(filters: Omit<AuditFilters, "page" | "pageSize">) {
  const maxExportRows = 10_000
  const entries: AuditLogEntry[] = []
  let total = 0
  for (let page = 1; entries.length < maxExportRows; page++) {
    const result = await api("get", "/audit", {
      query: { ...filters, page, pageSize: 100 },
    })
    entries.push(...result.items.slice(0, maxExportRows - entries.length))
    total = result.total
    if (entries.length >= total || result.items.length === 0) break
  }
  const rows = [
    [
      "Event ID",
      "Date & time",
      "Actor",
      "Administrator ID",
      "Role",
      "Source",
      "IP address",
      "Module",
      "Action",
      "Entity type",
      "Entity ID",
      "Details",
    ],
    ...entries.map((entry) => [
      entry.id,
      entry.at,
      entry.actorName,
      entry.actorId ?? "",
      entry.actorRole ?? "Not recorded",
      entry.source ?? "Unknown",
      entry.ip ?? "Not recorded",
      entry.action.split(".")[0] ?? "Unknown",
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.detail == null ? "" : JSON.stringify(entry.detail),
    ]),
  ]
  return {
    csv: rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
    count: entries.length,
    limited: total > entries.length,
  }
}
