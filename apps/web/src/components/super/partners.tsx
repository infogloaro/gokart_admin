"use client"
// Delivery partners for the Super Admin portal: the prototype's partner table with live
// counts, filter chips, export and auto-refresh; the tabbed profile drawer opened from
// each row's ••• button (with approve / reject for applications); and the onboarding wizard.
import { ApiError } from "@zoauro/api-client"
import {
  availabilityLabel,
  businessName,
  formatINR,
  GENDERS,
  orderStatusLabel,
  PARTNER_REJECTION_REASONS,
  partnerDecisions,
  partnerStatusLabel,
  UpdatePartnerRequest,
  VEHICLE_TYPES,
  vehicleLabel,
  type Business,
  type Partner,
  type PartnerAvailability,
  type PartnerDetail,
} from "@zoauro/shared"
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  ListOrdered,
  LocateFixed,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { useSince } from "@/lib/motion"
import { placedLabel, statusTone, useOrders } from "@/lib/orders"
import {
  availabilityTone,
  initials,
  partnersCsv,
  partnerStatusTone,
  servicesLabel,
  usePartner,
  usePartnerDecision,
  usePartners,
  usePartnerSummary,
  useUpdatePartner,
  verificationOf,
  type PartnerQuery,
} from "@/lib/partners"

import { useMe } from "@/lib/session"
import { activityLabel, dateLabel, dateTimeLabel, fieldErrors } from "@/lib/vendors"
import { AvailabilityButton } from "./availability"
import { Count, HeadActions } from "./dashboard"
import { DecisionDialog, type Decision } from "./decision"
import { DocumentsPanel } from "./documents"
import { useCsvExport } from "./export"
import { useRefreshToast } from "@/components/refresh-toast"
import { useBusinessFilter } from "./shell"
import { SuperDeliveryManagement } from "./delivery-management"
import {
  Badge,
  Button,
  Drawer,
  ErrorBox,
  IconButton,
  Input,
  Panel,
  Section,
  Select,
  Tabs,
  Toast,
  Value,
} from "./ui"
import { AreaSelect } from "./area-select"

const PAGE_SIZE = 10
const REFRESH_MS = 30_000
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)
const SUSPEND_REASONS = [
  "Repeated late deliveries",
  "Customer safety complaint",
  "Documents expired",
  "Inactive for 30 days",
]

type Chip = "all" | PartnerAvailability | "pending_approval" | "suspended"
const CHIPS: { key: Chip; label: string; count: keyof Summary }[] = [
  { key: "all", label: "All", count: "total" },
  { key: "available", label: "Online", count: "available" },
  { key: "on_delivery", label: "On delivery", count: "onDelivery" },
  { key: "offline", label: "Offline", count: "offline" },
  { key: "pending_approval", label: "Pending approval", count: "pending" },
  { key: "suspended", label: "Suspended", count: "suspended" },
]
type Summary = NonNullable<ReturnType<typeof usePartnerSummary>["data"]>

function chipQuery(chip: Chip): Pick<PartnerQuery, "status" | "availability"> {
  if (chip === "all") return {}
  if (chip === "pending_approval" || chip === "suspended") return { status: chip }
  return { status: "active", availability: chip }
}

export function SuperPartners() {
  // Global search links here with ?search=CODE; a new link starts the list over.
  const linked = useSearchParams().get("search") ?? ""
  const [section, setSection] = useState<"Individual riders" | "Fleet delivery">("Fleet delivery")
  return (
    <>
      <Tabs
        items={["Fleet delivery", "Individual riders"] as const}
        value={section}
        onChange={setSection}
      />
      {section === "Individual riders" ? (
        <PartnersScreen key={linked} initialSearch={linked} />
      ) : (
        <SuperDeliveryManagement />
      )}
    </>
  )
}

