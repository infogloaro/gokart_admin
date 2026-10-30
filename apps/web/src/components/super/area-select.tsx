"use client"
// Service area as two fields, Zone then Area (two cells in a form grid).
import { useZones } from "@/lib/session"
import { useAreaPicker } from "@/lib/zones"
import { Input, Select } from "./ui"

export function AreaSelect({
  value,
  onChange,
  required = true,
  showDistrict = false,
}: {
  value: string
  onChange: (zoneId: string) => void
  required?: boolean
  /** Adds a read-only District field, filled as soon as a zone is chosen. */
  showDistrict?: boolean
}) {
  const zones = useZones()
  const pick = useAreaPicker(zones.data, value, onChange)
  const mark = required ? " *" : ""
  return (
    <>
      <Select label={`Zone${mark}`} value={pick.zone} onChange={pick.setZone}>
        <option value="">Choose a zone</option>
        {pick.zones.map((z) => (
          <option value={z.key} key={z.key}>
            {z.label}
          </option>
        ))}
      </Select>
      <Select label={`Area${mark}`} value={value} onChange={onChange}>
        <option value="">{pick.zone ? "Choose an area" : "Choose a zone first"}</option>
        {pick.areas.map((a) => (
          <option value={a.id} key={a.id}>
            {a.location}
          </option>
        ))}
      </Select>
      {showDistrict && (
        <Input
          label="District"
          value={pick.district ? `${pick.district}, Tamil Nadu` : ""}
          readOnly
          placeholder="Set by the zone"
        />
      )}
    </>
  )
}
