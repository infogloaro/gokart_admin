"use client"
import { useState } from "react"
import type { TrendSeries } from "@/types/dashboard"

const MAX_AXIS_LABELS = 6

function showAxisLabel(index: number, count: number) {
  const every = Math.ceil(count / MAX_AXIS_LABELS)
  const last = count - 1
  return index === last || (index % every === 0 && last - index >= every)
}

const FALLBACK_TREND_DAYS = ["Jun 1", "Jun 5", "Jun 9", "Jun 13", "Jun 18"]

function trendCoords(points: number[], width: number, height: number) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  return points.map((value, index) => {
    const x = index * step
    const y = height - ((value - min) / span) * (height - 12) - 6
    return [x, y] as [number, number]
  })
}

function buildTrendPath(coords: Array<[number, number]>) {
  return coords.reduce((path, [x, y], index) => {
    if (index === 0) return `M ${x} ${y}`
    const [px, py] = coords[index - 1]!
    const midX = (px + x) / 2
    return `${path} C ${midX} ${py}, ${midX} ${y}, ${x} ${y}`
  }, "")
}

export function RevenueTrendChart({ series, days }: { series: TrendSeries[]; days: string[] }) {
  const width = 560
  const height = 180
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const trendDays = days.length > 0 ? days : FALLBACK_TREND_DAYS
  const seriesCoords = series.map((item) => trendCoords(item.points, width, height))
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
      <svg viewBox={`0 0 ${width} ${height + 24}`} className="admin-chart-svg">
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
                setActiveIndex((current) => (current === pointIndex ? null : pointIndex))
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