function PartnersScreen({ initialSearch }: { initialSearch: string }) {
  const business = useBusinessFilter()
  const [search, setSearch] = useState(initialSearch)
  const [chip, setChip] = useState<Chip>("all")
  const [sort, setSort] = useState<"newest" | "performance">("newest")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const csv = useCsvExport()
  const runRefresh = useRefreshToast()
  const filters = {
    business: business === "all" ? undefined : business,
    ...chipQuery(chip),
    search: search.trim() || undefined,
    sort,
  }
  const partners = usePartners({ ...filters, page, pageSize: PAGE_SIZE }, REFRESH_MS)
  const summary = usePartnerSummary(filters.business, REFRESH_MS)
  const since = useSince(partners.dataUpdatedAt)
  const total = partners.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const refreshing = partners.isFetching || summary.isFetching

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(t)
  }, [flash])

  /** Exports what the table currently shows, across all pages. */
  const exportCsv = () => csv.run("delivery-partners", () => partnersCsv(filters))

  return (
    <>
      <HeadActions>
        <span className="updated-note" aria-live="polite">
          Updated {since}
        </span>
        <Button icon={Download} disabled={csv.exporting} onClick={exportCsv}>
          {csv.exporting ? "Exporting…" : "Export"}
        </Button>
        <Button
          primary
          icon={RefreshCw}
          className={refreshing ? "spinning" : ""}
          onClick={() =>
            void runRefresh(async () => {
              const results = await Promise.all([partners.refetch(), summary.refetch()])
              if (results.some((result) => result.isError)) throw new Error("Refresh failed")
            })
          }
        >
          Refresh data
        </Button>
      </HeadActions>
      <div className="summary">
        <div>
          <i className="navy" />
          <span>
            Total <Count value={summary.data?.total} />
          </span>
        </div>
        <div>
          <i className="green" />
          <span>
            Active <Count value={summary.data?.active} />
          </span>
        </div>
        <div>
          <i className="gold" />
          <span>
            Pending <Count value={summary.data?.pending} />
          </span>
        </div>
        <div>
          <i className="red" />
          <span>
            Suspended <Count value={summary.data?.suspended} />
          </span>
        </div>
        {/* New partners are created under Fleet delivery (a partner with its delivery boys). */}
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
          <div className="chips" role="group" aria-label="Filter partners">
            {CHIPS.map((c) => (
              <button
                type="button"
                key={c.key}
                className={chip === c.key ? "chip active" : "chip"}
                aria-pressed={chip === c.key}
                onClick={() => (setChip(c.key), setPage(1))}
              >
                {c.key === "available" && <i className="live-dot" />}
                {c.label}
                <b>{summary.data ? summary.data[c.count] : "—"}</b>
              </button>
            ))}
          </div>
        </div>
        {partners.isError ? (
          <div className="modal-body">
            <ErrorBox icon={AlertTriangle}>
              {errorText(partners.error, "Couldn't load delivery partners.")}
            </ErrorBox>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="partner-table">
              <colgroup>
                <col style={{ width: "24%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "6%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Services</th>
                  <th>Vehicle</th>
                  <th>Verification</th>
                  <th>Availability</th>
                  <th aria-sort={sort === "performance" ? "descending" : "none"}>
                    <button
                      type="button"
                      className={sort === "performance" ? "sort active" : "sort"}
                      onClick={() => (
                        setSort(sort === "performance" ? "newest" : "performance"),
                        setPage(1)
                      )}
                      title="Sort by deliveries, then rating"
                    >
                      Performance <ArrowDownWideNarrow size={13} />
                    </button>
                  </th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody key={`${chip}-${sort}-${page}-${business}`}>
                {!partners.data &&
                  Array.from({ length: 5 }, (_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 7 }, (_, j) => (
                        <td key={j}>
                          <i />
                        </td>
                      ))}
                    </tr>
                  ))}
                {partners.data?.items.map((p, i) => (
                  <PartnerRow
                    key={p.id}
                    p={p}
                    index={i}
                    flash={flash === p.id}
                    open={() => setSelected(p.id)}
                  />
                ))}
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
      {selected && (
        <PartnerDrawer id={selected} close={() => setSelected(null)} onChanged={setFlash} />
      )}
      {csv.toast && <Toast toast={csv.toast} close={csv.dismiss} />}
    </>
  )
}

