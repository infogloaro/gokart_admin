"use client"
// Delivery partners for the Admin portal: the prototype's partner cards, profile drawer
// and onboarding wizard. Applications go to the Super Admin for approval.
import * as Dialog from "@radix-ui/react-dialog"
import { ApiError } from "@zoauro/api-client"
import {
  availabilityLabel,
  businessName,
  GENDERS,
  partnerStatusLabel,
  VEHICLE_TYPES,
  vehicleLabel,
  type Business,
  type PartnerAvailability,
  type PartnerStatus,
} from "@zoauro/shared"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Eye,
  LayoutGrid,
  Lock,
  Package,
  Plus,
  Search,
  ShieldCheck,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { useState, type InputHTMLAttributes, type ReactNode } from "react"
import {
  initials,
  maskPhone,
  PARTNER_STEPS,
  partnerStatusTone,
  servicesLabel,
  usePartner,
  usePartners,
  usePartnerSummary,
  usePartnerWizard,
  verificationOf,
  type PartnerForm,
} from "@/lib/partners"
import { useMe, useZones } from "@/lib/session"
import { activityLabel, dateLabel, dateTimeLabel } from "@/lib/vendors"
import { AdminBadge, AdminBrand, AdminButton, PageHeader } from "./ui"

type Filter = "" | PartnerAvailability | "pending_approval"

export function AdminPartners({ business }: { business: Business }) {
  const me = useMe()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("")
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
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

  return (
    <>
      <PageHeader
        title={`${food ? "Food" : "Mart"} delivery partners`}
        subtitle={`Availability, workload, verification and performance for ${food ? "food deliveries" : "parcel shipments"}.`}
        note={<span className="live-note">● Live data</span>}
      >
        {me.data?.permissions.includes("partners.manage") && (
          <AdminButton icon={Plus} onClick={() => setAdding(true)}>
            Add delivery partner
          </AdminButton>
        )}
      </PageHeader>
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
      {adding && <Wizard business={business} close={() => setAdding(false)} />}
    </>
  )
}

