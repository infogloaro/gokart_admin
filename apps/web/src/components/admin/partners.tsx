"use client"
// Delivery riders for the Admin portal: the riders of the delivery companies that serve this
// business, their availability and documents, and the review of new rider applications.
// New partner companies are requested from the Super Admin.
import * as Dialog from "@radix-ui/react-dialog"
import { ApiError } from "@zoauro/api-client"
import { businessName, vehicleLabel, type Business, type DeliveryBoy } from "@zoauro/shared"
import { Eye, Plus, Search, ShieldCheck } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { initials, maskPhone } from "@/lib/partners"
import { useDeliveryBoys, useReviewDeliveryBoy, useVerifyBoyDocument } from "@/lib/delivery"
import { useMe } from "@/lib/session"
import { RiderOps } from "@/components/rider-ops"
import { RiderPhase3 } from "@/components/rider-phase3"
import { AdminPartnerRequests, PartnerRequestDialog } from "./partner-request"
import { AdminBadge, AdminButton, PageHeader } from "./ui"

type Filter = "" | "active" | "pending_admin"

const STATUS_LABEL: Record<string, string> = {
  pending_admin: "Awaiting review",
  pending_super: "Awaiting Super Admin",
  corrections_requested: "Corrections requested",
  rejected: "Rejected",
  active: "Active",
  suspended: "Suspended",
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  pending_admin: "warning",
  pending_super: "warning",
  corrections_requested: "warning",
  rejected: "danger",
  suspended: "danger",
}

export function AdminPartners({ business }: { business: Business }) {
  // Global search links here with ?search=CODE; a new link starts the list over.
  const linked = useSearchParams().get("search") ?? ""
  return <RidersScreen key={linked} business={business} initialSearch={linked} />
}

