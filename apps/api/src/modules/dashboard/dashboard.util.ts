import type { DateRange } from "./dashboard.types.js"

export const WORKSPACE_COLORS: Record<string, string> = {
  "zoauro-food": "#08224b",
  "gloaro-mart": "#d99700",
}

export const WORKSPACE_TAGS: Record<string, string> = {
  "zoauro-food": "FOOD",
  "gloaro-mart": "MART",
}

export const DISTRIBUTION_LABELS: Record<string, { label: string; color: string }> = {
  DELIVERED: { label: "Delivered", color: "#1fa15a" },
  IN_PROGRESS: { label: "In progress", color: "#2f6fe0" },
  CANCELLED: { label: "Cancelled", color: "#e2443f" },
  REFUNDED: { label: "Refunded", color: "#d99700" },
}

const IN_PROGRESS_STATUSES = new Set(["PLACED", "PREPARING", "ON_THE_WAY"])

export function distributionBucket(status: string): keyof typeof DISTRIBUTION_LABELS {
  if (status === "DELIVERED") return "DELIVERED"
  if (status === "CANCELLED") return "CANCELLED"
  if (status === "REFUNDED") return "REFUNDED"
  if (IN_PROGRESS_STATUSES.has(status)) return "IN_PROGRESS"
  return "IN_PROGRESS"
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatInr(value: number): string {
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)

  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

export function formatChange(current: number, previous: number): string {
  const change = percentChange(current, previous)
  const sign = change >= 0 ? "+" : ""
  return `${sign}${change.toFixed(1)}%`
}

export function previousRange(range: DateRange): DateRange {
  const spanMs = range.end.getTime() - range.start.getTime()
  const end = new Date(range.start.getTime() - 1)
  const start = new Date(end.getTime() - spanMs)
  return { start, end }
}

export interface TrendBucket {
  start: Date
  end: Date
  label: string
}

export function buildTrendBuckets(range: DateRange, maxBuckets = 6): TrendBucket[] {
  const totalMs = range.end.getTime() - range.start.getTime()
  const totalDays = Math.max(1, Math.ceil(totalMs / (24 * 60 * 60 * 1000)) + 1)
  const bucketCount = Math.min(maxBuckets, totalDays)
  const bucketMs = totalMs / bucketCount

  return Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(range.start.getTime() + index * bucketMs)
    const end =
      index === bucketCount - 1
        ? range.end
        : new Date(range.start.getTime() + (index + 1) * bucketMs - 1)
    return {
      start,
      end,
      label: start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    }
  })
}