function PartnerProfile({ id, close }: { id: string; close: () => void }) {
  const { data: p, isError } = usePartner(id)
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

function Field({
  label,
  error,
  wide,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | undefined
  wide?: boolean
}) {
  return (
    <label className={`form-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <input aria-invalid={Boolean(error)} {...rest} />
      {error && <small>{error}</small>}
    </label>
  )
}

function Choice({
  label,
  value,
  onChange,
  error,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string | undefined
  children: ReactNode
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      {error && <small>{error}</small>}
    </label>
  )
}

const STEP_COPY = [
  "Enter the partner's personal, contact, address and service eligibility details.",
  "Record the driving licence. Identity documents are verified separately; nothing is auto-verified.",
  "Add the primary vehicle the partner will deliver with.",
  "Configure secure payout details. Only the last four digits are stored.",
  "Confirm each section before submitting the application for review.",
]

function Wizard({ business, close }: { business: Business; close: () => void }) {
  const zones = useZones()
  const w = usePartnerWizard(business, "")
  const { step, form, set, errors } = w
  const [consent, setConsent] = useState(true)
  const field = (k: keyof PartnerForm, errKey: string = k) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => set(k)(e.target.value),
    error: errors[errKey],
  })

  if (w.create.isSuccess)
    return (
      <div className="modal-backdrop">
        <div className="confirmation-modal" role="dialog" aria-label="Application submitted">
          <div className="success-seal">
            <Check className="icon" size={34} />
          </div>
          <AdminBadge tone="success">SUBMITTED</AdminBadge>
          <h2>Delivery Partner Application Submitted</h2>
          <p>The application is queued for Super Admin review. The partner is not active yet.</p>
          <div className="confirm-details">
            <div>
              <small>APPLICATION ID</small>
              <strong>{w.create.data.code}</strong>
            </div>
            <div>
              <small>SUBMISSION DATE</small>
              <strong>{dateTimeLabel(w.create.data.createdAt)}</strong>
            </div>
            <div>
              <small>VERIFICATION STATUS</small>
              <AdminBadge tone="warning">Under review</AdminBadge>
            </div>
            <div>
              <small>NEXT ACTION</small>
              <strong>Super Admin approval</strong>
            </div>
          </div>
          <AdminButton onClick={close}>Back to delivery partners</AdminButton>
        </div>
      </div>
    )

  const zone = zones.data?.find((z) => z.id === form.zoneId)
  const reviewRows: [string, string, string, number][] = [
    [
      "Personal information",
      "Partner name and contact details",
      `${form.name || "Not provided"} · ${form.phone || "No mobile"}`,
      0,
    ],
    [
      "Service eligibility",
      "Business and service area",
      `${form.service === "both" ? "Food + Mart" : businessName[form.service]} · ${zone ? `${zone.location}, ${zone.city}` : "No area"}`,
      0,
    ],
    ["Identity & license", "Driving licence", form.drivingLicence || "Not provided", 1],
    [
      "Vehicle information",
      "Primary delivery vehicle",
      `${vehicleLabel[form.vehicleType]} · ${form.vehicleNumber || "No registration"}`,
      2,
    ],
    [
      "Payout information",
      "Secure settlement account",
      form.accountNumber
        ? `${form.bankName} · Account ending ••${form.accountNumber.slice(-4)}`
        : "Not provided",
      3,
    ],
  ]

  return (
    <div className="wizard-shell" role="dialog" aria-label="New delivery partner">
      <header>
        <AdminBrand />
        <div>
          <AdminBadge tone="warning">Draft</AdminBadge>
          <button type="button" onClick={close} aria-label="Close onboarding">
            <X className="icon" size={20} />
          </button>
        </div>
      </header>
      <div className="wizard-body">
        <aside className="stepper">
          <div>
            <small>PARTNER ONBOARDING</small>
            <h2>New delivery partner</h2>
            <p>Complete all required details. Verification is handled separately.</p>
          </div>
          <ol>
            {PARTNER_STEPS.map(([title, copy], i) => (
              <li
                key={title}
                className={i === step ? "active" : i < step ? "done" : ""}
                aria-current={i === step ? "step" : undefined}
              >
                <span>{i < step ? <Check className="icon" size={14} /> : i + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{copy}</small>
                </div>
              </li>
            ))}
          </ol>
          <div className="privacy-card">
            <ShieldCheck className="icon" size={20} />
            <div>
              <strong>Sensitive data protected</strong>
              <p>Identity and banking details are masked and permission-gated.</p>
            </div>
          </div>
        </aside>
        <main className="wizard-main">
          <div className="wizard-title">
            <span>STEP {step + 1} OF 5</span>
            <h1>{PARTNER_STEPS[step]![0]}</h1>
            <p>{STEP_COPY[step]}</p>
          </div>
          {w.create.isError && (
            <p role="alert" style={{ color: "#b42318", fontSize: 13, display: "flex", gap: 6 }}>
              <AlertTriangle className="icon" size={16} />
              {w.create.error instanceof ApiError
                ? w.create.error.message
                : "Couldn't submit the application."}
            </p>
          )}
          {step === 0 && (
            <div className="form-section">
              <h3>Basic details</h3>
              <div className="form-grid">
                <Field label="Full name *" placeholder="Enter legal full name" {...field("name")} />
                <Field label="Date of birth" type="date" {...field("dateOfBirth")} />
                <Choice
                  label="Gender"
                  value={form.gender}
                  onChange={set("gender")}
                  error={errors.gender}
                >
                  <option value="">Select gender</option>
                  {GENDERS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </Choice>
                <Field
                  label="Mobile number *"
                  placeholder="+91 98765 43210"
                  inputMode="tel"
                  {...field("phone")}
                />
                <Field
                  label="Email address"
                  type="email"
                  placeholder="name@example.com"
                  {...field("email")}
                />
                <Field
                  label="PIN code"
                  placeholder="600040"
                  inputMode="numeric"
                  {...field("pinCode")}
                />
                <Field
                  label="Residential address"
                  placeholder="House, street, locality"
                  wide
                  {...field("address")}
                />
                <Choice
                  label="Service area *"
                  value={form.zoneId}
                  onChange={set("zoneId")}
                  error={errors.zoneId}
                >
                  <option value="">Choose a service area</option>
                  {zones.data?.map((z) => (
                    <option value={z.id} key={z.id}>
                      {z.location}, {z.city}
                    </option>
                  ))}
                </Choice>
              </div>
              <h3>Service eligibility</h3>
              <div className="eligibility">
                {(
                  [
                    ["food", UtensilsCrossed, "ZOAURO FOOD", "Restaurant pickup and food delivery"],
                    ["mart", Package, "GLOARO MART", "Seller pickup and parcel delivery"],
                    ["both", LayoutGrid, "Both businesses", "Requires dual eligibility approval"],
                  ] as const
                ).map(([value, Icon, title, copy]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="service"
                      checked={form.service === value}
                      onChange={() => set("service")(value)}
                    />
                    <span>
                      <Icon className="icon" size={20} />
                      <b>{title}</b>
                      <small>{copy}</small>
                    </span>
                  </label>
                ))}
              </div>
              {errors.businesses && <small style={{ color: "#b42318" }}>{errors.businesses}</small>}
            </div>
          )}
          {step === 1 && (
            <div className="form-section">
              <div className="form-grid">
                <Field
                  label="Driving licence number *"
                  placeholder="TN01 20210048217"
                  {...field("drivingLicence")}
                />
                <Field label="Licence valid until" type="date" {...field("licenceValidUntil")} />
              </div>
              <div className="security-note">
                <Lock className="icon" size={16} />
                <span>
                  Aadhaar and licence images are uploaded and verified by authorised reviewers. File
                  upload arrives with document storage.
                </span>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="form-section">
              <div className="form-grid">
                <Choice
                  label="Vehicle type *"
                  value={form.vehicleType}
                  onChange={set("vehicleType")}
                >
                  {VEHICLE_TYPES.map((v) => (
                    <option value={v} key={v}>
                      {vehicleLabel[v]}
                    </option>
                  ))}
                </Choice>
                <Field
                  label="Registration number *"
                  placeholder="TN 01 AB 4821"
                  {...field("vehicleNumber")}
                />
                <Field label="Vehicle model" placeholder="Model name" {...field("vehicleModel")} />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="form-section">
              <div className="bank-alert">
                <ShieldCheck className="icon" size={20} />
                <div>
                  <strong>Bank-grade privacy</strong>
                  <p>Account details are never displayed in full in list views.</p>
                </div>
              </div>
              <div className="form-grid">
                <Field
                  label="Account holder name"
                  placeholder="As per bank records"
                  {...field("holderName", "bank.holderName")}
                />
                <Field
                  label="Bank name"
                  placeholder="Bank name"
                  {...field("bankName", "bank.bankName")}
                />
                <Field
                  label="Account number"
                  type="password"
                  inputMode="numeric"
                  placeholder="Enter account number"
                  {...field("accountNumber", "bank.accountNumber")}
                />
                <Field
                  label="Confirm account number"
                  type="password"
                  inputMode="numeric"
                  placeholder="Re-enter account number"
                  {...field("confirmAccount")}
                />
                <Field
                  label="IFSC code"
                  placeholder="ABCD0123456"
                  {...field("ifsc", "bank.ifsc")}
                />
              </div>
              <p className="verification-copy">
                Payout verification remains <AdminBadge tone="neutral">Not verified</AdminBadge>{" "}
                until an actual verification result is received.
              </p>
            </div>
          )}
          {step === 4 && (
            <div className="review-list">
              <div className="review-warning">
                <AlertTriangle className="icon" size={20} />
                <div>
                  <strong>Review before submission</strong>
                  <p>Submission starts verification. It does not activate this delivery partner.</p>
                </div>
              </div>
              {reviewRows.map((r) => (
                <section key={r[0]}>
                  <span className="review-check">
                    <Check className="icon" size={16} />
                  </span>
                  <div>
                    <small>{r[1]}</small>
                    <h3>{r[0]}</h3>
                    <p>{r[2]}</p>
                  </div>
                  <AdminButton kind="ghost" onClick={() => w.goTo(r[3])}>
                    Edit
                  </AdminButton>
                </section>
              ))}
              <label className="review-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I confirm that the information is ready for authorized verification and that no
                  documents have been automatically approved.
                </span>
              </label>
            </div>
          )}
        </main>
      </div>
      <footer className="wizard-footer">
        <AdminButton kind="ghost" onClick={close}>
          Cancel
        </AdminButton>
        <div>
          {step > 0 && (
            <AdminButton kind="secondary" onClick={w.back}>
              Previous
            </AdminButton>
          )}
          <AdminButton
            disabled={step === 4 && (!consent || w.create.isPending)}
            onClick={step === 4 ? w.submit : w.next}
          >
            {step === 4 ? "Submit for verification" : "Continue"}{" "}
            <ArrowRight className="icon" size={16} />
          </AdminButton>
        </div>
      </footer>
    </div>
  )
}
