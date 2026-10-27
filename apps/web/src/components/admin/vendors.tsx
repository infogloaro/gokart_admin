"use client"
// Restaurants / sellers in the admin's zones (prototype "vendors" overview cards).
import * as Dialog from "@radix-ui/react-dialog"
import { ApiError } from "@zoauro/api-client"
import {
  formatINR,
  vendorStatusLabel,
  verificationLabel,
  type Business,
  type VendorStatus,
} from "@zoauro/shared"
import { ChevronRight, FileText, Search, Store, X } from "lucide-react"
import { useState } from "react"
import {
  activityLabel,
  dateTimeLabel,
  documentLabel,
  useVendor,
  useVendors,
  vendorStatusTone,
  verificationTone,
} from "@/lib/vendors"
import { AdminBadge, PageHeader } from "./ui"

export function AdminVendors({ business }: { business: Business }) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<VendorStatus | "">("")
  const [selected, setSelected] = useState<string | null>(null)
  const vendors = useVendors({
    business,
    status: status || undefined,
    search: search.trim() || undefined,
    page: 1,
    pageSize: 100,
  })
  const food = business === "food"

  return (
    <>
      <PageHeader
        title={food ? "Restaurant operations" : "Seller overview"}
        subtitle={
          food
            ? "Monitor assigned restaurants, current orders and preparation delays."
            : "Monitor existing seller records, fulfilment and escalations without duplication."
        }
        note={<span className="live-note">● Live data</span>}
      />
      <section className="panel full-panel">
        <div className="toolbar">
          <div className="search-field">
            <Search className="icon" size={17} />
            <input
              placeholder={`Search ${food ? "restaurant" : "seller"}, owner or ID…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={`Search ${food ? "restaurants" : "sellers"}`}
            />
          </div>
          <select
            className="filter-button"
            value={status}
            onChange={(e) => setStatus(e.target.value as VendorStatus | "")}
            aria-label="Status"
          >
            <option value="">Status: All</option>
            <option value="active">Active</option>
            <option value="pending_review">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        {vendors.isError && (
          <p style={{ padding: "1rem" }}>
            {vendors.error instanceof ApiError ? vendors.error.message : "Couldn't load vendors."}
          </p>
        )}
        {vendors.data?.items.length === 0 && (
          <p style={{ padding: "1rem" }}>
            No {food ? "restaurants" : "sellers"} match these filters.
          </p>
        )}
      </section>
      <div className="feature-grid vendors">
        {vendors.data?.items.map((v) => (
          <article className="feature-card" key={v.id}>
            <div className="feature-icon">
              <Store className="icon" size={20} />
            </div>
            <div className="feature-content">
              <h3>{v.name}</h3>
              <p>
                {v.openOrders} open · {v.ordersCount} orders · {v.zoneName}
              </p>
              <AdminBadge tone={vendorStatusTone(v.status)}>
                {vendorStatusLabel[v.status]}
              </AdminBadge>
            </div>
            <button
              type="button"
              className="circle-action"
              aria-label={`Open ${v.name}`}
              onClick={() => setSelected(v.id)}
            >
              <ChevronRight className="icon" size={16} />
            </button>
          </article>
        ))}
      </div>
      {selected && <VendorDrawer id={selected} close={() => setSelected(null)} />}
    </>
  )
}

function VendorDrawer({ id, close }: { id: string; close: () => void }) {
  const { data: v, isError } = useVendor(id)
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Overlay className="drawer-backdrop">
        <Dialog.Content className="drawer" aria-describedby={undefined}>
          <div className="drawer-head">
            <div>
              <small>{v?.business === "mart" ? "SELLER" : "RESTAURANT"}</small>
              <Dialog.Title asChild>
                <h2>{v?.name ?? "Loading…"}</h2>
              </Dialog.Title>
            </div>
            <Dialog.Close aria-label="Close">
              <X className="icon" size={20} />
            </Dialog.Close>
          </div>
          {isError && <p>Couldn&apos;t load this vendor.</p>}
          {v && (
            <>
              <div className="drawer-status">
                <AdminBadge tone={vendorStatusTone(v.status)}>
                  {vendorStatusLabel[v.status]}
                </AdminBadge>
                <AdminBadge tone={verificationTone(v.verification)}>
                  {verificationLabel[v.verification]}
                </AdminBadge>
                <span>{v.code}</span>
              </div>
              <section className="drawer-section split-info">
                <div>
                  <small>OPEN ORDERS</small>
                  <strong>{v.openOrders}</strong>
                </div>
                <div>
                  <small>SALES (DELIVERED)</small>
                  <strong>{formatINR(v.salesPaise)}</strong>
                </div>
              </section>
              <section className="drawer-section split-info">
                <div>
                  <small>OWNER</small>
                  <strong>{v.ownerName}</strong>
                  <p>{v.phone}</p>
                </div>
                <div>
                  <small>SERVICE AREA</small>
                  <strong>{v.zoneName}</strong>
                  <p>{v.address}</p>
                </div>
              </section>
              <section className="drawer-section">
                <h3>Documents</h3>
                {v.documents.map((d) => (
                  <div className="item-row" key={d.kind + d.fileName}>
                    <span className="item-thumb">
                      <FileText className="icon" size={20} />
                    </span>
                    <div>
                      <strong>{documentLabel[d.kind] ?? d.kind}</strong>
                      <small>{d.fileName}</small>
                    </div>
                    <AdminBadge tone={d.verified ? "success" : "warning"}>
                      {d.verified ? "Verified" : "Pending"}
                    </AdminBadge>
                  </div>
                ))}
                {v.documents.length === 0 && <p>No documents uploaded yet.</p>}
              </section>
              {v.activity.length > 0 && (
                <section className="drawer-section">
                  <h3>Activity</h3>
                  {v.activity.map((a, i) => (
                    <div className="item-row" key={i}>
                      <span />
                      <div>
                        <strong>{activityLabel(a.action)}</strong>
                        <small>
                          {dateTimeLabel(a.at)} · {a.actorName}
                          {a.reason && ` · ${a.reason}`}
                        </small>
                      </div>
                    </div>
                  ))}
                </section>
              )}
              <p style={{ fontSize: 12, color: "#64748b" }}>
                Approvals and suspensions are handled by the Super Admin.
              </p>
            </>
          )}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  )
}