function PartnerRow({
  p,
  index,
  flash,
  open,
}: {
  p: Partner
  index: number
  flash: boolean
  open: () => void
}) {
  const tone = p.businesses.length > 1 ? "all" : p.businesses[0]
  const verify = verificationOf(p)
  const online = p.status === "active" && p.availability === "available"
  return (
    <tr
      className={`row-in${flash ? " row-flash" : ""}`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <td>
        <button type="button" className="entity" onClick={open}>
          <b className={tone}>{initials(p.name)}</b>
          <span>
            <strong>{p.name}</strong>
            <small>{p.code}</small>
          </span>
        </button>
      </td>
      <td>
        <Badge tone={tone}>{servicesLabel(p.businesses)}</Badge>
      </td>
      <td>
        <span className="stack">
          <span>{vehicleLabel[p.vehicleType]}</span>
          <small>{p.vehicleNumber}</small>
        </span>
      </td>
      <td>
        <Badge tone={verify === "Verified" ? "success" : "warning"}>{verify}</Badge>
      </td>
      <td>
        <Badge tone={availabilityTone(p)}>
          {online && <i className="live-dot" />}
          {p.status === "active" ? availabilityLabel[p.availability] : partnerStatusLabel[p.status]}
        </Badge>
      </td>
      <td>
        <span className="performance">
          <strong>
            {p.deliveriesCompleted.toLocaleString("en-IN")}
            <small> deliveries</small>
          </strong>
          <span className="rating">
            {p.rating === null ? "No rating" : `★ ${p.rating.toFixed(1)}`}
          </span>
          <i className="rating-bar">
            <b style={{ width: `${((p.rating ?? 0) / 5) * 100}%` }} />
          </i>
        </span>
      </td>
      <td>
        <IconButton icon={MoreHorizontal} label={`Open ${p.name}`} onClick={open} />
      </td>
    </tr>
  )
}

const TABS = [
  "Overview",
  "Personal",
  "Identity",
  "Vehicle",
  "Eligibility",
  "Assignments",
  "Earnings",
] as const
type Tab = (typeof TABS)[number]

type EditForm = {
  name: string
  phone: string
  email: string
  dateOfBirth: string
  gender: string
  address: string
  pinCode: string
  zoneId: string
  vehicleType: string
  vehicleNumber: string
  vehicleModel: string
  drivingLicence: string
  licenceValidUntil: string
  businesses: Business[]
}

const formOf = (p: PartnerDetail): EditForm => ({
  name: p.name,
  phone: p.phone,
  email: p.email ?? "",
  dateOfBirth: p.dateOfBirth ?? "",
  gender: p.gender ?? "",
  address: p.address ?? "",
  pinCode: p.pinCode ?? "",
  zoneId: p.zoneId,
  vehicleType: p.vehicleType,
  vehicleNumber: p.vehicleNumber,
  vehicleModel: p.vehicleModel ?? "",
  drivingLicence: p.drivingLicence,
  licenceValidUntil: p.licenceValidUntil ?? "",
  businesses: p.businesses,
})

/**
 * The prototype's tabbed partner drawer. Super Admins can edit the profile ("Edit details"
 * → "Save changes"), suspend or reactivate, and approve or reject applications.
 */
export function PartnerDrawer({
  id,
  close,
  onChanged,
}: {
  id: string
  close: () => void
  onChanged?: (id: string) => void
}) {
  const partner = usePartner(id)
  const me = useMe()
  const decide = usePartnerDecision()
  const update = useUpdatePartner()
  const [tab, setTab] = useState<Tab>("Overview")
  const [decision, setDecision] = useState<Decision | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm | null>(null)
  const [editReason, setEditReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const p = partner.data
  const canDecide = Boolean(me.data?.permissions.includes("partners.approve"))
  const router = useRouter()

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const startEdit = () => {
    if (!p) return
    setForm(formOf(p))
    setEditReason("")
    setErrors({})
    update.reset()
    setEditing(true)
    if (tab === "Overview" || tab === "Assignments" || tab === "Earnings") setTab("Personal")
  }

  function save() {
    if (!p) return
    if (!editing || !form) return setToast("Select Edit details to change this profile.")
    const before = formOf(p)
    const changed: Record<string, unknown> = {}
    for (const k of Object.keys(form) as (keyof EditForm)[]) {
      const now = form[k]
      const was = before[k]
      if (
        Array.isArray(now)
          ? [...now].sort().join() !== [...(was as Business[])].sort().join()
          : now !== was
      )
        changed[k] = now
    }
    if (Object.keys(changed).length === 0) {
      setEditing(false)
      return setToast("No changes to save.")
    }
    const parsed = UpdatePartnerRequest.safeParse({
      ...changed,
      updatedAt: p.updatedAt,
      reason: editReason.trim(),
    })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error.issues))
    update.mutate(
      { id: p.id, body: parsed.data },
      {
        onSuccess: () => {
          setEditing(false)
          setToast("Changes saved")
          onChanged?.(p.id)
        },
      },
    )
  }

  const footerLabel: Record<"approve" | "reject" | "suspend" | "reactivate", string> = {
    approve: "Approve",
    reject: "Reject",
    suspend: "Suspend account",
    reactivate: "Reactivate",
  }

  return (
    <Drawer label={p ? p.name : "Delivery partner"} close={close}>
      <header>
        <IconButton icon={X} label="Close" onClick={close} />
        {p && (
          <div className="drawer-tools">
            {canDecide && p.status !== "rejected" && (
              <Button
                icon={FileText}
                onClick={
                  editing ? () => (setEditing(false), setErrors({}), setEditReason("")) : startEdit
                }
              >
                {editing ? "Cancel editing" : "Edit details"}
              </Button>
            )}
            <IconButton icon={MoreHorizontal} label="More actions" onClick={() => setMenu(!menu)} />
            {menu && (
              <div className="drawer-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => (
                    void navigator.clipboard?.writeText(p.code),
                    setMenu(false),
                    setToast(`Copied ${p.code}`)
                  )}
                >
                  <Copy size={15} /> Copy partner ID
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => (setTab("Assignments"), setMenu(false))}
                >
                  <ListOrdered size={15} /> View assignments
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => (setTab("Earnings"), setMenu(false))}
                >
                  <ShieldCheck size={15} /> Pay plan and payouts
                </button>
              </div>
            )}
          </div>
        )}
      </header>
      {!p ? (
        <main>
          {partner.isError ? (
            <ErrorBox icon={AlertTriangle}>
              {errorText(partner.error, "Couldn't load partner.")}
            </ErrorBox>
          ) : (
            <div className="drawer-skeleton">
              <i />
              <i />
              <i />
            </div>
          )}
        </main>
      ) : (
        <>
          <div className="entity-hero">
            <b className={p.businesses.length > 1 ? "all" : p.businesses[0]}>{initials(p.name)}</b>
            <span>
              <strong>{p.name}</strong>
              <small>
                {p.code} · {servicesLabel(p.businesses)} · {p.zoneName}
              </small>
              <em className="hero-badges">
                <Badge tone={verificationOf(p) === "Verified" ? "success" : "warning"}>
                  {verificationOf(p)}
                </Badge>
                <Badge tone={partnerStatusTone(p.status)}>{partnerStatusLabel[p.status]}</Badge>
                {editing && <Badge tone="gold">Editing</Badge>}
              </em>
            </span>
          </div>
          <Tabs items={TABS} value={tab} onChange={setTab} />
          {editing && (
            <Input
              label="Reason for editing *"
              value={editReason}
              maxLength={500}
              error={errors.reason}
              onChange={(event) => setEditReason(event.target.value)}
            />
          )}
          <main key={tab} className="tab-fade">
            {(update.isError || Object.keys(errors).length > 0) && (
              <ErrorBox icon={AlertTriangle}>
                {update.isError
                  ? errorText(update.error, "Couldn't save the changes.")
                  : "Some fields need attention."}
              </ErrorBox>
            )}
            <DrawerTab
              tab={tab}
              p={p}
              editing={editing}
              form={form}
              setForm={setForm}
              errors={errors}
              perms={{
                manage: Boolean(me.data?.permissions.includes("partners.manage")),
                approve: canDecide,
              }}
              notify={setToast}
            />
          </main>
          <footer>
            {p.status === "active" && (
              <Button
                icon={LocateFixed}
                onClick={() => router.push(`/super/tracking?partner=${encodeURIComponent(p.id)}`)}
              >
                View live tracking
              </Button>
            )}
            {p.status === "active" && me.data?.permissions.includes("partners.manage") && (
              <AvailabilityButton
                partner={p}
                onDone={(m) => (setToast(m), onChanged?.(p.id), void partner.refetch())}
              />
            )}
            {!canDecide && <span>Only a Super Admin can change partners.</span>}
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
                  {footerLabel[d]}
                </Button>
              ))}
            {canDecide && p.status === "rejected" && (
              <Badge tone="danger">Decision complete · {partnerStatusLabel[p.status]}</Badge>
            )}
            {canDecide && p.status !== "rejected" && (
              <Button primary disabled={update.isPending} onClick={save}>
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            )}
          </footer>
          {toast && (
            <div className="drawer-toast" role="status">
              <CheckCircle2 size={16} /> {toast}
            </div>
          )}
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
                  {
                    onSuccess: () => {
                      setDecision(null)
                      setToast(decisionToast[decision])
                      onChanged?.(p.id)
                    },
                  },
                )
              }
            />
          )}
        </>
      )}
    </Drawer>
  )
}

