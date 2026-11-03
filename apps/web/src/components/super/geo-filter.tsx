"use client"
// State / District filter for Finance and Reports. A district can only be picked once its
// state is chosen; choosing another state clears the district.
import { useGeography, type Geo } from "@/lib/finance"
import { Select } from "./ui"

export function GeoFilter({ value, onChange }: { value: Geo; onChange: (next: Geo) => void }) {
  const states = useGeography().data ?? []
  const districts = states.find((s) => s.state === value.state)?.districts ?? []
  return (
    <div className="geo-filter">
      <Select
        label="State"
        value={value.state ?? ""}
        onChange={(state) => onChange(state ? { state } : {})}
      >
        <option value="">All India</option>
        {states.map((s) => (
          <option key={s.state}>{s.state}</option>
        ))}
      </Select>
      <Select
        label="District"
        value={value.district ?? ""}
        onChange={(district) => onChange({ state: value.state, ...(district && { district }) })}
      >
        <option value="">{value.state ? "All districts" : "Select a state first"}</option>
        {districts.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </Select>
    </div>
  )
}
