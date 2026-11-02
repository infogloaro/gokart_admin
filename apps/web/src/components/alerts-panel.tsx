"use client"

import { AlertTriangle } from "lucide-react"
import Link from "next/link"
import { useStoredNotifications } from "@/lib/operations"

/** Operational alerts: delayed orders, failed payments, suspended vendors with open orders. */
const ALERT_TITLES = ["Order delayed", "Payment failed", "Suspended vendor has open orders"]

export function AlertsPanel() {
  const q = useStoredNotifications(false, 50)
  const alerts = (q.data?.items ?? [])
    .filter((item) => ALERT_TITLES.includes(item.title))
    .slice(0, 8)
  if (q.isPending || alerts.length === 0) return null
  return (
    <section className="alerts-panel" aria-label="Alerts">
      <h3>
        <AlertTriangle size={16} /> Alerts
      </h3>
      <ul>
        {alerts.map((alert) => (
          <li key={alert.id}>
            {alert.link ? (
              <Link href={alert.link}>
                <strong>{alert.title}</strong> {alert.body}
              </Link>
            ) : (
              <span>
                <strong>{alert.title}</strong> {alert.body}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