function RidersScreen({ business, initialSearch }: { business: Business; initialSearch: string }) {
  const me = useMe()
  const [search, setSearch] = useState(initialSearch)
  const [filter, setFilter] = useState<Filter>("")
  const [reviewing, setReviewing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [ops, setOps] = useState(false)
  const [insights, setInsights] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const riders = useDeliveryBoys({
    business,
    status: filter || undefined,
    search: search.trim() || undefined,
    page: 1,
    pageSize: 100,
  })
  const items = riders.data?.items ?? []
  const open = items.find((boy) => boy.id === openId) ?? null
  const food = business === "food"

  if (reviewing)
    return <AdminRiderApplications business={business} close={() => setReviewing(false)} />

  return (
    <>
      <PageHeader
        title={`${food ? "Food" : "Mart"} delivery riders`}
        subtitle="Riders of the delivery companies that serve this business: availability, documents and status."
        note={<span className="live-note">● Live data</span>}
      >
        {me.data?.permissions.includes("partners.manage") && (
          <>
            <AdminButton kind="secondary" onClick={() => setOps((open) => !open)}>
              {ops ? "Hide support & cash" : "Support & cash"}
            </AdminButton>
            <AdminButton kind="secondary" onClick={() => setInsights((open) => !open)}>
              {insights ? "Hide shifts & earnings" : "Shifts & earnings"}
            </AdminButton>
            <AdminButton kind="secondary" icon={ShieldCheck} onClick={() => setReviewing(true)}>
              Rider applications
            </AdminButton>
            <AdminButton icon={Plus} onClick={() => setAdding(true)}>
              Add delivery partner
            </AdminButton>
          </>
        )}
      </PageHeader>
      {ops && <RiderOps />}
      {insights && <RiderPhase3 />}
      <AdminPartnerRequests business={business} />
      <section className="panel full-panel">
        <div className="toolbar">
          <div className="search-field">
            <Search className="icon" size={17} />
            <input
              placeholder="Search rider name, ID, mobile or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search riders"
            />
          </div>
          <div className="gk-segment" role="tablist" aria-label="Rider status">
            {(["", "active", "pending_admin"] as const).map((value) => (
              <button
                type="button"
                role="tab"
                key={value || "all"}
                aria-selected={filter === value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {value === "" ? "All" : value === "active" ? "Active" : "Awaiting review"}
              </button>
            ))}
          </div>
        </div>
        {riders.isError && <p className="admin-empty">Couldn’t load riders. Try again.</p>}
        {riders.data && items.length === 0 && (
          <p className="admin-empty">No riders match these filters.</p>
        )}
        {items.length > 0 && (
          <div className="table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Company</th>
                  <th>Zone</th>
                  <th>Vehicle</th>
                  <th>Availability</th>
                  <th>Status</th>
                  <th>Documents</th>
                </tr>
              </thead>
              <tbody>
                {items.map((boy) => (
                  <tr key={boy.id} onClick={() => setOpenId(boy.id)} className="clickable">
                    <td>
                      <strong>{boy.name}</strong>
                      <br />
                      <small>
                        {boy.code} · {maskPhone(boy.phone)}
                      </small>
                    </td>
                    <td>{boy.fleetName}</td>
                    <td>
                      {boy.zoneName}
                      <br />
                      <small>{boy.district}</small>
                    </td>
                    <td>
                      {vehicleLabel[boy.vehicleType]} · {boy.vehicleNumber}
                    </td>
                    <td>{boy.availability.replaceAll("_", " ")}</td>
                    <td>
                      <AdminBadge tone={STATUS_TONE[boy.status] ?? "neutral"}>
                        {STATUS_LABEL[boy.status] ?? boy.status}
                      </AdminBadge>
                    </td>
                    <td>
                      {boy.documents.filter((doc) => doc.verified).length} of {boy.documents.length}{" "}
                      verified
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <AdminRiderReview boy={open} close={() => setOpenId(null)} />}
      {adding && <PartnerRequestDialog business={business} close={() => setAdding(false)} />}
    </>
  )
}

function AdminRiderApplications({ business, close }: { business: Business; close: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const applications = useDeliveryBoys({
    status: "pending_admin",
    page: 1,
    pageSize: 100,
  })
  const selected = applications.data?.items.find((boy) => boy.id === selectedId) ?? null
  return (
    <>
      <PageHeader
        title={`${businessName[business]} rider applications`}
        subtitle="Review rider details and documents for your authorized zones."
      >
        <AdminButton kind="secondary" onClick={close}>
          Back to delivery partners
        </AdminButton>
      </PageHeader>
      <section className="panel full-panel">
        {applications.isError && (
          <p style={{ padding: "1rem" }}>
            {applications.error instanceof ApiError
              ? applications.error.message
              : "Couldn't load rider applications."}
          </p>
        )}
        {applications.data?.items.length === 0 && (
          <p style={{ padding: "1rem" }}>No applications are waiting for Admin review.</p>
        )}
        <div className="partner-cards">
          {applications.data?.items.map((boy, index) => (
            <article className="partner-card" key={boy.id}>
              <div className="partner-card-head">
                <span className={`avatar a${index % 4}`}>{initials(boy.name)}</span>
                <div>
                  <h3>{boy.name}</h3>
                  <small>
                    {boy.code} · {maskPhone(boy.phone)}
                  </small>
                </div>
              </div>
              <div className="partner-badges">
                <AdminBadge tone="info">{boy.fleetName}</AdminBadge>
                <AdminBadge tone="warning">Admin review</AdminBadge>
              </div>
              <div className="partner-stats">
                <div>
                  <small>DISTRICT / ZONE</small>
                  <strong>
                    {boy.district} / {boy.zoneName}
                  </strong>
                </div>
                <div>
                  <small>DOCUMENTS</small>
                  <strong>{boy.documents.filter((doc) => doc.verified).length} verified</strong>
                </div>
                <div>
                  <small>VEHICLE</small>
                  <strong>
                    {boy.vehicleType} · {boy.vehicleNumber}
                  </strong>
                </div>
              </div>
              <div className="card-actions">
                <AdminButton kind="secondary" icon={Eye} onClick={() => setSelectedId(boy.id)}>
                  Review application
                </AdminButton>
              </div>
            </article>
          ))}
        </div>
      </section>
      {selected && (
        <AdminRiderReview
          key={`${selected.id}-${selected.version}`}
          boy={selected}
          close={() => setSelectedId(null)}
        />
      )}
    </>
  )
}

function AdminRiderReview({ boy, close }: { boy: DeliveryBoy; close: () => void }) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const review = useReviewDeliveryBoy()
  const verify = useVerifyBoyDocument()

  const decide = async (decision: "forwarded" | "corrections_requested" | "rejected") => {
    if (reason.trim().length < 3) {
      setError("Enter a reason for this decision. It is saved to the application history.")
      return
    }
    try {
      await review.mutateAsync({
        id: boy.id,
        body: { decision, version: boy.version, reason: reason.trim() },
      })
      close()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Couldn't save the review.")
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Overlay className="drawer-backdrop">
        <Dialog.Content className="drawer" aria-describedby={undefined}>
          <div className="drawer-head">
            <div>
              <Dialog.Title>{boy.name}</Dialog.Title>
              <small>
                {boy.code} · {boy.fleetName} · {boy.district} / {boy.zoneName}
              </small>
            </div>
            <button type="button" className="icon-btn" onClick={close} aria-label="Close review">
              ×
            </button>
          </div>
          <div className="drawer-body">
            <section className="profile-section">
              <h3>Personal and vehicle details</h3>
              <p>
                {boy.phone} · {boy.email || "No email"}
              </p>
              <p>{boy.address}</p>
              <p>
                Date of birth: {boy.dateOfBirth ?? "Not provided"} · Gender:{" "}
                {boy.gender ?? "Not provided"} · PIN: {boy.pinCode ?? "Not provided"}
              </p>
              <p>
                Driving licence: {boy.drivingLicence ?? "Not provided"} · Valid until:{" "}
                {boy.licenceValidUntil ?? "Not provided"}
              </p>
              <p>
                {vehicleLabel[boy.vehicleType]} · {boy.vehicleNumber} ·{" "}
                {boy.vehicleModel ?? "Model not provided"}
              </p>
              <p>
                Payout:{" "}
                {boy.payout
                  ? `${boy.payout.holderName} · ${boy.payout.bankName ?? "Bank"} · •••• ${boy.payout.last4} · ${boy.payout.ifsc}`
                  : "Not provided"}
              </p>
            </section>
            <section className="profile-section">
              <h3>Required documents</h3>
              {boy.documents.map((document) => (
                <div className="document-row" key={document.id}>
                  <span>
                    {document.kind.replaceAll("_", " ")} · {document.fileName}
                  </span>
                  <AdminBadge tone={document.verified ? "success" : "warning"}>
                    {document.verified ? "Verified" : "Unverified"}
                  </AdminBadge>
                  <AdminButton
                    kind="secondary"
                    onClick={() =>
                      window.open(
                        `/api/v1/delivery/boys/${boy.id}/documents/${document.id}/file`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    View
                  </AdminButton>
                  <AdminButton
                    kind="secondary"
                    disabled={verify.isPending}
                    onClick={() => {
                      if (reason.trim().length < 3) {
                        setError("Enter a reason in the box below before verifying a document.")
                        return
                      }
                      verify.mutate(
                        {
                          id: boy.id,
                          docId: document.id,
                          verified: !document.verified,
                          reason: reason.trim(),
                        },
                        {
                          onError: (cause) =>
                            setError(
                              cause instanceof ApiError
                                ? cause.message
                                : "Couldn't verify document.",
                            ),
                        },
                      )
                    }}
                  >
                    {document.verified ? "Unverify" : "Verify"}
                  </AdminButton>
                </div>
              ))}
            </section>
            <label className="form-field">
              <span>Reason (required for every decision and document change)</span>
              <textarea
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="card-actions">
              <AdminButton kind="secondary" onClick={() => void decide("corrections_requested")}>
                Request corrections
              </AdminButton>
              <AdminButton kind="danger" onClick={() => void decide("rejected")}>
                Reject
              </AdminButton>
              <AdminButton disabled={review.isPending} onClick={() => void decide("forwarded")}>
                Forward to Super Admin
              </AdminButton>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  )
}
