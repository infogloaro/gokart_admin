"use client"
// Vendor management for the Super Admin portal: the prototype's vendor table with live
// counts, filter chips, export and auto-refresh; the tabbed vendor drawer opened from each
// row's ••• button (edit details, approve / reject, suspend / reactivate); and the
// add-vendor wizard.
import { ApiError } from "@zoauro/api-client"
import {
  businessName,
  CreateVendorRequest,
  formatINR,
  formatINRCompact,
  LAUNCH_PREFERENCES,
  launchPreferenceLabel,
  orderStatusLabel,
  SETTLEMENT_CYCLES,
  settlementCycleLabel,
  UpdateVendorRequest,
  vendorDecisions,
  vendorStatusLabel,
  verificationLabel,
  type Business,
  type VendorDetail,
  type VendorStatus,
} from "@zoauro/shared"
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  ListOrdered,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
  Wallet,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useSince } from "@/lib/motion"
import { placedLabel, statusTone, useOrders } from "@/lib/orders"
import { useMe, useZones } from "@/lib/session"
import {
  activityLabel,
  dateTimeLabel,
  documentLabel,
  fieldErrors,
  useCreateVendor,
  useUpdateVendor,
  useVendor,
  useVendorDecision,
  useVendors,
  useVendorSummary,
  vendorsCsv,
  vendorStatusTone,
  verificationTone,
  withoutBlanks,
  type VendorQuery,
} from "@/lib/vendors"
import { Count, HeadActions } from "./dashboard"
import { DecisionDialog, type Decision } from "./decision"
import { useCsvExport } from "./export"
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
  Toast,
  Value,
} from "./ui"

const PAGE_SIZE = 10
const REFRESH_MS = 30_000
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

type Chip = "all" | VendorStatus
type Counts = {
  total: number
  active: number
  pending: number
  suspended: number
  rejected: number
}
const CHIPS: { key: Chip; label: string; count: keyof Counts }[] = [
  { key: "all", label: "All", count: "total" },
  { key: "active", label: "Active", count: "active" },
  { key: "pending_review", label: "Pending", count: "pending" },
  { key: "suspended", label: "Suspended", count: "suspended" },
  { key: "rejected", label: "Rejected", count: "rejected" },
]

