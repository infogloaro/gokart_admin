"use client"
// Delivery partners for the Admin portal: partner cards, the profile drawer, rider reviews and
// requests for new partners. New partners are sent to the Super Admin for approval.
import * as Dialog from "@radix-ui/react-dialog"
import { ApiError } from "@zoauro/api-client"
import {
  availabilityLabel,
  businessName,
  partnerStatusLabel,
  vehicleLabel,
  type Business,
  type DeliveryBoy,
  type PartnerAvailability,
  type PartnerStatus,
} from "@zoauro/shared"
import { Eye, Lock, Plus, Search, ShieldCheck, X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import {
  initials,
  maskPhone,
  partnerStatusTone,
  servicesLabel,
  usePartner,
  usePartners,
  usePartnerSummary,
  verificationOf,
} from "@/lib/partners"
import { useMe } from "@/lib/session"
import { useDeliveryBoys, useReviewDeliveryBoy, useVerifyBoyDocument } from "@/lib/delivery"
import { activityLabel, dateLabel, dateTimeLabel } from "@/lib/vendors"
import { AvailabilityControl } from "./availability"
import { AdminDocuments } from "./documents"
import { AdminPartnerRequests, PartnerRequestDialog } from "./partner-request"
import { AdminBadge, AdminButton, PageHeader } from "./ui"

type Filter = "" | PartnerAvailability | "pending_approval"

export function AdminPartners({ business }: { business: Business }) {
  // Global search links here with ?search=CODE; a new link starts the list over.
  const linked = useSearchParams().get("search") ?? ""
  return <PartnersScreen key={linked} business={business} initialSearch={linked} />
}

function PartnersScreen({
  business,
  initialSearch,
}: {
  business: Business
  initialSearch: string
}) {
  const me = useMe()
  const [search, setSearch] = useState(initialSearch)
  const [filter, setFilter] = useState<Filter>("")
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [reviewingRiders, setReviewingRiders] = useState(false)
  const pending = filter === "pending_approval"
  const partners = usePartners({
    business,
    ...(filter &&
      !pending && {
        status: "active" as PartnerStatus,
        availability: filter as PartnerAvailability,
      }),
    ...(pending && { status: "pending_approval" as PartnerStatus }),
    search: search.trim() || undefined,
    page: 1,
    pageSize: 100,
  })
  const summary = usePartnerSummary(business)
  const s = summary.data
  const food = business === "food"

  if (reviewingRiders)
    return <AdminRiderApplications business={business} close={() => setReviewingRiders(false)} />

  return (
    <>
      <PageHeader
        title={`${food ? "Food" : "Mart"} delivery partners`}
        subtitle={`Availability, workload, verification and performance for ${food ? "food deliveries" : "parcel shipments"}.`}
        note={<span className="live-note">● Live data</span>}
      >
        {me.data?.permissions.includes("partners.manage") && (
          <>
            <AdminButton
              kind="secondary"
              icon={ShieldCheck}
              onClick={() => setReviewingRiders(true)}
            >
              Rider applications
            </AdminButton>
            <AdminButton icon={Plus} onClick={() => setAdding(true)}>
              Add delivery partner
            </AdminButton>
          </>
        )}
      </PageHeader>
      <AdminPartnerRequests business={business} />
      <div className="partner-summary">
        <div>
          <i className="online" />
          <span>
            <b>{s ? s.available + s.onDelivery : "—"}</b> online
          </span>
        </div>
        <div>
          <i className="available" />
          <span>
            <b>{s?.available ?? "—"}</b> available
          </span>
        </div>
        <div>
          <i className="busy" />
          <span>
            <b>{s?.onDelivery ?? "—"}</b> on assignment
          </span>
        </div>
        <div>
          <i className="review" />
          <span>
            <b>{s?.pending ?? "—"}</b> pending verification
          </span>
        </div>
      </div>
      <section className="panel full-panel">
        <div className="toolbar">
          <div className="search-field">
            <Search className="icon" size={17} />
            <input
              placeholder="Search partner name, ID or mobile…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search partners"
            />
          </div>
          <select
            className="filter-button"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Availability"
          >
            <option value="">Availability: All</option>
            <option value="available">Available</option>
            <option value="on_delivery">On delivery</option>
            <option value="offline">Offline</option>
            <option value="pending_approval">Pending verification</option>
          </select>
        </div>
        {partners.isError && (
          <p style={{ padding: "1rem" }}>
            {partners.error instanceof ApiError
              ? partners.error.message
              : "Couldn't load partners."}
          </p>
        )}
        {partners.data?.items.length === 0 && (
          <p style={{ padding: "1rem" }}>No delivery partners match these filters.</p>
        )}
        <div className="partner-cards">
          {partners.data?.items.map((p, i) => {
            const verify = verificationOf(p)
            return (
              <article className="partner-card" key={p.id}>
                <div className="partner-card-head">
                  <span className={`avatar a${i % 4}`}>{initials(p.name)}</span>
                  <div>
                    <h3>{p.name}</h3>
                    <small>
                      {p.code} · {maskPhone(p.phone)}
                    </small>
                  </div>
                </div>
                <div className="partner-badges">
                  <AdminBadge tone={verify === "Verified" ? "success" : "warning"}>
                    {verify}
                  </AdminBadge>
                  {p.status === "active" ? (
                    <AdminBadge
                      tone={
                        p.availability === "available"
                          ? "success"
                          : p.availability === "on_delivery"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {p.availability === "available"
                        ? "Available"
                        : availabilityLabel[p.availability]}
                    </AdminBadge>
                  ) : (
                    <AdminBadge tone={partnerStatusTone(p.status)}>
                      {partnerStatusLabel[p.status]}
                    </AdminBadge>
                  )}
                  <AdminBadge tone="info">
                    {p.businesses.length > 1
                      ? "Food + Mart"
                      : p.businesses[0] === "food"
                        ? "Food"
                        : "Mart"}
                  </AdminBadge>
                </div>
                <div className="partner-stats">
                  <div>
                    <small>CURRENT {food ? "ORDER" : "SHIPMENT"}</small>
                    <strong>{p.currentOrderCode ? `#${p.currentOrderCode}` : "—"}</strong>
                  </div>
                  <div>
                    <small>VEHICLE</small>
                    <strong>{vehicleLabel[p.vehicleType]}</strong>
                  </div>
                  <div>
                    <small>COMPLETED</small>
                    <strong>{p.deliveriesCompleted.toLocaleString("en-IN")}</strong>
                  </div>
                  <div>
                    <small>RATING</small>
                    <strong>{p.rating === null ? "—" : `★ ${p.rating.toFixed(1)}`}</strong>
                  </div>
                </div>
                <div className="card-actions">
                  <AdminButton kind="secondary" icon={Eye} onClick={() => setSelected(p.id)}>
                    View profile
                  </AdminButton>
                </div>
              </article>
            )
          })}
        </div>
      </section>
      {selected && <PartnerProfile id={selected} close={() => setSelected(null)} />}
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

function PartnerProfile({ id, close }: { id: string; close: () => void }) {
  const { data: p, isError, refetch } = usePartner(id)
  const me = useMe()
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Overlay className="drawer-backdrop">
        <Dialog.Content className="drawer" aria-describedby={undefined}>
          <div className="drawer-head">
            <div>
              <small>DELIVERY PARTNER</small>
              <Dialog.Title asChild>
                <h2>{p?.name ?? "Loading…"}</h2>
              </Dialog.Title>
            </div>
            <Dialog.Close aria-label="Close">
              <X className="icon" size={20} />
            </Dialog.Close>
          </div>
          {isError && <p>Couldn&apos;t load this partner.</p>}
          {p && (
            <>
              <div className="drawer-status">
                <AdminBadge tone={partnerStatusTone(p.status)}>
                  {partnerStatusLabel[p.status]}
                </AdminBadge>
                <span>
                  {p.code} · {servicesLabel(p.businesses)}
                </span>
              </div>
              {p.status === "pending_approval" && (
                <p className="security-note" style={{ display: "flex", gap: 8 }}>
                  <Lock className="icon" size={16} />
                  Waiting for Super Admin approval. The partner can&apos;t take orders yet.
                </p>
              )}
              {p.decisionReason && (
                <p style={{ fontSize: 13, color: "#b42318" }}>
                  {partnerStatusLabel[p.status]}: {p.decisionReason}
                </p>
              )}
              {p.status === "active" && (
                <section className="drawer-section availability-box">
                  <h3>Availability · {availabilityLabel[p.availability]}</h3>
                  <AvailabilityControl partner={p} onDone={() => void refetch()} />
                </section>
              )}
              <section className="drawer-section split-info">
                <div>
                  <small>MOBILE</small>
                  <strong>{p.phone}</strong>
                  <p>{p.email ?? "No email"}</p>
                </div>
                <div>
                  <small>SERVICE AREA</small>
                  <strong>{p.zoneName}</strong>
                  <p>{p.address ?? ""}</p>
                </div>
              </section>
              <section className="drawer-section split-info">
                <div>
                  <small>VEHICLE</small>
                  <strong>
                    {vehicleLabel[p.vehicleType]} · {p.vehicleNumber}
                  </strong>
                  <p>{p.vehicleModel ?? ""}</p>
                </div>
                <div>
                  <small>DRIVING LICENCE</small>
                  <strong>{p.drivingLicence}</strong>
                  <p>
                    {p.licenceValidUntil ? `Valid until ${dateLabel(p.licenceValidUntil)}` : ""}
                  </p>
                </div>
              </section>
              <section className="drawer-section split-info">
                <div>
                  <small>PAYOUT ACCOUNT</small>
                  <strong>
                    {p.bank ? `${p.bank.bankName ?? "Bank"} · ••${p.bank.last4}` : "Not added"}
                  </strong>
                  <p>{p.bank ? (p.bank.verified ? "Verified" : "Not verified") : ""}</p>
                </div>
                <div>
                  <small>PERFORMANCE</small>
                  <strong>
                    {p.deliveriesCompleted.toLocaleString("en-IN")} deliveries ·{" "}
                    {p.rating === null ? "No rating" : `★ ${p.rating.toFixed(1)}`}
                  </strong>
                  <p>{p.currentOrderCode ? `Carrying #${p.currentOrderCode}` : ""}</p>
                </div>
              </section>
              <AdminDocuments
                owner="partners"
                id={p.id}
                kinds={[
                  "aadhaar",
                  "driving_licence",
                  "vehicle_rc",
                  "insurance",
                  "bank_proof",
                  "photo",
                ]}
                documents={p.documents}
                canUpload={Boolean(me.data?.permissions.includes("partners.manage"))}
              />
              {p.activity.length > 0 && (
                <section className="drawer-section">
                  <h3>Activity</h3>
                  {p.activity.map((a, i) => (
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
            </>
          )}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  )
}
