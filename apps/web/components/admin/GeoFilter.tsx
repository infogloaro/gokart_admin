"use client"
import { useEffect, useState } from "react"
import { fetchGeography } from "@/lib/dashboard-api"
import type { GeographyState, GeoSelection } from "@/types/dashboard"

export default function GeoFilter({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string
  value: GeoSelection
  onChange: (next: GeoSelection) => void
}) {
  const [states, setStates] = useState<GeographyState[]>([])

  useEffect(() => {
    let cancelled = false
    fetchGeography(workspaceId)
      .then((result) => {
        if (!cancelled) setStates(result.states)
      })
      .catch(() => {
        if (!cancelled) setStates([])
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const districts = states.find((item) => item.state === value.state)?.districts ?? []

  return (
    <div className="geo-filter">
      <label>
        <span>State</span>
        <select
          aria-label="State"
          value={value.state ?? ""}
          onChange={(event) => onChange(event.target.value ? { state: event.target.value } : {})}
        >
          <option value="">All India</option>
          {states.map((item) => (
            <option key={item.state} value={item.state}>
              {item.state}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>District</span>
        <select
          aria-label="District"
          value={value.district ?? ""}
          disabled={!value.state || districts.length === 0}
          onChange={(event) =>
            onChange({
              state: value.state,
              ...(event.target.value ? { district: event.target.value } : {}),
            })
          }
        >
          <option value="">{value.state ? "All districts" : "Select a state first"}</option>
          {districts.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </select>
      </label>
      {value.state && (
        <button type="button" className="geo-filter-clear" onClick={() => onChange({})}>
          Clear
        </button>
      )}
    </div>
  )
}
