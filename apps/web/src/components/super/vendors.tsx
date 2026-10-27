"use client"
// Vendor management for the Super Admin portal (prototype "Management" screen, vendors tab).
import { ApiError } from "@zoauro/api-client"
import {
  businessName,
  CreateVendorRequest,
  formatINR,
  formatINRCompact,
  vendorDecisions,
  vendorStatusLabel,
  verificationLabel,
  VENDOR_STATUSES,
  type Business,
  type VendorStatus,
} from "@zoauro/shared"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react"
import { useState } from "react"
import { useMe, useZones } from "@/lib/session"
import {
  activityLabel,
  dateTimeLabel,
  documentLabel,
  fieldErrors,
  useCreateVendor,
  useVendor,
  useVendorDecision,
  useVendors,
  useVendorSummary,
  vendorStatusTone,
  verificationTone,
  withoutBlanks,
} from "@/lib/vendors"
import { DecisionDialog, type Decision } from "./decision"
import { useBusinessFilter } from "./shell"
import {
  Badge,
  Button,
  Drawer,
  ErrorBox,
  IconButton,
  Input,
  Modal,
  Panel,
  Section,
  Select,
  Tabs,
  Value,
} from "./ui"

const PAGE_SIZE = 10
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

export function SuperVendors() {
  const business = useBusinessFilter()
  const me = useMe()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<VendorStatus | "">("")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const vendors = useVendors({
    business: business === "all" ? undefined : business,
    status: status || undefined,
    search: search.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  const summary = useVendorSummary()
  const counts = (summary.data ?? []).filter((s) => business === "all" || s.business === business)
  const sum = (k: "total" | "active" | "pending" | "suspended") =>
    summary.data ? counts.reduce((t, s) => t + s[k], 0).toLocaleString("en-IN") : "—"
  const total = vendors.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="summary">
        <div>
          <i className="navy" />
          <span>
            Total <b>{sum("total")}</b>
          </span>
        </div>
        <div>
          <i className="green" />
          <span>
            Active <b>{sum("active")}</b>
          </span>
        </div>
        <div>
          <i className="gold" />
          <span>
            Pending <b>{sum("pending")}</b>
          </span>
        </div>
        <div>
          <i className="red" />
          <span>
            Suspended <b>{sum("suspended")}</b>
          </span>
        </div>
        {me.data?.permissions.includes("vendors.manage") && (
          <Button primary icon={Plus} onClick={() => setAdding(true)}>
            Add vendor
          </Button>
        )}
      </div>
      <section className="panel table-panel">
        <div className="filters">
          <Input
            icon={Search}
            value={search}
            onChange={(e) => (setSearch(e.target.value), setPage(1))}
            placeholder="Search vendor, owner or ID…"
            aria-label="Search vendors"
          />
          <Select value={status} onChange={(v) => (setStatus(v as VendorStatus | ""), setPage(1))}>
            <option value="">All statuses</option>
            {VENDOR_STATUSES.map((s) => (
              <option value={s} key={s}>
                {vendorStatusLabel[s]}
              </option>
            ))}
          </Select>
        </div>
        {vendors.isError ? (
          <div className="modal-body">
            <ErrorBox icon={AlertTriangle}>
              {errorText(vendors.error, "Couldn't load vendors.")}
            </ErrorBox>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Vendor",
                    "Business",
                    "Owner",
                    "Location",
                    "Verification",
                    "Status",
                    "Sales",
                    "",
                  ].map((h, i) => (
                    <th key={h + i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendors.data?.items.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <button type="button" className="entity" onClick={() => setSelected(v.id)}>
                        <b className={v.business}>{v.name.slice(0, 2).toUpperCase()}</b>
                        <span>
                          <strong>{v.name}</strong>
                          <small>{v.code}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <Badge tone={v.business}>{businessName[v.business]}</Badge>
                    </td>
                    <td>{v.ownerName}</td>
                    <td>{v.zoneName}</td>
                    <td>
                      <Badge tone={verificationTone(v.verification)}>
                        {verificationLabel[v.verification]}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={vendorStatusTone(v.status)}>{vendorStatusLabel[v.status]}</Badge>
                    </td>
                    <td>
                      <strong>{v.salesPaise ? formatINRCompact(v.salesPaise) : "—"}</strong>
                    </td>
                    <td>
                      <IconButton
                        icon={MoreHorizontal}
                        label={`Open ${v.name}`}
                        onClick={() => setSelected(v.id)}
                      />
                    </td>
                  </tr>
                ))}
                {vendors.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8}>No vendors match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {vendors.data
              ? `Showing ${total ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, total)} of ${total} vendors`
              : "Loading vendors…"}
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
      {selected && <VendorDrawer id={selected} close={() => setSelected(null)} />}
      {adding && (
        <AddVendor
          defaultBusiness={business === "all" ? "food" : business}
          close={() => setAdding(false)}
          opened={(id) => (setAdding(false), setSelected(id))}
        />
      )}
    </>
  )
}

const TABS = ["Overview", "Business", "Documents", "Activity"] as const
const VENDOR_REASONS = [
  "Documents incomplete or invalid",
  "Licence or GST details mismatch",
  "Food safety concerns",
  "Repeated late dispatches",
  "Customer complaints",
  "Outside serviceable area",
]

export function VendorDrawer({ id, close }: { id: string; close: () => void }) {
  const vendor = useVendor(id)
  const me = useMe()
  const decide = useVendorDecision()
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview")
  const [decision, setDecision] = useState<Decision | null>(null)
  const v = vendor.data
  const canDecide = me.data?.permissions.includes("vendors.approve")

  return (
    <Drawer label={v ? v.name : "Vendor"} close={close}>
      <header>
        <IconButton icon={X} label="Close" onClick={close} />
        {v && <Badge tone={vendorStatusTone(v.status)}>{vendorStatusLabel[v.status]}</Badge>}
      </header>
      {!v ? (
        <main>
          {vendor.isError ? (
            <ErrorBox icon={AlertTriangle}>
              {errorText(vendor.error, "Couldn't load vendor.")}
            </ErrorBox>
          ) : (
            "Loading…"
          )}
        </main>
      ) : (
        <>
          <div className="entity-hero">
            <b className={v.business}>{v.name.slice(0, 2).toUpperCase()}</b>
            <span>
              <strong>{v.name}</strong>
              <small>
                {v.code} · {v.ownerName} · {businessName[v.business]}
              </small>
              <Badge tone={verificationTone(v.verification)}>
                {verificationLabel[v.verification]}
              </Badge>
            </span>
          </div>
          <Tabs items={TABS} value={tab} onChange={setTab} />
          <main>
            <div className="detail-metrics">
              {[
                ["Total orders", v.ordersCount.toLocaleString("en-IN")],
                ["Sales", formatINR(v.salesPaise)],
                ["Commission", `${v.commissionPct}%`],
                ["Open orders", v.openOrders.toLocaleString("en-IN")],
              ].map(([k, val]) => (
                <div key={k}>
                  <small>{k}</small>
                  <b>{val}</b>
                </div>
              ))}
            </div>
            {tab === "Overview" && (
              <Section title="Contact">
                <Value label="Owner" value={v.ownerName} />
                <Value label="Mobile number" value={v.phone} />
                <Value label="Email address" value={v.email} />
                <Value label="Service area" value={v.zoneName} />
                <Value label="Address" value={v.address} />
                <Value label="Added" value={dateTimeLabel(v.createdAt)} />
              </Section>
            )}
            {tab === "Business" && (
              <Section title="Registration">
                <Value label="Business" value={businessName[v.business]} />
                <Value label="Platform commission" value={`${v.commissionPct}%`} />
                <Value label="GSTIN" value={v.gstin} />
                <Value
                  label="FSSAI licence"
                  value={v.business === "food" ? v.fssai : "Not required"}
                />
              </Section>
            )}
            {tab === "Documents" && (
              <Panel title="Documents" subtitle="Uploaded files and their verification">
                <div className="eligibility">
                  {v.documents.length === 0 && <span>No documents uploaded yet.</span>}
                  {v.documents.map((d) => (
                    <span key={d.kind + d.fileName}>
                      <FileText size={18} />
                      <b>{documentLabel[d.kind] ?? d.kind}</b>
                      <small>{d.fileName}</small>
                      <Badge tone={d.verified ? "success" : "warning"}>
                        {d.verified ? "Verified" : "Pending verification"}
                      </Badge>
                    </span>
                  ))}
                </div>
              </Panel>
            )}
            {(tab === "Activity" || tab === "Overview") && (
              <Panel title="Activity" subtitle="Recorded actions on this vendor">
                <div className="timeline">
                  {v.activity.length === 0 && (
                    <span>
                      <i />
                      <b>No recorded actions yet</b>
                    </span>
                  )}
                  {v.activity.map((a, i) => (
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
          </main>
          <footer>
            {!canDecide && <span>Only a Super Admin can approve or suspend vendors.</span>}
            {canDecide &&
              vendorDecisions[v.status].map((d) => (
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
            {canDecide && vendorDecisions[v.status].length === 0 && (
              <Badge tone="danger">Decision complete · {vendorStatusLabel[v.status]}</Badge>
            )}
          </footer>
          {decision && (
            <DecisionDialog
              decision={decision}
              subject={`${v.name} · ${v.code}`}
              reasons={VENDOR_REASONS}
              pending={decide.isPending}
              error={
                decide.isError ? errorText(decide.error, "Couldn't save the decision.") : undefined
              }
              close={() => setDecision(null)}
              confirm={(reason) =>
                decide.mutate(
                  { id: v.id, decision, ...(reason && { reason }) },
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

const STEPS = ["Business", "Owner", "Location", "Compliance", "Configuration", "Review"] as const
const stepFields: string[][] = [
  ["business", "name"],
  ["ownerName", "phone", "email"],
  ["zoneId", "address"],
  ["gstin", "fssai"],
  ["commissionPct"],
]

function AddVendor({
  defaultBusiness,
  close,
  opened,
}: {
  defaultBusiness: Business
  close: () => void
  opened: (id: string) => void
}) {
  const zones = useZones()
  const create = useCreateVendor()
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    business: defaultBusiness,
    name: "",
    ownerName: "",
    phone: "",
    email: "",
    zoneId: "",
    address: "",
    gstin: "",
    fssai: "",
    commission: defaultBusiness === "food" ? "18" : "12",
  })
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => set(k)(e.target.value),
    error: errors[k === "commission" ? "commissionPct" : k],
  })

  function check(upTo: number) {
    const { commission, ...rest } = form
    const parsed = CreateVendorRequest.safeParse({
      ...withoutBlanks(rest, ["gstin", "fssai"]),
      commissionPct: Number(commission),
    })
    const all = parsed.success ? {} : fieldErrors(parsed.error.issues)
    if (form.business === "food" && !form.fssai.trim())
      all.fssai ??= "Restaurants need an FSSAI licence"
    const wanted = new Set(stepFields.slice(0, upTo + 1).flat())
    const shown = Object.fromEntries(Object.entries(all).filter(([k]) => wanted.has(k)))
    setErrors(shown)
    return { shown, parsed }
  }
  const next = () => {
    if (Object.keys(check(step).shown).length === 0) setStep(step + 1)
  }
  const submit = () => {
    const { shown, parsed } = check(stepFields.length - 1)
    const first = stepFields.findIndex((f) => f.some((k) => k in shown))
    if (first >= 0) return setStep(first)
    if (parsed.success) create.mutate(parsed.data)
  }
  const zone = zones.data?.find((z) => z.id === form.zoneId)

  if (create.isSuccess)
    return (
      <Modal title="Application submitted" subtitle="Queued for verification." close={close} wide>
        <div className="success-state">
          <CheckCircle2 />
          <strong>Vendor application received</strong>
          <p>
            The vendor stays pending until a Super Admin approves it. Nothing was activated
            automatically.
          </p>
          <div>
            <span>
              VENDOR ID<b>{create.data.code}</b>
            </span>
            <span>
              STATUS<Badge tone="warning">Under Review</Badge>
            </span>
          </div>
        </div>
        <footer>
          <Button onClick={close}>Return to vendors</Button>
          <Button primary onClick={() => opened(create.data.id)}>
            Open vendor
          </Button>
        </footer>
      </Modal>
    )

  return (
    <Modal
      title="Add new vendor"
      subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
      close={close}
      wide
    >
      <div className="steps">
        {STEPS.map((x, i) => (
          <button
            type="button"
            className={i === step ? "active" : i < step ? "done" : ""}
            onClick={() => i < step && setStep(i)}
            key={x}
          >
            <b>{i < step ? <Check /> : i + 1}</b>
            <span>{x}</span>
          </button>
        ))}
      </div>
      <div className="wizard-body">
        <div className="section-title">
          {step === STEPS.length - 1 ? "Review application" : `${STEPS[step]} information`}
        </div>
        <p>
          Enter accurate information. Documents are verified separately before the vendor goes live.
        </p>
        {create.isError && (
          <ErrorBox icon={AlertTriangle}>
            {errorText(create.error, "Couldn't add the vendor.")}
          </ErrorBox>
        )}
        {step === 0 && (
          <div className="form-grid">
            <Input label="Shop / restaurant name *" {...field("name")} />
            <Select label="Business type *" value={form.business} onChange={set("business")}>
              <option value="food">ZOAURO FOOD — Restaurant</option>
              <option value="mart">GLOARO MART — Seller</option>
            </Select>
          </div>
        )}
        {step === 1 && (
          <div className="form-grid">
            <Input label="Owner full name *" {...field("ownerName")} />
            <Input
              label="Mobile number *"
              placeholder="98400 12345"
              inputMode="tel"
              {...field("phone")}
            />
            <Input label="Email address *" type="email" {...field("email")} />
          </div>
        )}
        {step === 2 && (
          <div className="form-grid">
            <Select label="Service area *" value={form.zoneId} onChange={set("zoneId")}>
              <option value="">Choose a service area</option>
              {zones.data?.map((z) => (
                <option value={z.id} key={z.id}>
                  {z.location}, {z.city}
                </option>
              ))}
            </Select>
            <Input
              label="Address *"
              placeholder="Door no., street, locality"
              {...field("address")}
            />
            {errors.zoneId && <em className="rejection-error">{errors.zoneId}</em>}
          </div>
        )}
        {step === 3 && (
          <div className="form-grid">
            <Input label="GSTIN" placeholder="33ABCDE1234F1Z5" {...field("gstin")} />
            <Input
              label={form.business === "food" ? "FSSAI licence number *" : "FSSAI licence number"}
              placeholder="14 digits"
              inputMode="numeric"
              {...field("fssai")}
            />
          </div>
        )}
        {step === 4 && (
          <div className="form-grid">
            <Input
              label="Platform commission (%) *"
              type="number"
              min={0}
              max={50}
              step={0.25}
              {...field("commission")}
            />
          </div>
        )}
        {step === 5 && (
          <div className="review">
            {(
              [
                ["Business", `${form.name} · ${businessName[form.business]}`, 0],
                ["Owner", `${form.ownerName} · ${form.phone}`, 1],
                ["Location", zone ? `${zone.location}, ${zone.city}` : "Not chosen", 2],
                [
                  "Compliance",
                  [form.gstin && `GSTIN ${form.gstin}`, form.fssai && `FSSAI ${form.fssai}`]
                    .filter(Boolean)
                    .join(" · ") || "Not provided",
                  3,
                ],
                ["Configuration", `${form.commission}% commission`, 4],
              ] as const
            ).map(([a, b, c]) => (
              <div key={a}>
                <span>
                  <small>{a}</small>
                  <b>{b}</b>
                </span>
                <Button onClick={() => setStep(c)}>Edit</Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <footer>
        <Button onClick={step ? () => setStep(step - 1) : close}>{step ? "Back" : "Cancel"}</Button>
        <i />
        {step < STEPS.length - 1 ? (
          <Button primary onClick={next}>
            Continue <ArrowRight size={15} />
          </Button>
        ) : (
          <Button primary icon={ShieldCheck} disabled={create.isPending} onClick={submit}>
            Submit for verification
          </Button>
        )}
      </footer>
    </Modal>
  )
}
