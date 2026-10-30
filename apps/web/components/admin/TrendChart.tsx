"use client"
import { useState } from "react"
import type { TrendSeries } from "@/types/dashboard"

const MAX_AXIS_LABELS = 10

function showAxisLabel(index: number, count: number) {
  const every = Math.ceil(count / MAX_AXIS_LABELS)
  const last = count - 1
  return index === last || (index % every === 0 && last - index >= every)
}

const FALLBACK_TREND_DAYS = ["Jun 1", "Jun 5", "Jun 9", "Jun 13", "Jun 18"]

function trendCoords(points: number[], width: number, height: number, zeroBased: boolean) {
  const max = Math.max(...points)
  const min = zeroBased ? Math.min(0, ...points) : Math.min(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  return points.map((value, index) => {
    const x = index * step
    const y = height - ((value - min) / span) * (height - 12) - 6
    return [x, y] as [number, number]
  })
}

// Monotone cubic interpolation: smooth, but never overshoots between points,
// so a day with no orders does not draw a phantom dip below zero.
function buildTrendPath(coords: Array<[number, number]>) {
  const n = coords.length
  if (n < 2) return ""
  const dx = coords.slice(1).map(([x], i) => x - coords[i]![0])
  const slope = coords.slice(1).map(([, y], i) => (y - coords[i]![1]) / dx[i]!)
  const tangent = coords.map((_, i) => {
    if (i === 0) return slope[0]!
    if (i === n - 1) return slope[n - 2]!
    return slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2
  })
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0
      tangent[i + 1] = 0
      continue
    }
    const a = tangent[i]! / slope[i]!
    const b = tangent[i + 1]! / slope[i]!
    const mag = Math.hypot(a, b)
    if (mag > 3) {
      tangent[i] = (3 * a * slope[i]!) / mag
      tangent[i + 1] = (3 * b * slope[i]!) / mag
    }
  }
  return coords.reduce((path, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`
    const [px, py] = coords[i - 1]!
    const step = dx[i - 1]! / 3
    return `${path} C ${px + step} ${py + tangent[i - 1]! * step}, ${x - step} ${y - tangent[i]! * step}, ${x} ${y}`
  }, "")
}

export function RevenueTrendChart({
  series,
  days,
  zeroBased = false,
}: {
  series: TrendSeries[]
  days: string[]
  zeroBased?: boolean
}) {
  const width = 560
  const height = 180
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const activeIndex = hoverIndex ?? pinnedIndex
  const trendDays = days.length > 0 ? days : FALLBACK_TREND_DAYS
  const seriesCoords = series.map((item) => trendCoords(item.points, width, height, zeroBased))
  return (
    <div className="admin-chart">
      <div className="admin-chart-legend">
        {series.map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height + 24}`}
        className="admin-chart-svg"
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const ratio = (event.clientX - box.left) / box.width
          const index = Math.round(ratio * (trendDays.length - 1))
          setHoverIndex(Math.min(Math.max(index, 0), trendDays.length - 1))
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {series.map((item, seriesIndex) => (
          <path
            key={item.label}
            d={buildTrendPath(seriesCoords[seriesIndex]!)}
            fill="none"
            stroke={item.color}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}
        {trendDays.map((day, index) =>
          showAxisLabel(index, trendDays.length) ? (
            <text
              key={`${day}-${index}`}
              x={(index * width) / (trendDays.length - 1)}
              y={height + 18}
              textAnchor={index === 0 ? "start" : index === trendDays.length - 1 ? "end" : "middle"}
              className="admin-chart-axis"
            >
              {day}
            </text>
          ) : null,
        )}
        {series.map((item, seriesIndex) =>
          seriesCoords[seriesIndex]!.map(([x, y], pointIndex) => (
            <circle
              key={`${item.label}-${pointIndex}`}
              cx={x}
              cy={y}
              r={activeIndex === pointIndex ? 7 : 5}
              fill={item.color}
              stroke="#fff"
              strokeWidth={2}
              className="admin-chart-point"
              onClick={() =>
                setPinnedIndex((current) => (current === pointIndex ? null : pointIndex))
              }
            />
          )),
        )}
        {activeIndex !== null && (
          <g className="admin-chart-tooltip">
            <line
              x1={(activeIndex * width) / (trendDays.length - 1)}
              y1={0}
              x2={(activeIndex * width) / (trendDays.length - 1)}
              y2={height}
              className="admin-chart-tooltip-line"
            />
            <foreignObject
              x={Math.min(
                Math.max((activeIndex * width) / (trendDays.length - 1) - 90, 0),
                width - 180,
              )}
              y={0}
              width={180}
              height={26 + series.length * 20}
            >
              <div className="admin-chart-tooltip-box">
                <b>{trendDays[activeIndex]}</b>
                {series.map((item) => (
                  <p key={item.label}>
                    <i style={{ background: item.color }} />
                    {item.label}: {item.values[activeIndex]}
                  </p>
                ))}
              </div>
            </foreignObject>
          </g>
        )}
      </svg>
    </div>
  )
}
