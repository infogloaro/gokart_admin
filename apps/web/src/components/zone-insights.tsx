"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import { TrendingUp } from "lucide-react"

/** Zones with unusually many orders today. Suggestions only; nothing changes automatically. */
export function ZoneInsights() {
  const q = useQuery({
    queryKey: ["reports", "insights"],
    queryFn: () => api("get", "/reports/insights"),
    refetchInterval: 60_000,
  })
  const flagged = (q.data ?? []).filter((zone) => zone.flagged)
  if (q.isPending || flagged.length === 0) return null
  return (
    <section className="insights-panel" aria-label="Zone insights">
      <h3>
        <TrendingUp size={16} /> Unusual order volume
      </h3>
      <ul>
        {flagged.map((zone) => (
          <li key={zone.zoneId}>
            <strong>{zone.zoneName}</strong> {zone.reason}
          </li>
        ))}
      </ul>
    </section>
  )
}
