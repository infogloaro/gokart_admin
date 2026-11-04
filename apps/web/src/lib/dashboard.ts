"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import { formatINR, type Business, type DashboardRange, type Metric } from "@zoauro/shared"

/** Dashboards refresh themselves every minute while open. */
const LIVE = 60_000

export const useDashboardOverview = (business: Business | undefined, range: DashboardRange) =>
  useQuery({
    queryKey: ["dashboard", "overview", business, range],
    queryFn: () => api("get", "/dashboard/overview", { query: { business, range } }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE,
  })

export const useDashboardHealth = (business: Business | undefined, range: DashboardRange) =>
  useQuery({
    queryKey: ["dashboard", "health", business, range],
    queryFn: () => api("get", "/dashboard/health", { query: { business, range } }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE,
  })

export const useRevenue = (business: Business, range: DashboardRange) =>
  useQuery({
    queryKey: ["dashboard", "revenue", business, range],
    queryFn: () => api("get", "/dashboard/revenue", { query: { business, range } }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE,
  })

export const useGeoInsights = (
  business: Business | undefined,
  range: DashboardRange,
  state?: string,
  districtId?: string,
) =>
  useQuery({
    queryKey: ["dashboard", "geography", business, range, state, districtId],
    queryFn: () =>
      api("get", "/dashboard/geography", { query: { business, range, state, districtId } }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE,
  })

export const useGlobalSearch = (q: string) =>
  useQuery({
    queryKey: ["search", q],
    queryFn: () => api("get", "/search", { query: { q } }),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })

/** ₹1.84Cr / ₹74.2L / ₹12,480 — the prototype's compact money style. */
export function compactINR(paise: number) {
  const rupees = paise / 100
  if (Math.abs(rupees) >= 1e7) return `₹${(rupees / 1e7).toFixed(2)}Cr`
  if (Math.abs(rupees) >= 1e5) return `₹${(rupees / 1e5).toFixed(1)}L`
  return formatINR(Math.round(paise / 100) * 100)
}

/** "+12.4%" against the previous period, or null when there is nothing to compare. */
export function change(m: Metric) {
  if (m.previous === null || m.previous === 0) return null
  const pct = ((m.value - m.previous) / m.previous) * 100
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`
}

/** "2 days", "5 hours", "12 min" since an instant. */
export function age(iso: string | null) {
  if (!iso) return null
  const min = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`
  return `${Math.round(h / 24)} days`
}

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  })
