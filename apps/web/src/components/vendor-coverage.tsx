"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import { Bike, Shield } from "lucide-react"

/** Which zone admin and delivery partner serve each vendor, and how many riders are free. */
export function VendorCoverage() {
  const q = useQuery({
    queryKey: ["vendors", "coverage"],
    queryFn: () => api("get", "/vendors/coverage"),
    refetchInterval: 120_000,
  })
  const rows = q.data?.items ?? []
  const uncovered = rows.filter((row) => row.partners.length === 0).length
  return (
    <section className="vendor-coverage" aria-label="Vendor coverage">
      <header>
        <h3>
          <Shield size={16} /> Who serves each vendor
        </h3>
        <p>
          {uncovered > 0
            ? `${uncovered} vendor${uncovered === 1 ? " has" : "s have"} no delivery partner in their zone yet.`
            : "Every vendor has a delivery partner in its zone."}
        </p>
      </header>
      {q.isPending && <p className="vc-empty">Loading coverage…</p>}
      {q.isError && (
        <p className="vc-error" role="alert">
          Coverage couldn’t be loaded.
        </p>
      )}
      {rows.length > 0 && (
        <div className="vc-table-wrap">
          <table className="vc-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Zone</th>
                <th>Zone admin</th>
                <th>Delivery partner</th>
                <th>Free riders</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.vendorId} className={row.partners.length === 0 ? "gap" : undefined}>
                  <td>
                    <strong>{row.vendorName}</strong>
                    <small>{row.business === "food" ? "Food" : "Mart"}</small>
                  </td>
                  <td>{row.zone}</td>
                  <td>
                    {row.admins.length ? (
                      row.admins.join(", ")
                    ) : (
                      <span className="vc-none">None assigned</span>
                    )}
                  </td>
                  <td>
                    {row.partners.length ? (
                      row.partners.join(", ")
                    ) : (
                      <span className="vc-none">No partner in this zone</span>
                    )}
                  </td>
                  <td>
                    <span className="vc-riders">
                      <Bike size={13} /> {row.freeRiders}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
