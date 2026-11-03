import {
  customRange,
  rangeCustom,
  rangeLabel,
  rangeOptions,
  type DashboardRange,
} from "@zoauro/shared"

const DAY = 86_400_000
const istDay = (t: number) => new Date(t + 330 * 60_000).toISOString().slice(0, 10)
const CUSTOM = "custom"

/** The select value for a range: custom ranges all share one entry. */
export const rangeSelectValue = (range: DashboardRange) => (rangeCustom(range) ? CUSTOM : range)

/** Applies a picked select value; "custom" starts from the last 30 days. */
export function pickRange(value: string, setRange: (r: DashboardRange) => void) {
  if (value !== CUSTOM) return setRange(value as DashboardRange)
  const now = Date.now()
  setRange(customRange(istDay(now - 29 * DAY), istDay(now)))
}

/** The <option> list for a range <select>; `today` lets a caller label that entry itself. */
export function RangeOptions({ today }: { today?: string }) {
  return (
    <>
      {rangeOptions().map((r) => (
        <option key={r} value={r}>
          {r === "today" && today ? today : rangeLabel(r)}
        </option>
      ))}
      <option value={CUSTOM}>Custom range…</option>
    </>
  )
}

/** From/to date inputs, shown only while a custom range is selected. */
export function CustomDates({
  range,
  setRange,
}: {
  range: DashboardRange
  setRange: (r: DashboardRange) => void
}) {
  const c = rangeCustom(range)
  if (!c) return null
  const max = istDay(Date.now())
  return (
    <span className="range-custom">
      <input
        type="date"
        aria-label="From date"
        value={c.from}
        max={c.to}
        onChange={(e) => e.target.value && setRange(customRange(e.target.value, c.to))}
      />
      <span>to</span>
      <input
        type="date"
        aria-label="To date"
        value={c.to}
        min={c.from}
        max={max}
        onChange={(e) => e.target.value && setRange(customRange(c.from, e.target.value))}
      />
    </span>
  )
}
