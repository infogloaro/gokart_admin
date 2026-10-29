import type { DashboardQuery } from "./dashboard.types.js"

const DEFAULT_RANGE_DAYS = 30

function fail(message: string): never {
  throw Object.assign(new Error(message), { status: 400 })
}

function parseDate(value: string, label: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    fail(`${label} must be a valid date (YYYY-MM-DD)`)
  }
  return parsed
}

export function parseDashboardQuery(
  params: Record<string, unknown>,
  query: Record<string, unknown>,
): DashboardQuery {
  const workspaceSlug = params.workspaceId
  if (typeof workspaceSlug !== "string" || workspaceSlug.trim().length === 0) {
    fail("workspaceId is required")
  }

  const { start, end } = query

  let range: { start: Date; end: Date }

  if (start === undefined && end === undefined) {
    const endDate = new Date()
    endDate.setUTCHours(23, 59, 59, 999)
    const startDate = new Date(endDate)
    startDate.setUTCDate(startDate.getUTCDate() - (DEFAULT_RANGE_DAYS - 1))
    startDate.setUTCHours(0, 0, 0, 0)
    range = { start: startDate, end: endDate }
  } else {
    if (typeof start !== "string" || typeof end !== "string") {
      fail("start and end must both be provided as YYYY-MM-DD")
    }
    const startDate = parseDate(start, "start")
    const endDate = parseDate(end, "end")
    endDate.setUTCHours(23, 59, 59, 999)

    if (startDate.getTime() > endDate.getTime()) {
      fail("start must be on or before end")
    }

    range = { start: startDate, end: endDate }
  }

  return { workspaceSlug: workspaceSlug.trim(), range }
}
