import type { GeoLevel, GeoRow } from "@zoauro/shared"

export type ZoneFigures = {
  zoneId: string
  label: string
  districtId: string
  districtName: string
  state: string
  orders: number
  delivered: number
  cancelled: number
  grossPaise: number
  platformPaise: number
  /** Whole-zone partner pay before it is split between businesses. */
  zoneCostPaise: number
  /** Delivered orders of the businesses in view, and of all businesses in the zone. */
  deliveredInView: number
  deliveredAll: number
  timed: number
  onTime: number
  openOrders: number
  ridersAvailable: number
}

/**
 * A zone's rider cost belongs to the businesses that used its riders, so the businesses in view
 * carry their share of that zone's delivered orders. A zone with no deliveries has no share to go
 * by, so it falls back to the view's share of deliveries overall (1 when every business is in view).
 */
export function allocateRiderCost(
  zoneCostPaise: number,
  deliveredInView: number,
  deliveredAll: number,
  fallbackShare: number,
) {
  const share = deliveredAll > 0 ? deliveredInView / deliveredAll : fallbackShare
  return Math.round(zoneCostPaise * share)
}

/** The view's share of all deliveries across the zones given; 1 when it covers every business. */
export function overallShare(zones: ZoneFigures[], viewCoversAll: boolean) {
  if (viewCoversAll) return 1
  const all = zones.reduce((t, z) => t + z.deliveredAll, 0)
  return all > 0 ? zones.reduce((t, z) => t + z.deliveredInView, 0) / all : 0
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null)

/** Rolls zone figures up into the rows for one level of the drill-down. */
export function rollUp(zones: ZoneFigures[], level: GeoLevel, fallbackShare: number): GeoRow[] {
  const groups = new Map<string, { label: string; state: string | null; zones: ZoneFigures[] }>()
  for (const zone of zones) {
    const [key, label, state] =
      level === "state"
        ? [zone.state, zone.state, null]
        : level === "district"
          ? [zone.districtId, zone.districtName, zone.state]
          : [zone.zoneId, zone.label, zone.state]
    const group = groups.get(key) ?? { label, state, zones: [] }
    group.zones.push(zone)
    groups.set(key, group)
  }
  return [...groups].map(([key, { label, state, zones: members }]) => {
    const sum = (pick: (z: ZoneFigures) => number) => members.reduce((t, z) => t + pick(z), 0)
    const riderCostPaise = sum((z) =>
      allocateRiderCost(z.zoneCostPaise, z.deliveredInView, z.deliveredAll, fallbackShare),
    )
    const orders = sum((z) => z.orders)
    const platformPaise = sum((z) => z.platformPaise)
    return {
      key,
      label,
      state,
      zones: members.length,
      orders,
      delivered: sum((z) => z.delivered),
      cancelled: sum((z) => z.cancelled),
      grossPaise: sum((z) => z.grossPaise),
      platformPaise,
      riderCostPaise,
      marginPaise: platformPaise - riderCostPaise,
      onTimeRate: pct(
        sum((z) => z.onTime),
        sum((z) => z.timed),
      ),
      cancellationRate: pct(
        sum((z) => z.cancelled),
        orders,
      ),
      openOrders: sum((z) => z.openOrders),
      ridersAvailable: sum((z) => z.ridersAvailable),
      riderShortage: sum((z) => Math.max(0, z.openOrders - z.ridersAvailable)),
    }
  })
}