export function SuperVendors() {
  const business = useBusinessFilter()
  const me = useMe()
  const [search, setSearch] = useState("")
  const [chip, setChip] = useState<Chip>("all")
  const [sort, setSort] = useState<"newest" | "orders">("newest")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const csv = useCsvExport()
  const filters: Omit<VendorQuery, "page" | "pageSize"> = {
    business: business === "all" ? undefined : business,
    status: chip === "all" ? undefined : chip,
    search: search.trim() || undefined,
    sort,
  }
  const vendors = useVendors({ ...filters, page, pageSize: PAGE_SIZE }, REFRESH_MS)
  const summary = useVendorSummary(REFRESH_MS)
  const since = useSince(vendors.dataUpdatedAt)
  const counts = summary.data
    ?.filter((s) => business === "all" || s.business === business)
    .reduce<Counts>(
      (t, s) => ({
        total: t.total + s.total,
        active: t.active + s.active,
        pending: t.pending + s.pending,
        suspended: t.suspended + s.suspended,
        rejected: t.rejected + s.rejected,
      }),
      { total: 0, active: 0, pending: 0, suspended: 0, rejected: 0 },
    )
  const total = vendors.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const refreshing = vendors.isFetching || summary.isFetching

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <>
      <HeadActions>
        <span className="updated-note" aria-live="polite">
          Updated {since}
        </span>
        <Button
          icon={Download}
          disabled={csv.exporting}
          onClick={() => csv.run("vendors", () => vendorsCsv(filters))}
        >
          {csv.exporting ? "Exporting…" : "Export"}
        </Button>
        <Button
          primary
          icon={RefreshCw}
          className={refreshing ? "spinning" : ""}
          onClick={() => (void vendors.refetch(), void summary.refetch())}
        >
          Refresh data
        </Button>
      </HeadActions>
      <div className="summary">
        <div>
          <i className="navy" />
          <span>
            Total <Count value={counts?.total} />
          </span>
        </div>
        <div>
          <i className="green" />
          <span>
            Active <Count value={counts?.active} />
          </span>
        </div>
        <div>
          <i className="gold" />
          <span>
            Pending <Count value={counts?.pending} />
          </span>
        </div>
        <div>
          <i className="red" />
          <span>
            Suspended <Count value={counts?.suspended} />
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
          <div className="chips" role="group" aria-label="Filter vendors">
            {CHIPS.map((c) => (
              <button
                type="button"
                key={c.key}
                className={chip === c.key ? "chip active" : "chip"}
                aria-pressed={chip === c.key}
                onClick={() => (setChip(c.key), setPage(1))}
              >
                {c.label}
                <b>{counts ? counts[c.count] : "—"}</b>
              </button>
            ))}
          </div>
        </div>
        {vendors.isError ? (
          <div className="modal-body">
            <ErrorBox icon={AlertTriangle}>
              {errorText(vendors.error, "Couldn't load vendors.")}
            </ErrorBox>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="partner-table vendor-table">
              <colgroup>
                <col style={{ width: "23%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "5%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Business</th>
                  <th>Owner</th>
                  <th>Location</th>
                  <th>Verification</th>
                  <th>Status</th>
                  <th aria-sort={sort === "orders" ? "descending" : "none"}>
                    <button
                      type="button"
                      className={sort === "orders" ? "sort active" : "sort"}
                      onClick={() => (setSort(sort === "orders" ? "newest" : "orders"), setPage(1))}
                      title="Sort by number of orders"
                    >
                      Sales <ArrowDownWideNarrow size={13} />
                    </button>
                  </th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody key={`${chip}-${sort}-${page}-${business}`}>
                {!vendors.data &&
                  Array.from({ length: 5 }, (_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 8 }, (_, j) => (
                        <td key={j}>
                          <i />
                        </td>
                      ))}
                    </tr>
                  ))}
                {vendors.data?.items.map((v, i) => (
                  <tr
                    key={v.id}
                    className={`row-in${flash === v.id ? " row-flash" : ""}`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
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
                      <span className="stack">
                        <strong>{v.salesPaise ? formatINRCompact(v.salesPaise) : "—"}</strong>
                        <small>
                          {v.ordersCount} {v.ordersCount === 1 ? "order" : "orders"}
                        </small>
                      </span>
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
      {selected && (
        <VendorDrawer id={selected} close={() => setSelected(null)} onChanged={setFlash} />
      )}
      {adding && (
        <AddVendor
          defaultBusiness={business === "all" ? "food" : business}
          close={() => setAdding(false)}
          opened={(id) => (setAdding(false), setSelected(id))}
        />
      )}
      {csv.toast && <Toast toast={csv.toast} close={csv.dismiss} />}
    </>
  )
}

const TABS = [
  "Overview",
  "Business",
  "Documents",
  "Products / Menu",
  "Orders",
  "Revenue",
  "Settlements",
  "Activity",
] as const
type Tab = (typeof TABS)[number]

const VENDOR_REASONS = [
  "Documents incomplete or invalid",
  "Licence or GST details mismatch",
  "Food safety concerns",
  "Repeated late dispatches",
  "Customer complaints",
  "Outside serviceable area",
]

type EditForm = {
  name: string
  ownerName: string
  phone: string
  email: string
  address: string
  zoneId: string
  gstin: string
  fssai: string
  commission: string
  category: string
  launchPreference: string
  ownerPhone: string
  pinCode: string
  settlementCycle: string
}

const formOf = (v: VendorDetail): EditForm => ({
  category: v.category ?? "",
  launchPreference: v.launchPreference ?? "",
  ownerPhone: v.ownerPhone ?? "",
  pinCode: v.pinCode ?? "",
  settlementCycle: v.settlementCycle ?? "",
  name: v.name,
  ownerName: v.ownerName,
  phone: v.phone,
  email: v.email,
  address: v.address,
  zoneId: v.zoneId,
  gstin: v.gstin ?? "",
  fssai: v.fssai ?? "",
  commission: String(v.commissionPct),
})

const decisionLabel: Record<Decision, string> = {
  approve: "Approve",
  reject: "Reject",
  suspend: "Suspend account",
  reactivate: "Reactivate",
}
const decisionToast: Record<Decision, string> = {
  approve: "Vendor approved",
  reject: "Application rejected",
  suspend: "Account suspended",
  reactivate: "Account reactivated",
}

/**
 * The prototype's tabbed vendor drawer. Super Admins edit details ("Edit details" →
 * "Save changes"), approve or reject applications, and suspend or reactivate vendors.
 */
export function VendorDrawer({
  id,
  close,
  onChanged,
}: {
  id: string
  close: () => void
  onChanged?: (id: string) => void
}) {
  const vendor = useVendor(id)
  const me = useMe()
  const decide = useVendorDecision()
  const update = useUpdateVendor()
  const [tab, setTab] = useState<Tab>("Overview")
  const [decision, setDecision] = useState<Decision | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const v = vendor.data
  const canDecide = Boolean(me.data?.permissions.includes("vendors.approve"))

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const startEdit = () => {
    if (!v) return
    setForm(formOf(v))
    setErrors({})
    update.reset()
    setEditing(true)
    setTab("Business")
  }

  function save() {
    if (!v) return
    if (!editing || !form) return setToast("Select Edit details to change this vendor.")
    const before = formOf(v)
    const changed: Record<string, unknown> = {}
    for (const k of Object.keys(form) as (keyof EditForm)[])
      if (form[k].trim() !== before[k])
        changed[k === "commission" ? "commissionPct" : k] =
          k === "commission" ? Number(form[k]) : form[k].trim() || undefined
    if (Object.keys(changed).length === 0) {
      setEditing(false)
      return setToast("No changes to save.")
    }
    const parsed = UpdateVendorRequest.safeParse({ ...changed, updatedAt: v.updatedAt })
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error.issues)
      if (errs.commissionPct) errs.commission = errs.commissionPct
      return setErrors(errs)
    }
    update.mutate(
      { id: v.id, body: parsed.data },
      {
        onSuccess: () => {
          setEditing(false)
          setToast("Changes saved")
          onChanged?.(v.id)
        },
      },
    )
  }

  return (
    <Drawer label={v ? v.name : "Vendor"} close={close}>
      <header>
        <IconButton icon={X} label="Close" onClick={close} />
        {v && (
          <div className="drawer-tools">
            {canDecide && v.status !== "rejected" && (
              <Button
                icon={FileText}
                onClick={editing ? () => (setEditing(false), setErrors({})) : startEdit}
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
                    void navigator.clipboard?.writeText(v.code),
                    setMenu(false),
                    setToast(`Copied ${v.code}`)
                  )}
                >
                  <Copy size={15} /> Copy vendor ID
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => (setTab("Orders"), setMenu(false))}
                >
                  <ListOrdered size={15} /> View orders
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => (setTab("Revenue"), setMenu(false))}
                >
                  <BarChart3 size={15} /> Revenue summary
                </button>
              </div>
            )}
          </div>
        )}
      </header>
      {!v ? (
        <main>
          {vendor.isError ? (
            <ErrorBox icon={AlertTriangle}>
              {errorText(vendor.error, "Couldn't load vendor.")}
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
            <b className={v.business}>{v.name.slice(0, 2).toUpperCase()}</b>
            <span>
              <strong>{v.name}</strong>
              <small>
                {v.code} · {v.ownerName} · {businessName[v.business]}
              </small>
              <em className="hero-badges">
                <Badge tone={verificationTone(v.verification)}>
                  {verificationLabel[v.verification]}
                </Badge>
                <Badge tone={vendorStatusTone(v.status)}>{vendorStatusLabel[v.status]}</Badge>
                {editing && <Badge tone="gold">Editing</Badge>}
              </em>
            </span>
          </div>
          <Tabs items={TABS} value={tab} onChange={setTab} />
          <main key={tab} className="tab-fade">
            {(update.isError || Object.keys(errors).length > 0) && (
              <ErrorBox icon={AlertTriangle}>
                {update.isError
                  ? errorText(update.error, "Couldn't save the changes.")
                  : "Some fields need attention."}
              </ErrorBox>
            )}
            <VendorTab
              tab={tab}
              v={v}
              editing={editing}
              form={form}
              setForm={setForm}
              errors={errors}
            />
          </main>
          <footer>
            {!canDecide && <span>Only a Super Admin can change vendors.</span>}
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
                  {decisionLabel[d]}
                </Button>
              ))}
            {canDecide && v.status === "rejected" && (
              <Badge tone="danger">Decision complete · {vendorStatusLabel[v.status]}</Badge>
            )}
            {canDecide && v.status !== "rejected" && (
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
                  {
                    onSuccess: () => {
                      setDecision(null)
                      setToast(decisionToast[decision])
                      onChanged?.(v.id)
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

function VendorTab({
  tab,
  v,
  editing,
  form,
  setForm,
  errors,
}: {
  tab: Tab
  v: VendorDetail
  editing: boolean
  form: EditForm | null
  setForm: (f: EditForm) => void
  errors: Record<string, string>
}) {
  const zones = useZones()
  const edit = editing && form
  const field = (k: Exclude<keyof EditForm, "zoneId">, label: string, type = "text") =>
    edit ? (
      <Input
        label={label}
        type={type}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        error={errors[k]}
      />
    ) : null
  const commissionPaise = Math.round((v.salesPaise * v.commissionPct) / 100)

  if (tab === "Overview")
    return (
      <>
        <Metrics
          items={[
            ["Total orders", v.ordersCount.toLocaleString("en-IN")],
            ["Total value", formatINR(v.salesPaise)],
            ["Commission", `${v.commissionPct}%`],
            ["Open orders", v.openOrders.toLocaleString("en-IN")],
          ]}
        />
        <Section title="Contact">
          <Value label="Owner" value={v.ownerName} />
          <Value label="Mobile number" value={v.phone} />
          <Value label="Email address" value={v.email} />
          <Value label="Service area" value={v.zoneName} />
          <Value label="Address" value={v.address} />
          <Value label="Added" value={dateTimeLabel(v.createdAt)} />
        </Section>
        <Timeline v={v} limit={3} />
      </>
    )

  if (tab === "Business")
    return edit ? (
      <div className="form-grid edit-grid">
        {field("name", "Shop / restaurant name *")}
        {field("ownerName", "Owner full name *")}
        {field("phone", "Mobile number *")}
        {field("email", "Email address *", "email")}
        <Select
          label="Service area *"
          value={form.zoneId}
          onChange={(z) => setForm({ ...form, zoneId: z })}
        >
          {zones.data?.map((z) => (
            <option value={z.id} key={z.id}>
              {z.location}, {z.city}
            </option>
          ))}
        </Select>
        {field("address", "Address *")}
        {field("gstin", "GSTIN")}
        {field("fssai", v.business === "food" ? "FSSAI licence number *" : "FSSAI licence number")}
        {field("commission", "Platform commission (%) *", "number")}
        {field("category", "Business category")}
        {field("ownerPhone", "Owner mobile number")}
        {field("pinCode", "PIN code")}
        <Select
          label="Status / Preference"
          value={form.launchPreference}
          onChange={(p) => setForm({ ...form, launchPreference: p })}
        >
          <option value="">Not set</option>
          {LAUNCH_PREFERENCES.map((p) => (
            <option value={p} key={p}>
              {launchPreferenceLabel[p]}
            </option>
          ))}
        </Select>
        <Select
          label="Settlement cycle"
          value={form.settlementCycle}
          onChange={(c) => setForm({ ...form, settlementCycle: c })}
        >
          <option value="">Not set</option>
          {SETTLEMENT_CYCLES.map((c) => (
            <option value={c} key={c}>
              {settlementCycleLabel[c]}
            </option>
          ))}
        </Select>
      </div>
    ) : (
      <>
        <Section title="Registration">
          <Value label="Business" value={businessName[v.business]} />
          <Value label="Business category" value={v.category} />
          <Value label="GSTIN" value={v.gstin} />
          <Value label="FSSAI licence" value={v.business === "food" ? v.fssai : "Not required"} />
          <Value label="Owner PAN" value={v.panMasked} />
          <Value label="Owner mobile" value={v.ownerPhone} />
          <Value label="PIN code" value={v.pinCode} />
          <Value label="Decision" value={v.decisionReason ?? vendorStatusLabel[v.status]} />
        </Section>
        <Section title="Configuration">
          <Value label="Platform commission" value={`${v.commissionPct}%`} />
          <Value
            label="Settlement cycle"
            value={v.settlementCycle && settlementCycleLabel[v.settlementCycle]}
          />
          <Value
            label="Status / Preference"
            value={v.launchPreference && launchPreferenceLabel[v.launchPreference]}
          />
          <Value label="Decided" value={v.decidedAt && dateTimeLabel(v.decidedAt)} />
        </Section>
        <Section title="Settlement account">
          <Value label="Account holder" value={v.bank?.holderName ?? "Not added"} />
          <Value label="Bank" value={v.bank?.bankName} />
          <Value label="Account number" value={v.bank && `•••• •••• ${v.bank.last4}`} />
          <Value label="IFSC code" value={v.bank?.ifsc} />
          <Value label="UPI ID" value={v.bank?.upiId} />
          <Value
            label="Verification"
            value={v.bank ? (v.bank.verified ? "Verified" : "Pending bank verification") : "—"}
          />
        </Section>
      </>
    )

  if (tab === "Documents")
    return (
      <Panel title="Documents" subtitle="Uploaded files and their verification">
        <div className="eligibility">
          {v.documents.length === 0 && (
            <span>
              <FileText />
              <b>No documents uploaded yet</b>
            </span>
          )}
          {v.documents.map((d) => (
            <span key={d.kind + d.fileName}>
              <FileText />
              <b>
                {documentLabel[d.kind] ?? d.kind}
                <small className="doc-file">{d.fileName}</small>
              </b>
              <Badge tone={d.verified ? "success" : "warning"}>
                {d.verified ? "Verified" : "Pending verification"}
              </Badge>
            </span>
          ))}
        </div>
      </Panel>
    )

  if (tab === "Products / Menu")
    return (
      <Coming
        icon={Package}
        title={v.business === "food" ? "Menu" : "Products and stock"}
        text={`The ${v.business === "food" ? "menu" : "catalogue"} appears here once the Products & inventory module is built.`}
      />
    )

  if (tab === "Orders") return <VendorOrders v={v} />

  if (tab === "Revenue")
    return (
      <>
        <Metrics
          items={[
            ["Sales (delivered)", formatINR(v.salesPaise)],
            ["Platform commission", formatINR(commissionPaise)],
            ["Vendor share", formatINR(v.salesPaise - commissionPaise)],
            ["Open orders", v.openOrders.toLocaleString("en-IN")],
          ]}
        />
        <Section title="How it adds up">
          <Value label="All orders" value={v.ordersCount.toLocaleString("en-IN")} />
          <Value label="Commission rate" value={`${v.commissionPct}%`} />
          <Value label="Counted" value="Delivered orders only, including delivery fees" />
        </Section>
      </>
    )

  if (tab === "Settlements")
    return (
      <Coming
        icon={Wallet}
        title="Settlements"
        text="Payout cycles and settlement history appear here once Finance & payouts is built."
      />
    )

  return <Timeline v={v} />
}

function Metrics({ items }: { items: [string, string][] }) {
  return (
    <div className="detail-metrics">
      {items.map(([k, val], i) => (
        <div key={k} className="row-in" style={{ animationDelay: `${i * 60}ms` }}>
          <small>{k}</small>
          <b>{val}</b>
        </div>
      ))}
    </div>
  )
}

function Timeline({ v, limit }: { v: VendorDetail; limit?: number }) {
  const items = limit ? v.activity.slice(0, limit) : v.activity
  return (
    <Panel title="Activity" subtitle="Recorded actions on this vendor">
      <div className="timeline">
        {items.length === 0 && (
          <span>
            <i />
            <b>No recorded actions yet</b>
            <small>Added {dateTimeLabel(v.createdAt)}</small>
          </span>
        )}
        {items.map((a, i) => (
          <span key={i} className="row-in" style={{ animationDelay: `${i * 50}ms` }}>
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
  )
}

function VendorOrders({ v }: { v: VendorDetail }) {
  const orders = useOrders({ vendorId: v.id, page: 1, pageSize: 10 })
  return (
    <Panel
      title="Orders"
      subtitle={`The latest orders from this ${v.business === "food" ? "restaurant" : "seller"}`}
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
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
                <td>{o.customerName}</td>
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
                <td colSpan={4}>No orders yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {orders.data && orders.data.total > 10 && (
        <p className="track-empty">
          Showing the latest 10 of {orders.data.total}. The Orders screen has the full list.
        </p>
      )}
    </Panel>
  )
}

function Coming({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Package
  title: string
  text: string
}) {
  return (
    <Panel title={title} subtitle="Not available yet">
      <div className="coming-soon">
        <Icon size={22} />
        <p>{text}</p>
      </div>
    </Panel>
  )
}

// ---- Add vendor: the prototype's 7-step wizard ----

const STEPS = [
  "Business",
  "Owner",
  "Location",
  "Documents",
  "Bank",
  "Configuration",
  "Review",
] as const

/** Request fields checked before leaving each step (Review checks them all). */
const stepFields: string[][] = [
  ["name", "business", "phone", "category", "email", "launchPreference"],
  ["ownerName", "ownerPhone", "pan"],
  ["zoneId", "address", "pinCode"],
  ["gstin", "fssai"],
  [
    "bank.holderName",
    "bank.bankName",
    "bank.accountNumber",
    "confirmAccount",
    "bank.ifsc",
    "bank.upiId",
  ],
  ["commissionPct", "settlementCycle"],
]

type VendorForm = {
  business: Business
  name: string
  phone: string
  category: string
  email: string
  launchPreference: string
  ownerName: string
  ownerPhone: string
  pan: string
  zoneId: string
  address: string
  pinCode: string
  gstin: string
  fssai: string
  holderName: string
  bankName: string
  accountNumber: string
  confirmAccount: string
  ifsc: string
  upiId: string
  commission: string
  settlementCycle: string
}

const DRAFT_KEY = "gokart-vendor-draft"
/** Drafts never keep the account number. */
const SECRET: (keyof VendorForm)[] = ["accountNumber", "confirmAccount"]

function emptyForm(business: Business): VendorForm {
  return {
    business,
    name: "",
    phone: "",
    category: "",
    email: "",
    launchPreference: "",
    ownerName: "",
    ownerPhone: "",
    pan: "",
    zoneId: "",
    address: "",
    pinCode: "",
    gstin: "",
    fssai: "",
    holderName: "",
    bankName: "",
    accountNumber: "",
    confirmAccount: "",
    ifsc: "",
    upiId: "",
    commission: business === "food" ? "18" : "12",
    settlementCycle: "weekly",
  }
}

function loadDraft(): Partial<VendorForm> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Partial<VendorForm>) : null
  } catch {
    return null
  }
}

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
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState<VendorForm>(() => {
    const draft = loadDraft()
    return draft ? { ...emptyForm(defaultBusiness), ...draft } : emptyForm(defaultBusiness)
  })
  const [restored] = useState(() => Boolean(loadDraft()))
  const set = (k: keyof VendorForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const field = (k: keyof VendorForm, errKey: string = k) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => set(k)(e.target.value),
    error: errors[errKey],
  })
  const food = form.business === "food"
  const zone = zones.data?.find((z) => z.id === form.zoneId)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2600)
    return () => clearTimeout(t)
  }, [notice])

  function request() {
    const {
      commission,
      holderName,
      bankName,
      accountNumber,
      confirmAccount,
      ifsc,
      upiId,
      ...rest
    } = form
    void confirmAccount
    const hasBank = Boolean(holderName || bankName || accountNumber || ifsc || upiId)
    return {
      ...withoutBlanks(rest, [
        "category",
        "launchPreference",
        "ownerPhone",
        "pan",
        "pinCode",
        "gstin",
        "fssai",
        "settlementCycle",
      ]),
      commissionPct: Number(commission),
      ...(hasBank && {
        bank: withoutBlanks({ holderName, bankName, accountNumber, ifsc, upiId }, ["upiId"]),
      }),
    }
  }

  function check(upTo: number) {
    const parsed = CreateVendorRequest.safeParse(request())
    const all = parsed.success ? {} : fieldErrors(parsed.error.issues)
    if (food && !form.fssai.trim()) all.fssai ??= "Restaurants need an FSSAI licence number"
    // The settlement account is required here, even though the API accepts vendors without one.
    if (!form.holderName.trim()) all["bank.holderName"] ??= "Enter the account holder's name"
    if (!form.bankName.trim()) all["bank.bankName"] ??= "Enter the bank name"
    if (!form.accountNumber) all["bank.accountNumber"] ??= "Enter the account number"
    if (!form.ifsc.trim()) all["bank.ifsc"] ??= "Enter the IFSC code"
    if (form.accountNumber !== form.confirmAccount)
      all.confirmAccount = "Account numbers don't match"
    if (all.commissionPct) all.commission = all.commissionPct
    const wanted = new Set([...stepFields.slice(0, upTo + 1).flat(), "commission"])
    const shown = Object.fromEntries(Object.entries(all).filter(([k]) => wanted.has(k)))
    setErrors(shown)
    return { shown, parsed }
  }
  const next = () => {
    if (Object.keys(check(step).shown).length === 0) setStep(step + 1)
  }
  const submit = () => {
    const { shown, parsed } = check(stepFields.length - 1)
    const keys = Object.keys(shown)
    const first = stepFields.findIndex((f) => f.some((k) => keys.includes(k)))
    if (first >= 0 || keys.length) return setStep(Math.max(first, 0))
    if (!parsed.success) return
    create.mutate(parsed.data, {
      onSuccess: () => {
        try {
          localStorage.removeItem(DRAFT_KEY)
        } catch {
          // Storage blocked: nothing to clear.
        }
      },
      // Server field errors (e.g. a GSTIN rejected by the API) go on the field.
      onError: (e) => {
        if (!(e instanceof ApiError) || !e.fields) return
        const server = Object.fromEntries(
          Object.entries(e.fields).map(([k, v]) => [k, v[0] ?? "Check this field"]),
        )
        setErrors(server)
        const at = stepFields.findIndex((f) => f.some((k) => k in server))
        if (at >= 0) setStep(at)
      },
    })
  }
  const saveDraft = () => {
    try {
      const safe = Object.fromEntries(
        Object.entries(form).filter(([k]) => !SECRET.includes(k as keyof VendorForm)),
      )
      localStorage.setItem(DRAFT_KEY, JSON.stringify(safe))
      setNotice("Draft saved on this device. Account numbers are never saved.")
    } catch {
      setNotice("This browser blocks saving drafts.")
    }
  }

  if (create.isSuccess)
    return (
      <Modal
        title="Application submitted"
        subtitle="Queued for independent verification."
        close={close}
        wide
      >
        <div className="success-state">
          <CheckCircle2 />
          <strong>Vendor application received</strong>
          <p>Uploads remain pending verification. No account has been activated automatically.</p>
          <div>
            <span>
              APPLICATION ID<b>{create.data.code}</b>
            </span>
            <span>
              STATUS<Badge tone="warning">Under Review</Badge>
            </span>
          </div>
        </div>
        <footer>
          <Button onClick={() => opened(create.data.id)}>Open vendor</Button>
          <Button primary onClick={close}>
            Return to management
          </Button>
        </footer>
      </Modal>
    )

  const docs: [string, string][] = [
    ["GST certificate", "Primary document"],
    [food ? "FSSAI licence" : "Trade licence", "Supporting document"],
    ["Cancelled cheque or bank statement", "Bank proof"],
  ]
  const review: [string, string, number][] = [
    [
      "Primary information",
      form.name ? `${form.name} · ${businessName[form.business]}` : "Not provided",
      0,
    ],
    [
      "Contact details",
      [form.ownerName, form.phone, form.email].filter(Boolean).join(" · ") || "Not provided",
      1,
    ],
    [
      "Location",
      zone
        ? `${zone.location}, ${zone.city}${form.pinCode ? ` · ${form.pinCode}` : ""}`
        : "Not chosen",
      2,
    ],
    [
      "Documents",
      [form.gstin && `GSTIN ${form.gstin}`, form.fssai && `FSSAI ${form.fssai}`]
        .filter(Boolean)
        .join(" · ") || "Numbers not entered · files pending",
      3,
    ],
    [
      "Bank account",
      form.accountNumber
        ? `${form.bankName || "Bank"} · •••• ${form.accountNumber.slice(-4)}`
        : "Not provided",
      4,
    ],
    [
      "Configuration",
      `${form.commission}% commission · ${form.settlementCycle ? settlementCycleLabel[form.settlementCycle as keyof typeof settlementCycleLabel] : "No settlement cycle"}`,
      5,
    ],
  ]

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
        <p>Enter accurate information. Uploaded documents require independent verification.</p>
        {restored && step === 0 && (
          <p className="wizard-note">
            A saved draft was restored. Re-enter the account number at the Bank step.
          </p>
        )}
        {create.isError && !(create.error instanceof ApiError && create.error.fields) && (
          <ErrorBox icon={AlertTriangle}>
            {errorText(create.error, "Couldn't add the vendor.")}
          </ErrorBox>
        )}

        {step === 0 && (
          <div className="form-grid">
            <Input label="Shop / restaurant name *" {...field("name")} />
            <Select
              label="Business type *"
              value={form.business}
              onChange={(b) => set("business")(b)}
            >
              <option value="food">ZOAURO FOOD — Restaurant</option>
              <option value="mart">GLOARO MART — Seller</option>
            </Select>
            <Input
              label="Mobile number *"
              inputMode="tel"
              placeholder="98400 12345"
              {...field("phone")}
            />
            <Input
              label="Business category"
              placeholder={food ? "South Indian, Biryani…" : "Groceries, Home goods…"}
              {...field("category")}
            />
            <Input
              label="Email address *"
              type="email"
              placeholder="name@business.com"
              {...field("email")}
            />
            <Select
              label="Status / Preference"
              value={form.launchPreference}
              onChange={set("launchPreference")}
            >
              <option value="">Select option</option>
              {LAUNCH_PREFERENCES.map((p) => (
                <option value={p} key={p}>
                  {launchPreferenceLabel[p]}
                </option>
              ))}
            </Select>
          </div>
        )}

        {step === 1 && (
          <div className="form-grid">
            <Input label="Owner full name *" {...field("ownerName")} />
            <Input
              label="Owner mobile number"
              inputMode="tel"
              placeholder="98400 12345"
              {...field("ownerPhone")}
            />
            <Input label="PAN number" placeholder="ABCDE1234F" {...field("pan")} />
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
            <Input
              label="PIN code"
              inputMode="numeric"
              placeholder="600017"
              {...field("pinCode")}
            />
            <Input
              label="City"
              value={zone ? `${zone.city}, ${zone.district}` : ""}
              readOnly
              placeholder="Set by the service area"
            />
            {errors.zoneId && <em className="rejection-error">{errors.zoneId}</em>}
          </div>
        )}

        {step === 3 && (
          <>
            <div className="uploads">
              {docs.map(([doc, kind]) => (
                <div className="upload-card" key={doc}>
                  <UploadCloud />
                  <b>{doc}</b>
                  <small>{kind} · PDF, JPG or PNG · Max 10MB</small>
                  <Badge tone="neutral">Not uploaded</Badge>
                </div>
              ))}
            </div>
            <p className="wizard-note">
              File upload is switched on once document storage is set up. Enter the registration
              numbers now; the files can be added from the vendor&apos;s Documents tab later.
            </p>
            <div className="form-grid">
              <Input label="GSTIN" placeholder="33ABCDE1234F1Z5" {...field("gstin")} />
              <Input
                label={food ? "FSSAI licence number *" : "FSSAI licence number"}
                inputMode="numeric"
                placeholder="14 digits"
                {...field("fssai")}
              />
            </div>
          </>
        )}

        {step === 4 && (
          <div className="form-grid">
            <Input label="Account holder name *" {...field("holderName", "bank.holderName")} />
            <Input label="Bank name *" {...field("bankName", "bank.bankName")} />
            <Input
              label="Account number *"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              {...field("accountNumber", "bank.accountNumber")}
            />
            <Input
              label="Confirm account number *"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              {...field("confirmAccount")}
            />
            <Input label="IFSC code *" placeholder="HDFC0001284" {...field("ifsc", "bank.ifsc")} />
            <Input label="UPI ID" placeholder="name@bank" {...field("upiId", "bank.upiId")} />
          </div>
        )}

        {step === 5 && (
          <div className="form-grid">
            <Input
              label="Platform commission (%) *"
              type="number"
              min={0}
              max={50}
              step={0.25}
              {...field("commission")}
            />
            <Select
              label="Settlement cycle"
              value={form.settlementCycle}
              onChange={set("settlementCycle")}
            >
              {SETTLEMENT_CYCLES.map((c) => (
                <option value={c} key={c}>
                  {settlementCycleLabel[c]}
                </option>
              ))}
            </Select>
          </div>
        )}

        {step === 6 && (
          <div className="review">
            {review.map(([a, b, c]) => (
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
        {notice && (
          <p className="wizard-note" role="status">
            <CheckCircle2 size={14} /> {notice}
          </p>
        )}
      </div>
      <footer>
        <Button onClick={step ? () => setStep(step - 1) : close}>{step ? "Back" : "Cancel"}</Button>
        <i />
        <Button onClick={saveDraft}>Save draft</Button>
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
