"use client"
// Delivery partners for the Super Admin portal: the prototype's partner table, its
// application approval drawer and the full-screen onboarding wizard.
import { ApiError } from "@zoauro/api-client"
import {
  AVAILABILITY,
  availabilityLabel,
  businessName,
  GENDERS,
  PARTNER_REJECTION_REASONS,
  partnerDecisions,
  partnerStatusLabel,
  VEHICLE_TYPES,
  vehicleLabel,
  type PartnerAvailability,
  type PartnerDetail,
  type PartnerStatus,
} from "@zoauro/shared"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { useState } from "react"
import {
  availabilityTone,
  initials,
  PARTNER_STEPS,
  partnerStatusTone,
  servicesLabel,
  usePartner,
  usePartnerDecision,
  usePartners,
  usePartnerSummary,
  usePartnerWizard,
  verificationOf,
} from "@/lib/partners"
import { useMe, useZones } from "@/lib/session"
import { activityLabel, dateLabel, dateTimeLabel } from "@/lib/vendors"
import { DecisionDialog, type Decision } from "./decision"
import { useBusinessFilter } from "./shell"
import {
  Badge,
  Button,
  Drawer,
  ErrorBox,
  IconButton,
  Input,
  Logo,
  Panel,
  Section,
  Select,
  Value,
} from "./ui"

const PAGE_SIZE = 10
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)
const SUSPEND_REASONS = [
  "Repeated late deliveries",
  "Customer safety complaint",
  "Documents expired",
  "Inactive for 30 days",
]

type StatusFilter = "" | "pending_approval" | "suspended" | "rejected" | PartnerAvailability