const decisionToast: Record<Decision, string> = {
  approve: "Partner approved",
  reject: "Application rejected",
  suspend: "Account suspended",
  reactivate: "Account reactivated",
}

function DrawerTab({
  tab,
  p,
  editing,
  form,
  setForm,
  errors,
  perms,
  notify,
}: {
  tab: Tab
  p: PartnerDetail
  editing: boolean
  form: EditForm | null
  setForm: (f: EditForm) => void
  errors: Record<string, string>
  perms: { manage: boolean; approve: boolean }
  notify: (message: string) => void
}) {
  // A plain function, not a component: a component defined here would remount (and lose
  // an upload in progress) on every render.
  const documents = (kinds: string[]) => (
    <DocumentsPanel
      owner="partners"
      id={p.id}
      kinds={kinds}
      documents={p.documents.filter((d) => kinds.includes(d.kind))}
      canUpload={perms.manage}
      canVerify={perms.approve}
      onChanged={notify}
    />
  )
  const edit = editing && form
  const field = (k: Exclude<keyof EditForm, "businesses">, label: string, type = "text") =>
    edit ? (
      <Input
        label={label}
        type={type}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        error={errors[k]}
      />
    ) : null
  const doc = (kind: string) => p.documents.find((d) => d.kind === kind)
  const docStatus = (kind: string) => {
    const d = doc(kind)
    return d
      ? d.verified
        ? "Uploaded · Verified"
        : "Uploaded · Pending verification"
      : "Not uploaded"
  }

  if (tab === "Overview")
    return (
      <>
        <Metrics
          items={[
            ["Deliveries", p.deliveriesCompleted.toLocaleString("en-IN")],
            ["Order value", formatINR(p.orderValuePaise)],
            ["Rating", p.rating === null ? "—" : p.rating.toFixed(1)],
            ["Current order", p.currentOrderCode ? `#${p.currentOrderCode}` : "—"],
          ]}
        />
        <Eligibility p={p} />
        <Panel title="Overview" subtitle="Latest recorded information">
          <div className="timeline">
            {p.activity.length === 0 && (
              <span>
                <i />
                <b>No recorded actions yet</b>
                <small>Added {dateTimeLabel(p.createdAt)}</small>
              </span>
            )}
            {p.activity.map((a, i) => (
              <span key={i} style={{ animationDelay: `${i * 50}ms` }} className="row-in">
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
      </>
    )

  if (tab === "Personal")
    return edit ? (
      <div className="form-grid edit-grid">
        {field("name", "Full name *")}
        {field("phone", "Mobile number *")}
        {field("email", "Email address", "email")}
        {field("dateOfBirth", "Date of birth", "date")}
        <Select
          label="Gender"
          value={form.gender}
          onChange={(v) => setForm({ ...form, gender: v })}
        >
          <option value="">Not set</option>
          {GENDERS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
        {field("pinCode", "PIN code")}
        {field("address", "Residential address")}
      </div>
    ) : (
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
    )

  if (tab === "Identity")
    return (
      <>
        {edit ? (
          <div className="form-grid edit-grid">
            {field("drivingLicence", "Driving licence number *")}
            {field("licenceValidUntil", "Licence valid until", "date")}
          </div>
        ) : (
          <Section title="Identity & License">
            <Value label="Driving License" value={p.drivingLicence} />
            <Value
              label="License Validity"
              value={p.licenceValidUntil && dateLabel(p.licenceValidUntil)}
            />
            <Value
              label="KYC Status"
              value={p.kycVerified ? "Verified" : "Not independently verified"}
            />
            <Value label="Aadhaar" value={docStatus("aadhaar")} />
          </Section>
        )}
        {documents(["aadhaar", "driving_licence", "photo", "bank_proof"])}
      </>
    )

  if (tab === "Vehicle")
    return (
      <>
        {edit ? (
          <div className="form-grid edit-grid">
            <Select
              label="Vehicle type *"
              value={form.vehicleType}
              onChange={(v) => setForm({ ...form, vehicleType: v })}
            >
              {VEHICLE_TYPES.map((v) => (
                <option value={v} key={v}>
                  {vehicleLabel[v]}
                </option>
              ))}
            </Select>
            {field("vehicleNumber", "Registration number *")}
            {field("vehicleModel", "Vehicle model")}
          </div>
        ) : (
          <Section title="Vehicle Information">
            <Value label="Vehicle Type" value={vehicleLabel[p.vehicleType]} />
            <Value label="Registration Number" value={p.vehicleNumber} />
            <Value label="Vehicle Model" value={p.vehicleModel} />
            <Value label="Insurance / RC" value={docStatus("vehicle_rc")} />
          </Section>
        )}
        {documents(["vehicle_rc", "insurance"])}
      </>
    )

  if (tab === "Eligibility")
    return edit ? (
      <>
        <Panel
          title="Service eligibility"
          subtitle="Choose the businesses this partner can deliver for."
        >
          <div className="eligibility">
            {(["food", "mart"] as const).map((b) => (
              <label key={b} className="toggle-row">
                {b === "food" ? <UtensilsCrossed /> : <ShoppingBag />}
                <b>{businessName[b]}</b>
                <input
                  type="checkbox"
                  checked={form.businesses.includes(b)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      businesses: e.target.checked
                        ? [...form.businesses, b]
                        : form.businesses.filter((x) => x !== b),
                    })
                  }
                />
              </label>
            ))}
          </div>
          {errors.businesses && <p className="rejection-error">{errors.businesses}</p>}
        </Panel>
        <div className="form-grid edit-grid">
          <AreaSelect value={form.zoneId} onChange={(v) => setForm({ ...form, zoneId: v })} />
        </div>
      </>
    ) : (
      <>
        <Eligibility p={p} />
        <Section title="Assignment rules">
          <Value label="Service Area" value={p.zoneName} />
          <Value label="Managed By" value={p.managerName ?? "Not assigned"} />
          <Value label="Submitted By" value={p.submittedByName ?? "Platform onboarding"} />
          <Value label="Status" value={partnerStatusLabel[p.status]} />
        </Section>
      </>
    )

  if (tab === "Assignments") return <Assignments p={p} />

  return <Earnings p={p} />
}

function Metrics({ items }: { items: [string, string][] }) {
  return (
    <div className="detail-metrics">
      {items.map(([k, v], i) => (
        <div key={k} className="row-in" style={{ animationDelay: `${i * 60}ms` }}>
          <small>{k}</small>
          <b>{v}</b>
        </div>
      ))}
    </div>
  )
}

function Eligibility({ p }: { p: PartnerDetail }) {
  return (
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
  )
}

function Assignments({ p }: { p: PartnerDetail }) {
  const orders = useOrders({ partnerId: p.id, page: 1, pageSize: 10 })
  return (
    <Panel title="Assignments" subtitle="The latest orders this partner carried">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Business</th>
              <th>Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {!orders.data &&
              Array.from({ length: 3 }, (_, i) => (
                <tr key={i} className="skeleton-row">
                  {Array.from({ length: 4 }, (_, j) => (
                    <td key={j}>
                      <i />
                    </td>
                  ))}
                </tr>
              ))}
            {orders.data?.items.map((o, i) => (
              <tr key={o.id} className="row-in" style={{ animationDelay: `${i * 40}ms` }}>
                <td>
                  <span className="stack">
                    <strong>{o.code}</strong>
                    <small>{placedLabel(o.placedAt)}</small>
                  </span>
                </td>
                <td>
                  <Badge tone={o.business}>{businessName[o.business]}</Badge>
                </td>
                <td>
                  <Badge tone={statusTone(o.status)}>
                    {orderStatusLabel(o.business, o.status)}
                  </Badge>
                </td>
                <td>
                  <strong>{formatINR(o.totalPaise)}</strong>
                </td>
              </tr>
            ))}
            {orders.data?.items.length === 0 && (
              <tr>
                <td colSpan={4}>No orders assigned yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function Earnings({ p }: { p: PartnerDetail }) {
  const plan = p.payPlan
  const perDelivery = plan ? plan.perDeliveryPaise * p.deliveredOrders : 0
  return (
    <>
      <Metrics
        items={[
          ["Delivered orders", p.deliveredOrders.toLocaleString("en-IN")],
          ["Order value", formatINR(p.orderValuePaise)],
          ["Per-delivery pay", plan ? formatINR(perDelivery) : "—"],
          ["Monthly base", plan ? formatINR(plan.salaryPaise + plan.fixedPaise) : "—"],
        ]}
      />
      <Section title="Pay plan">
        <Value
          label="Salary (monthly)"
          value={plan ? formatINR(plan.salaryPaise) : "No plan set"}
        />
        <Value label="Fixed pay (monthly)" value={plan && formatINR(plan.fixedPaise)} />
        <Value label="Per delivery" value={plan && formatINR(plan.perDeliveryPaise)} />
        <Value label="Commission on delivery fees" value={plan && `${plan.commissionPct}%`} />
        <Value label="Effective from" value={p.payPlanFrom && dateLabel(p.payPlanFrom)} />
        <Value label="Plan changes" value="Finance & payouts" />
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
        <Value label="Bank KYC" value={p.bankVerified ? "Verified" : "Pending"} />
      </Section>
    </>
  )
}