export function SuperPartners() {
  const business = useBusinessFilter()
  const me = useMe()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<StatusFilter>("")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const isAvailability = (AVAILABILITY as readonly string[]).includes(filter)
  const partners = usePartners({
    business: business === "all" ? undefined : business,
    ...(isAvailability
      ? { status: "active", availability: filter as PartnerAvailability }
      : { status: (filter || undefined) as PartnerStatus | undefined }),
    search: search.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  const summary = usePartnerSummary(business === "all" ? undefined : business)
  const n = (k: keyof NonNullable<typeof summary.data>) =>
    summary.data ? summary.data[k].toLocaleString("en-IN") : "—"
  const total = partners.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="summary">
        <div>
          <i className="navy" />
          <span>
            Total <b>{n("total")}</b>
          </span>
        </div>
        <div>
          <i className="green" />
          <span>
            Active <b>{n("active")}</b>
          </span>
        </div>
        <div>
          <i className="gold" />
          <span>
            Pending <b>{n("pending")}</b>
          </span>
        </div>
        <div>
          <i className="red" />
          <span>
            Suspended <b>{n("suspended")}</b>
          </span>
        </div>
        {me.data?.permissions.includes("partners.manage") && (
          <Button primary icon={Plus} onClick={() => setAdding(true)}>
            Add delivery partner
          </Button>
        )}
      </div>
      <section className="panel table-panel">
        <div className="filters">
          <Input
            icon={Search}
            value={search}
            onChange={(e) => (setSearch(e.target.value), setPage(1))}
            placeholder="Search partner name, ID or mobile…"
            aria-label="Search partners"
          />
          <Select value={filter} onChange={(v) => (setFilter(v as StatusFilter), setPage(1))}>
            <option value="">All partners</option>
            <option value="pending_approval">Pending approval</option>
            {AVAILABILITY.map((a) => (
              <option value={a} key={a}>
                {availabilityLabel[a]}
              </option>
            ))}
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
        {partners.isError ? (
          <div className="modal-body">
            <ErrorBox icon={AlertTriangle}>
              {errorText(partners.error, "Couldn't load delivery partners.")}
            </ErrorBox>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Partner",
                    "Services",
                    "Vehicle",
                    "Verification",
                    "Availability",
                    "Performance",
                    "",
                  ].map((h, i) => (
                    <th key={h + i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {partners.data?.items.map((p) => {
                  const tone = p.businesses.length > 1 ? "all" : p.businesses[0]
                  const verify = verificationOf(p)
                  return (
                    <tr key={p.id}>
                      <td>
                        <button type="button" className="entity" onClick={() => setSelected(p.id)}>
                          <b className={tone}>{initials(p.name)}</b>
                          <span>
                            <strong>{p.name}</strong>
                            <small>
                              {p.code} · {p.zoneName}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <Badge tone={tone}>{servicesLabel(p.businesses)}</Badge>
                      </td>
                      <td>{vehicleLabel[p.vehicleType]}</td>
                      <td>
                        <Badge tone={verify === "Verified" ? "success" : "warning"}>{verify}</Badge>
                      </td>
                      <td>
                        <Badge tone={availabilityTone(p)}>
                          {p.status === "active"
                            ? availabilityLabel[p.availability]
                            : partnerStatusLabel[p.status]}
                        </Badge>
                      </td>
                      <td>
                        <strong>
                          {p.deliveriesCompleted.toLocaleString("en-IN")} ·{" "}
                          {p.rating === null ? "—" : `★${p.rating.toFixed(1)}`}
                        </strong>
                      </td>
                      <td>
                        <IconButton
                          icon={MoreHorizontal}
                          label={`Open ${p.name}`}
                          onClick={() => setSelected(p.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
                {partners.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={7}>No delivery partners match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {partners.data
              ? `Showing ${total ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, total)} of ${total} partners`
              : "Loading partners…"}
          </span>
          <div>
            <IconButton
              icon={ChevronLeft}
              label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            />
            <b>{page}</b>
            <span>of {pages}</span>
            <IconButton
              icon={ChevronRight}
              label="Next page"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            />
          </div>
        </div>
      </section>
      {selected && <PartnerDrawer id={selected} close={() => setSelected(null)} />}
      {adding && (
        <PartnerWizard
          defaultService={business === "all" ? "food" : business}
          close={() => setAdding(false)}
        />
      )}
    </>
  )
}

/** Applications open in the approval layout; everyone else in the profile layout. */
export function PartnerDrawer({ id, close }: { id: string; close: () => void }) {
  const partner = usePartner(id)
  const me = useMe()
  const decide = usePartnerDecision()
  const [decision, setDecision] = useState<Decision | null>(null)
  const p = partner.data
  const canDecide = Boolean(me.data?.permissions.includes("partners.approve"))

  return (
    <Drawer label={p ? p.name : "Delivery partner"} className="approval-drawer" close={close}>
      <header>
        <div>
          <small>
            {p?.status === "pending_approval" ? "DELIVERY PARTNER APPLICATION" : "DELIVERY PARTNER"}
          </small>
          <strong>{p?.code ?? "…"}</strong>
        </div>
        <IconButton icon={X} label="Close details" onClick={close} />
      </header>
      {!p ? (
        <main>
          {partner.isError ? (
            <ErrorBox icon={AlertTriangle}>
              {errorText(partner.error, "Couldn't load partner.")}
            </ErrorBox>
          ) : (
            "Loading…"
          )}
        </main>
      ) : (
        <>
          <div className="approval-hero">
            <span>{initials(p.name)}</span>
            <div>
              <strong>{p.name}</strong>
              <small>
                {servicesLabel(p.businesses)} · {p.zoneName} · Submitted{" "}
                {dateTimeLabel(p.createdAt)}
              </small>
            </div>
            <p style={{ margin: 0 }}>
              <Badge tone={partnerStatusTone(p.status)}>{partnerStatusLabel[p.status]}</Badge>
            </p>
          </div>
          <main>
            <PartnerSections p={p} />
            {p.decidedAt && p.status !== "pending_approval" && (
              <section className="decision-history">
                <Activity size={18} />
                <span>
                  <b>Decision history preserved</b>
                  {partnerStatusLabel[p.status]} by {p.decidedByName ?? "Super Admin"} ·{" "}
                  {dateTimeLabel(p.decidedAt)}
                  {p.decisionReason && ` · Reason: ${p.decisionReason}`}
                </span>
              </section>
            )}
          </main>
          <footer>
            {!canDecide && <span>Only a Super Admin can approve or suspend partners.</span>}
            {canDecide &&
              partnerDecisions[p.status].map((d) => (
                <Button
                  key={d}
                  success={d === "approve"}
                  danger={d === "reject" || d === "suspend"}
                  primary={d === "reactivate"}
                  icon={d === "approve" ? Check : undefined}
                  onClick={() => (decide.reset(), setDecision(d))}
                >
                  {
                    {
                      approve: "Approve",
                      reject: "Reject",
                      suspend: "Suspend account",
                      reactivate: "Reactivate",
                    }[d]
                  }
                </Button>
              ))}
            {canDecide && partnerDecisions[p.status].length === 0 && (
              <Badge tone="danger">Decision complete · {partnerStatusLabel[p.status]}</Badge>
            )}
          </footer>
          {decision && (
            <DecisionDialog
              decision={decision}
              subject={`${p.name} · ${p.code}`}
              reasons={decision === "reject" ? PARTNER_REJECTION_REASONS : SUSPEND_REASONS}
              pending={decide.isPending}
              error={
                decide.isError ? errorText(decide.error, "Couldn't save the decision.") : undefined
              }
              close={() => setDecision(null)}
              confirm={(reason) =>
                decide.mutate(
                  { id: p.id, decision, ...(reason && { reason }) },
                  { onSuccess: () => setDecision(null) },
                )
              }
            />
          )}
        </>
      )}
    </Drawer>
  )
}

function PartnerSections({ p }: { p: PartnerDetail }) {
  const doc = (kind: string) => p.documents.find((d) => d.kind === kind)
  const docStatus = (kind: string) => {
    const d = doc(kind)
    return d
      ? d.verified
        ? "Uploaded · Verified"
        : "Uploaded · Pending verification"
      : "Not uploaded"
  }
  return (
    <>
      {p.status === "active" && (
        <div className="detail-metrics">
          {[
            ["Deliveries", p.deliveriesCompleted.toLocaleString("en-IN")],
            ["Rating", p.rating === null ? "—" : `★ ${p.rating.toFixed(1)}`],
            ["Availability", availabilityLabel[p.availability]],
            ["Current order", p.currentOrderCode ?? "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <small>{k}</small>
              <b>{v}</b>
            </div>
          ))}
        </div>
      )}
      <Section title="Personal Information">
        <Value label="Full Name" value={p.name} />
        <Value label="Date of Birth" value={p.dateOfBirth && dateLabel(p.dateOfBirth)} />
        <Value label="Gender" value={p.gender} />
        <Value label="Mobile Number" value={p.phone} />
        <Value label="Email Address" value={p.email} />
        <Value label="Residential Address" value={p.address} />
        <Value label="District" value={p.district} />
        <Value label="PIN Code" value={p.pinCode} />
      </Section>
      <Section title="Identity & License">
        <div className="document-preview">
          <ShieldCheck size={22} />
          <span>
            <b>Aadhaar Card</b>
            {doc("aadhaar")?.fileName ?? "Not uploaded"}
          </span>
          {/* Wrapped: the prototype styles every direct child span of this row. */}
          <div>
            <Badge tone={doc("aadhaar")?.verified ? "success" : "warning"}>
              {doc("aadhaar")
                ? doc("aadhaar")!.verified
                  ? "Verified"
                  : "Pending verification"
                : "Missing"}
            </Badge>
          </div>
        </div>
        <Value label="Driving License" value={p.drivingLicence} />
        <Value
          label="License Validity"
          value={p.licenceValidUntil && dateLabel(p.licenceValidUntil)}
        />
        <Value
          label="Document Status"
          value={p.kycVerified ? "Verified" : "Uploaded · Not independently verified"}
        />
        <Value label="Driving License File" value={docStatus("driving_licence")} />
      </Section>
      <Section title="Vehicle Information">
        <Value label="Vehicle Type" value={vehicleLabel[p.vehicleType]} />
        <Value label="Registration Number" value={p.vehicleNumber} />
        <Value label="Vehicle Model" value={p.vehicleModel} />
        <Value label="Vehicle Photo" value={doc("photo")?.fileName} />
        <Value label="Insurance / RC" value={docStatus("vehicle_rc")} />
      </Section>
      <Section title="Payout Information">
        <Value label="Account Holder Name" value={p.bank?.holderName} />
        <Value label="Bank Name" value={p.bank?.bankName} />
        <Value label="Account Number" value={p.bank && `•••• •••• ${p.bank.last4}`} />
        <Value label="IFSC Code" value={p.bank?.ifsc} />
        <Value
          label="Payout Verification"
          value={
            p.bank
              ? p.bank.verified
                ? "Verified"
                : "Pending bank verification"
              : "No bank details"
          }
        />
      </Section>
      <Panel
        title="Service eligibility"
        subtitle="Assignments are restricted to approved businesses."
      >
        <div className="eligibility">
          {(["food", "mart"] as const).map((b) => (
            <span key={b}>
              {b === "food" ? <UtensilsCrossed /> : <ShoppingBag />}
              <b>{businessName[b]}</b>
              <Badge tone={p.businesses.includes(b) ? "success" : "neutral"}>
                {p.businesses.includes(b) ? "Eligible" : "Not eligible"}
              </Badge>
            </span>
          ))}
        </div>
      </Panel>
      <Section title="Submission Details">
        <Value label="Submitted By" value={p.submittedByName ?? "Platform onboarding"} />
        <Value label="Managed By" value={p.managerName} />
        <Value label="Application Date" value={dateTimeLabel(p.createdAt)} />
        <Value label="Application Status" value={partnerStatusLabel[p.status]} />
      </Section>
      {p.activity.length > 0 && (
        <Panel title="Activity" subtitle="Recorded actions on this partner">
          <div className="timeline">
            {p.activity.map((a, i) => (
              <span key={i}>
                <i />
                <b>
                  {activityLabel(a.action)}
                  {a.reason && ` · ${a.reason}`}
                </b>
                <small>
                  {dateTimeLabel(a.at)} · {a.actorName}
                </small>
              </span>
            ))}
          </div>
        </Panel>
      )}
    </>
  )
}

function PartnerWizard({
  defaultService,
  close,
}: {
  defaultService: "food" | "mart"
  close: () => void
}) {
  const zones = useZones()
  const w = usePartnerWizard(defaultService)
  const { step, form, set, errors } = w
  const field = (k: keyof typeof form, errKey: string = k) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => set(k)(e.target.value),
    error: errors[errKey],
  })

  if (w.create.isSuccess)
    return (
      <div className="partner-wizard-screen">
        <div className="partner-success">
          <CheckCircle2 size={48} />
          <strong>Partner application submitted</strong>
          <p>
            Application {w.create.data.code} is under review. The partner is not active until
            verification is complete.
          </p>
          <Badge tone="warning">Under Review</Badge>
          <Button primary onClick={close}>
            Return to delivery partners
          </Button>
        </div>
      </div>
    )

  return (
    <div className="partner-wizard-screen" role="dialog" aria-label="New delivery partner">
      <header className="partner-wizard-header">
        <Logo />
        <Badge tone="gold">● Draft</Badge>
        <IconButton icon={X} label="Close onboarding" onClick={close} />
      </header>
      <div className="partner-wizard-layout">
        <aside className="partner-step-rail">
          <small>PARTNER ONBOARDING</small>
          <strong>New delivery partner</strong>
          <p>Complete all required details. Verification is handled separately.</p>
          <div>
            {PARTNER_STEPS.map(([title, copy], i) => (
              <button
                type="button"
                className={i === step ? "active" : i < step ? "done" : ""}
                onClick={() => w.goTo(i)}
                key={title}
              >
                <b>{i < step ? <Check size={14} /> : i + 1}</b>
                <span>
                  <strong>{title}</strong>
                  <small>{copy}</small>
                </span>
              </button>
            ))}
          </div>
          <section>
            <ShieldCheck size={19} />
            <span>
              <b>Sensitive data protected</b>
              Only the last four digits of the bank account are stored.
            </span>
          </section>
        </aside>
        <main className="partner-wizard-main">
          <small>STEP {step + 1} OF 5</small>
          <div className="partner-wizard-title">{PARTNER_STEPS[step]![0]}</div>
          <p>
            {
              [
                "Enter the partner's personal, contact, address and service eligibility details.",
                "Record the driving licence. Identity documents are verified separately.",
                "Add the primary vehicle the partner will deliver with.",
                "Configure payout details. Account numbers are masked after saving.",
                "Confirm each section before submitting the application for review.",
              ][step]
            }
          </p>
          {w.create.isError && (
            <ErrorBox icon={AlertTriangle}>
              {errorText(w.create.error, "Couldn't submit the application.")}
            </ErrorBox>
          )}
          <section className="partner-form-card">
            <strong>{step === 4 ? "Application summary" : "Basic details"}</strong>
            {step === 0 && (
              <div className="form-grid">
                <Input label="Full name *" {...field("name")} />
                <Input
                  label="Mobile number *"
                  inputMode="tel"
                  placeholder="98765 43210"
                  {...field("phone")}
                />
                <Input label="Email address" type="email" {...field("email")} />
                <Input label="Date of birth" type="date" {...field("dateOfBirth")} />
                <Select label="Gender" value={form.gender} onChange={set("gender")}>
                  <option value="">Select gender</option>
                  {GENDERS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </Select>
                <Input label="PIN code" inputMode="numeric" {...field("pinCode")} />
                <Input label="Residential address" {...field("address")} />
                <Select label="Service area *" value={form.zoneId} onChange={set("zoneId")}>
                  <option value="">Choose a service area</option>
                  {zones.data?.map((z) => (
                    <option value={z.id} key={z.id}>
                      {z.location}, {z.city}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Service eligibility *"
                  value={form.service}
                  onChange={set("service")}
                >
                  <option value="food">ZOAURO FOOD</option>
                  <option value="mart">GLOARO MART</option>
                  <option value="both">Both businesses</option>
                </Select>
                {errors.zoneId && <em className="rejection-error">{errors.zoneId}</em>}
              </div>
            )}
            {step === 1 && (
              <div className="form-grid">
                <Input label="Driving licence number *" {...field("drivingLicence")} />
                <Input label="Licence valid until" type="date" {...field("licenceValidUntil")} />
              </div>
            )}
            {step === 2 && (
              <div className="form-grid">
                <Select
                  label="Vehicle type *"
                  value={form.vehicleType}
                  onChange={set("vehicleType")}
                >
                  {VEHICLE_TYPES.map((v) => (
                    <option value={v} key={v}>
                      {vehicleLabel[v]}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Registration number *"
                  placeholder="TN 01 AB 4821"
                  {...field("vehicleNumber")}
                />
                <Input
                  label="Vehicle model"
                  placeholder="Honda SP 125"
                  {...field("vehicleModel")}
                />
              </div>
            )}
            {step === 3 && (
              <div className="form-grid">
                <Input label="Account holder name" {...field("holderName", "bank.holderName")} />
                <Input label="Bank name" {...field("bankName", "bank.bankName")} />
                <Input
                  label="Account number"
                  type="password"
                  inputMode="numeric"
                  {...field("accountNumber", "bank.accountNumber")}
                />
                <Input
                  label="Confirm account number"
                  type="password"
                  inputMode="numeric"
                  {...field("confirmAccount")}
                />
                <Input
                  label="IFSC code"
                  placeholder="HDFC0001284"
                  {...field("ifsc", "bank.ifsc")}
                />
              </div>
            )}
            {step === 4 && (
              <WizardReview w={w} zoneName={zones.data?.find((z) => z.id === form.zoneId)} />
            )}
          </section>
        </main>
      </div>
      <footer className="partner-wizard-footer">
        <Button onClick={step === 0 ? close : w.back}>{step === 0 ? "Cancel" : "Back"}</Button>
        <span />
        {step < 4 ? (
          <Button primary onClick={w.next}>
            Continue <ArrowRight size={15} />
          </Button>
        ) : (
          <Button primary disabled={w.create.isPending} onClick={w.submit}>
            Submit for verification
          </Button>
        )}
      </footer>
    </div>
  )
}

function WizardReview({
  w,
  zoneName,
}: {
  w: ReturnType<typeof usePartnerWizard>
  zoneName: { location: string; city: string } | undefined
}) {
  const f = w.form
  const rows: [string, string, number][] = [
    ["Personal information", `${f.name || "Not provided"} · ${f.phone || "No mobile"}`, 0],
    [
      "Service eligibility",
      `${f.service === "both" ? "Food + Mart" : businessName[f.service]} · ${zoneName ? `${zoneName.location}, ${zoneName.city}` : "No area"}`,
      0,
    ],
    ["Identity & license", f.drivingLicence || "Not provided", 1],
    ["Vehicle", `${vehicleLabel[f.vehicleType]} · ${f.vehicleNumber || "No registration"}`, 2],
    [
      "Bank account",
      f.accountNumber ? `${f.bankName} · •••• ${f.accountNumber.slice(-4)}` : "Not provided",
      3,
    ],
  ]
  return (
    <div className="review">
      {rows.map(([a, b, c]) => (
        <div key={a}>
          <span>
            <small>{a}</small>
            <b>{b}</b>
          </span>
          <Button onClick={() => w.goTo(c)}>Edit</Button>
        </div>
      ))}
    </div>
  )
}
