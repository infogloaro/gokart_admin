"use client"

import { ApiError } from "@zoauro/api-client"
import {
  DELIVERY_BOYS_PER_PARTNER,
  DeliveryBoyApplicationRequest,
  GENDERS,
  businessName,
  DeliveryBoyDocumentKind,
  FleetDeliveryBoyOnboardingRequest,
  VEHICLE_TYPES,
  CreateDeliveryFleetRequest,
  UpdateDeliveryFleetRequest,
  type Business,
  type DeliveryBoy,
  type DeliveryFleet,
  type DeliveryBoyStatus,
  type VehicleType,
  vehicleLabel,
} from "@zoauro/shared"
import {
  AlertTriangle,
  Copy,
  History,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react"
import { useMemo, useState } from "react"
import {
  useAddDeliveryBoy,
  useAssignFleetZone,
  useCreateDeliveryFleet,
  useDeliveryBoys,
  useDeliveryFleets,
  useReviewDeliveryBoy,
  useReviewDeliveryFleet,
  useRotateFleetCredential,
  useUpdateDeliveryFleet,
  useVerifyBoyDocument,
  uploadDeliveryBoyDocument,
} from "@/lib/delivery"
import { fileProblem } from "@/lib/documents"
import { useManagedDistricts, useManagedZones } from "@/lib/system"
import { useMe } from "@/lib/session"
import { Badge, Button, ErrorBox, Input, Modal, Select, Tabs, Toast } from "./ui"
import { ReasonDialog } from "./reason-dialog"
import { BoyTimeline, FleetHistory } from "./history-list"

const MANAGEMENT_TABS = ["Fleet partners", "Rider applications"] as const
type ManagementTab = (typeof MANAGEMENT_TABS)[number]

const FLEET_STATUS_LABEL: Record<DeliveryFleet["status"], string> = {
  pending_approval: "Awaiting Super Admin",
  active: "Active",
  suspended: "Suspended",
  rejected: "Rejected",
}

const fleetTone = (status: DeliveryFleet["status"]) =>
  status === "active" ? "success" : status === "pending_approval" ? "info" : "danger"

const STATUS_LABEL: Record<DeliveryBoyStatus, string> = {
  pending_admin: "Admin review",
  pending_super: "Super Admin review",
  corrections_requested: "Corrections requested",
  rejected: "Rejected",
  active: "Approved",
  suspended: "Suspended",
}

const statusTone = (status: DeliveryBoyStatus) =>
  status === "active"
    ? "success"
    : status === "rejected" || status === "suspended"
      ? "danger"
      : status === "pending_super"
        ? "info"
        : "warning"

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "The request couldn't be completed."
const RIDER_DOCUMENTS = [
  ["photo_id", "Aadhaar / photo ID"],
  ["driving_licence", "Driving licence"],
  ["profile_photo", "Profile photo"],
  ["vehicle_registration", "Vehicle registration certificate"],
  ["insurance", "Vehicle insurance"],
] as const
type RiderDocumentKind = (typeof RIDER_DOCUMENTS)[number][0]
type RiderUpload = { riderIndex: number; kind: RiderDocumentKind; file: File }

export function SuperDeliveryManagement() {
  const [tab, setTab] = useState<ManagementTab>("Fleet partners")
  return (
    <>
      <Tabs items={MANAGEMENT_TABS} value={tab} onChange={setTab} />
      {tab === "Fleet partners" ? <FleetPartners /> : <RiderApplications />}
    </>
  )
}

function FleetPartners() {
  const districts = useManagedDistricts()
  const zones = useManagedZones()
  const [search, setSearch] = useState("")
  const [districtId, setDistrictId] = useState("")
  const [zoneId, setZoneId] = useState("")
  const [business, setBusiness] = useState<Business | "">("")
  const [adding, setAdding] = useState(false)
  const [editingFleet, setEditingFleet] = useState<DeliveryFleet | null>(null)
  const [assigning, setAssigning] = useState<DeliveryFleet | null>(null)
  const [credential, setCredential] = useState<string | null>(null)
  const [uploadSummary, setUploadSummary] = useState<{
    uploaded: number
    failed: string[]
  } | null>(null)
  const [flash, setFlash] = useState("")
  const [statusChange, setStatusChange] = useState<DeliveryFleet | null>(null)
  const [rotating, setRotating] = useState<DeliveryFleet | null>(null)
  const [decision, setDecision] = useState<{
    fleet: DeliveryFleet
    decision: "approved" | "rejected"
  } | null>(null)
  const [historyOf, setHistoryOf] = useState<DeliveryFleet | null>(null)
  const [addingRiderTo, setAddingRiderTo] = useState<DeliveryFleet | null>(null)
  const [dialogError, setDialogError] = useState("")
  const list = useDeliveryFleets({
    business: business || undefined,
    districtId: districtId || undefined,
    zoneId: zoneId || undefined,
    search: search.trim() || undefined,
    page: 1,
    pageSize: 100,
  })
  const pending = useDeliveryFleets({ status: "pending_approval", page: 1, pageSize: 50 })
  const allFleets = useDeliveryFleets({ page: 1, pageSize: 100 })
  const create = useCreateDeliveryFleet()
  const update = useUpdateDeliveryFleet()
  const assign = useAssignFleetZone()
  const rotate = useRotateFleetCredential()
  const review = useReviewDeliveryFleet()
  const availableZones = useMemo(
    () =>
      (zones.data ?? []).filter(
        (zone) => zone.active && (!districtId || zone.districtId === districtId),
      ),
    [districtId, zones.data],
  )
  const assignedZoneIds = useMemo(
    () =>
      new Set((allFleets.data?.items ?? []).flatMap((fleet) => fleet.zones.map((zone) => zone.id))),
    [allFleets.data],
  )

  const createFleet = async (input: CreateDeliveryFleetRequest, uploads: RiderUpload[]) => {
    try {
      const result = await create.mutateAsync(input)
      let uploaded = 0
      const failed: string[] = []
      for (const upload of uploads) {
        const rider = result.deliveryBoys[upload.riderIndex]
        if (!rider) {
          failed.push(`Delivery boy ${upload.riderIndex + 1}: record missing`)
          continue
        }
        try {
          await uploadDeliveryBoyDocument(result.credential, rider.id, upload.kind, upload.file)
          uploaded++
        } catch (error) {
          failed.push(`${rider.name}: ${upload.kind} (${errorText(error)})`)
        }
      }
      setUploadSummary({ uploaded, failed })
      setCredential(result.credential)
      setAdding(false)
    } catch (error) {
      setFlash(errorText(error))
    }
  }

  return (
    <>
      <div className="summary">
        <div>
          <i className="navy" />
          <span>
            Fleet partners <b>{list.data?.total ?? "—"}</b>
          </span>
        </div>
        <div>
          <i className="green" />
          <span>
            Active riders{" "}
            <b>
              {list.data?.items.reduce((sum, fleet) => sum + fleet.availableBoyCount, 0) ?? "—"}
            </b>
          </span>
        </div>
        <Button primary icon={Plus} onClick={() => setAdding(true)}>
          Add fleet partner
        </Button>
      </div>
      {(pending.data?.items.length ?? 0) > 0 && (
        <section className="panel table-panel">
          <header className="panel-header">
            <strong>Partner requests awaiting your approval</strong>
            <small>
              Requested by Admins. Approval activates the zones and issues the partner key.
            </small>
          </header>
          <table className="partner-table">
            <tbody>
              {pending.data?.items.map((fleet) => (
                <tr key={fleet.id}>
                  <td>
                    <span className="stack">
                      <strong>{fleet.name}</strong>
                      <small>
                        {fleet.code} · requested by {fleet.requestedByName ?? "an Admin"} ·{" "}
                        {fleet.zones.map((zone) => zone.name).join(", ") || "no zones"}
                      </small>
                    </span>
                  </td>
                  <td>{fleet.businesses.map((item) => businessName[item]).join(", ")}</td>
                  <td>
                    <div className="row-actions">
                      <Button
                        primary
                        onClick={() => {
                          setDialogError("")
                          setDecision({ fleet, decision: "approved" })
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        danger
                        onClick={() => {
                          setDialogError("")
                          setDecision({ fleet, decision: "rejected" })
                        }}
                      >
                        Reject
                      </Button>
                      <Button icon={History} onClick={() => setHistoryOf(fleet)}>
                        History
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="panel table-panel">
        <div className="filters">
          <Input
            icon={Search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search partners, contact or mobile…"
            aria-label="Search fleet partners"
          />
          <Select
            label="Business"
            value={business}
            onChange={(value) => setBusiness(value === "food" || value === "mart" ? value : "")}
          >
            <option value="">All businesses</option>
            <option value="food">{businessName.food}</option>
            <option value="mart">{businessName.mart}</option>
          </Select>
          <Select
            label="District"
            value={districtId}
            onChange={(value) => {
              setDistrictId(value)
              setZoneId("")
            }}
          >
            <option value="">All districts</option>
            {(districts.data ?? []).map((district) => (
              <option key={district.id} value={district.id}>
                {district.name}
              </option>
            ))}
          </Select>
          <Select label="Zone" value={zoneId} onChange={setZoneId}>
            <option value="">All zones</option>
            {availableZones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.location}, {zone.city}
              </option>
            ))}
          </Select>
        </div>
        {list.isError ? (
          <div className="modal-body">
            <ErrorBox icon={AlertTriangle}>{errorText(list.error)}</ErrorBox>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Delivery partner</th>
                  <th>Business</th>
                  <th>District</th>
                  <th>Primary zones</th>
                  <th>Riders</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((fleet) => (
                  <tr key={fleet.id}>
                    <td>
                      <span className="stack">
                        <strong>{fleet.name}</strong>
                        <small>
                          {fleet.code} · {fleet.contactPerson} · {fleet.phone}
                        </small>
                      </span>
                    </td>
                    <td>{fleet.businesses.map((item) => businessName[item]).join(", ")}</td>
                    <td>{fleet.district}</td>
                    <td>{fleet.zones.map((zone) => zone.name).join(", ") || "No active zone"}</td>
                    <td>
                      <span className="stack">
                        <span>
                          {fleet.availableBoyCount} available / {fleet.deliveryBoyCount} of{" "}
                          {DELIVERY_BOYS_PER_PARTNER.max}
                        </span>
                        {fleet.deliveryBoyCount < DELIVERY_BOYS_PER_PARTNER.min && (
                          <small>Below the {DELIVERY_BOYS_PER_PARTNER.min}-rider target</small>
                        )}
                      </span>
                    </td>
                    <td>
                      <Badge tone={fleetTone(fleet.status)}>
                        {FLEET_STATUS_LABEL[fleet.status]}
                      </Badge>
                    </td>
                    <td>
                      <div className="row-actions">
                        {fleet.status === "active" || fleet.status === "suspended" ? (
                          <>
                            <Button onClick={() => setAssigning(fleet)}>Manage zones</Button>
                            <Button icon={UserPlus} onClick={() => setAddingRiderTo(fleet)}>
                              Add delivery boy
                            </Button>
                            <Button onClick={() => setEditingFleet(fleet)}>Edit profile</Button>
                            <Button onClick={() => setStatusChange(fleet)}>
                              {fleet.status === "active" ? "Suspend" : "Reactivate"}
                            </Button>
                            <Button icon={RotateCw} onClick={() => setRotating(fleet)}>
                              Rotate key
                            </Button>
                          </>
                        ) : null}
                        <Button icon={History} onClick={() => setHistoryOf(fleet)}>
                          History
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {list.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={7}>No fleet partners match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {adding && (
        <FleetForm
          districts={districts.data ?? []}
          zones={(zones.data ?? []).filter((zone) => !assignedZoneIds.has(zone.id))}
          saving={create.isPending}
          close={() => setAdding(false)}
          submit={(input, uploads) => void createFleet(input, uploads)}
        />
      )}
      {assigning && (
        <ZoneAssignment
          fleet={assigning}
          zones={(zones.data ?? []).filter((zone) => zone.active)}
          saving={assign.isPending}
          close={() => setAssigning(null)}
          submit={async (zoneId, replaceCurrent, reason) => {
            try {
              await assign.mutateAsync({ id: assigning.id, zoneId, replaceCurrent, reason })
              setAssigning(null)
            } catch (error) {
              setFlash(errorText(error))
            }
          }}
        />
      )}
      {editingFleet && (
        <FleetProfileEditor
          fleet={editingFleet}
          saving={update.isPending}
          close={() => setEditingFleet(null)}
          submit={(body) =>
            update.mutate(
              { id: editingFleet.id, body },
              {
                onSuccess: () => setEditingFleet(null),
                onError: (error) => setFlash(errorText(error)),
              },
            )
          }
        />
      )}
      {credential && (
        <Modal
          title="Partner credential"
          subtitle="The fleet and its delivery boys were created. This secret is shown only once; share it securely."
          close={() => {
            setCredential(null)
            setUploadSummary(null)
          }}
        >
          <div className="modal-body">
            {uploadSummary && (
              <p role={uploadSummary.failed.length ? "alert" : "status"}>
                {uploadSummary.uploaded} rider documents uploaded.
                {uploadSummary.failed.length > 0 &&
                  ` ${uploadSummary.failed.length} failed: ${uploadSummary.failed.join("; ")}. Upload these from the partner account.`}
              </p>
            )}
            <Input readOnly label="Partner credential" value={credential} />
            <Button icon={Copy} onClick={() => void navigator.clipboard.writeText(credential)}>
              Copy credential
            </Button>
          </div>
        </Modal>
      )}
      {statusChange && (
        <ReasonDialog
          title={
            statusChange.status === "active"
              ? "Suspend delivery partner"
              : "Reactivate delivery partner"
          }
          subtitle={`${statusChange.name} · ${statusChange.code}`}
          confirmLabel={statusChange.status === "active" ? "Suspend" : "Reactivate"}
          danger={statusChange.status === "active"}
          saving={update.isPending}
          error={dialogError}
          close={() => setStatusChange(null)}
          submit={(reason) =>
            update.mutate(
              {
                id: statusChange.id,
                body: {
                  name: statusChange.name,
                  companyName: statusChange.companyName,
                  contactPerson: statusChange.contactPerson,
                  phone: statusChange.phone,
                  email: statusChange.email,
                  address: statusChange.address,
                  status: statusChange.status === "active" ? "suspended" : "active",
                  businesses: statusChange.businesses,
                  reason,
                },
              },
              {
                onSuccess: () => setStatusChange(null),
                onError: (error) => setDialogError(errorText(error)),
              },
            )
          }
        />
      )}
      {rotating && (
        <ReasonDialog
          title="Rotate partner key"
          subtitle={`${rotating.name} · the old key stops working immediately`}
          confirmLabel="Rotate key"
          danger
          saving={rotate.isPending}
          error={dialogError}
          close={() => setRotating(null)}
          submit={(reason) =>
            rotate.mutate(
              { id: rotating.id, reason },
              {
                onSuccess: (result) => {
                  setRotating(null)
                  setCredential(result.credential)
                },
                onError: (error) => setDialogError(errorText(error)),
              },
            )
          }
        />
      )}
      {decision && (
        <ReasonDialog
          title={
            decision.decision === "approved"
              ? "Approve delivery partner"
              : "Reject delivery partner"
          }
          subtitle={`${decision.fleet.name} · ${decision.fleet.code}`}
          confirmLabel={decision.decision === "approved" ? "Approve partner" : "Reject partner"}
          danger={decision.decision === "rejected"}
          saving={review.isPending}
          error={dialogError}
          close={() => setDecision(null)}
          submit={(reason) =>
            review.mutate(
              { id: decision.fleet.id, body: { decision: decision.decision, reason } },
              {
                onSuccess: (result) => {
                  setDecision(null)
                  if (result.credential) setCredential(result.credential)
                },
                onError: (error) => setDialogError(errorText(error)),
              },
            )
          }
        />
      )}
      {addingRiderTo && (
        <AddRiderDialog
          fleet={addingRiderTo}
          close={() => setAddingRiderTo(null)}
          onAdded={(name) => {
            setAddingRiderTo(null)
            setFlash(`${name} was added. Admin review comes next.`)
          }}
        />
      )}
      {historyOf && (
        <Modal
          title="Partner history"
          subtitle={`${historyOf.name} · ${historyOf.code}`}
          close={() => setHistoryOf(null)}
          wide
        >
          <div className="modal-body">
            <FleetHistory fleetId={historyOf.id} />
          </div>
        </Modal>
      )}
      {flash && (
        <Toast
          toast={{ title: "Delivery partner update failed", message: flash, tone: "error" }}
          close={() => setFlash("")}
        />
      )}
    </>
  )
}

/** Super Admin adds one delivery boy to a partner, in one of the partner's zones. Admin review follows. */
function AddRiderDialog({
  fleet,
  close,
  onAdded,
}: {
  fleet: DeliveryFleet
  close: () => void
  onAdded: (name: string) => void
}) {
  const add = useAddDeliveryBoy()
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    zoneId: fleet.zones[0]?.id ?? "",
    vehicleType: "scooter" as VehicleType,
    vehicleNumber: "",
  })
  const [error, setError] = useState("")
  const submit = async () => {
    setError("")
    const parsed = DeliveryBoyApplicationRequest.safeParse({
      ...form,
      email: form.email || undefined,
    })
    if (!parsed.success)
      return setError(parsed.error.issues[0]?.message ?? "Check the delivery boy details.")
    try {
      const boy = await add.mutateAsync({ fleetId: fleet.id, body: parsed.data })
      onAdded(boy.name)
    } catch (cause) {
      setError(errorText(cause))
    }
  }
  return (
    <Modal title="Add delivery boy" subtitle={`${fleet.name} · ${fleet.code}`} close={close} wide>
      <div className="modal-body">
        <div className="form-grid">
          <Input
            label="Full name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Mobile *"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Address *"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <Select
            label="Zone *"
            value={form.zoneId}
            onChange={(zoneId) => setForm({ ...form, zoneId })}
          >
            {fleet.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </Select>
          <Select
            label="Vehicle *"
            value={form.vehicleType}
            onChange={(value) => setForm({ ...form, vehicleType: value as VehicleType })}
          >
            {VEHICLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {vehicleLabel[type]}
              </option>
            ))}
          </Select>
          <Input
            label="Vehicle number *"
            value={form.vehicleNumber}
            onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
          />
        </div>
        <p>
          The delivery boy is sent to the zone Admin for review. Documents are uploaded from the
          partner portal or the review screen.
        </p>
        {error && <ErrorBox icon={AlertTriangle}>{error}</ErrorBox>}
        <footer>
          <Button onClick={close}>Cancel</Button>
          <Button primary disabled={add.isPending} onClick={() => void submit()}>
            {add.isPending ? "Adding…" : "Add delivery boy"}
          </Button>
        </footer>
      </div>
    </Modal>
  )
}

function FleetForm({
  districts,
  zones,
  saving,
  close,
  submit,
}: {
  districts: NonNullable<ReturnType<typeof useManagedDistricts>["data"]>
  zones: NonNullable<ReturnType<typeof useManagedZones>["data"]>
  saving: boolean
  close: () => void
  submit: (input: CreateDeliveryFleetRequest, uploads: RiderUpload[]) => void
}) {
  type FleetDetails = {
    name: string
    companyName: string
    contactPerson: string
    phone: string
    email: string
    address: string
  }
  type RiderDetails = {
    name: string
    phone: string
    email: string
    dateOfBirth: string
    gender: string
    address: string
    pinCode: string
    zoneId: string
    drivingLicence: string
    licenceValidUntil: string
    vehicleType: VehicleType
    vehicleNumber: string
    vehicleModel: string
    holderName: string
    bankName: string
    accountNumber: string
    confirmAccount: string
    ifsc: string
    files: Partial<Record<RiderDocumentKind, File>>
  }
  const emptyRider = (): RiderDetails => ({
    name: "",
    phone: "+91",
    email: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    pinCode: "",
    zoneId: "",
    drivingLicence: "",
    licenceValidUntil: "",
    vehicleType: "motorcycle",
    vehicleNumber: "",
    vehicleModel: "",
    holderName: "",
    bankName: "",
    accountNumber: "",
    confirmAccount: "",
    ifsc: "",
    files: {},
  })
  const [districtId, setDistrictId] = useState("")
  const [businesses, setBusinesses] = useState<Business[]>(["food", "mart"])
  const [zoneIds, setZoneIds] = useState<string[]>([])
  const [form, setForm] = useState<FleetDetails>({
    name: "",
    companyName: "",
    contactPerson: "",
    phone: "+91",
    email: "",
    address: "",
  })
  const [page, setPage] = useState(0)
  const [riderStep, setRiderStep] = useState(0)
  const [rider, setRider] = useState<RiderDetails>(emptyRider)
  const [riders, setRiders] = useState<RiderDetails[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const districtZones = zones.filter((zone) => zone.active && zone.districtId === districtId)
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))
  const setRiderField = (key: keyof RiderDetails, value: string) =>
    setRider((current) => ({ ...current, [key]: value }))
  const riderPayload = (entry: RiderDetails) => {
    const {
      confirmAccount,
      files,
      holderName,
      bankName,
      accountNumber,
      ifsc,
      email,
      dateOfBirth,
      gender,
      pinCode,
      licenceValidUntil,
      vehicleModel,
      ...profile
    } = entry
    void confirmAccount
    void files
    return {
      ...profile,
      ...(email && { email }),
      ...(dateOfBirth && { dateOfBirth }),
      ...(gender && { gender }),
      ...(pinCode && { pinCode }),
      ...(licenceValidUntil && { licenceValidUntil }),
      ...(vehicleModel && { vehicleModel }),
      payout: { holderName, bankName, accountNumber, ifsc },
    }
  }
  const riderFieldsByStep: string[][] = [
    ["name", "phone", "email", "dateOfBirth", "gender", "address", "pinCode", "zoneId"],
    ["drivingLicence", "licenceValidUntil"],
    ["vehicleType", "vehicleNumber", "vehicleModel"],
    ["payout", "confirmAccount"],
    [
      "name",
      "phone",
      "email",
      "dateOfBirth",
      "gender",
      "address",
      "pinCode",
      "zoneId",
      "drivingLicence",
      "licenceValidUntil",
      "vehicleType",
      "vehicleNumber",
      "vehicleModel",
      "payout",
      "confirmAccount",
    ],
  ]
  const validateRider = (stage: number) => {
    const parsed = FleetDeliveryBoyOnboardingRequest.safeParse(riderPayload(rider))
    const allowed = new Set(riderFieldsByStep[stage])
    const nextErrors: Record<string, string> = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "")
        if (allowed.has(key)) nextErrors[key] ??= issue.message
      }
    }
    if (allowed.has("confirmAccount") && rider.accountNumber !== rider.confirmAccount)
      nextErrors.confirmAccount = "Account numbers don't match."
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }
  const hasRiderDetails = Boolean(
    rider.name.trim() ||
    rider.drivingLicence.trim() ||
    rider.vehicleNumber.trim() ||
    rider.accountNumber.trim(),
  )
  const addRider = () => {
    if (!validateRider(4)) return
    setRiders((current) => [...current, rider])
    setRider(emptyRider())
    setRiderStep(0)
    setErrors({})
  }
  const allUploads = riders.flatMap((entry, riderIndex) =>
    Object.entries(entry.files).flatMap(([kind, file]) =>
      file ? [{ riderIndex, kind: kind as RiderDocumentKind, file }] : [],
    ),
  )
  const request = () => ({
    ...form,
    ...(form.companyName && { companyName: form.companyName }),
    ...(form.email && { email: form.email }),
    districtId,
    businesses,
    zoneIds,
    deliveryBoys: riders.map((entry) => riderPayload(entry)),
  })
  const riderSteps = [
    "Personal information",
    "Identity & license",
    "Vehicle information",
    "Payout details",
    "Final review",
  ]

  return (
    <Modal
      title={
        page === 0 ? "New delivery partner" : page === 1 ? "Add delivery boys" : "Review fleet"
      }
      subtitle={`Step ${page + 1} of 3 · One delivery partner can have multiple delivery boys.`}
      close={close}
      wide
    >
      <div className="modal-body">
        <div className="tabs" role="tablist" aria-label="Fleet onboarding steps">
          {["Partner", "Delivery boys", "Review"].map((label, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={page === index}
              className={page === index ? "active" : ""}
              key={label}
              onClick={() => {
                if (index < page) setPage(index)
                else if (index === 1 && districtId && zoneIds.length) setPage(index)
                else if (index === 2 && riders.length) setPage(index)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {page === 0 && (
          <>
            <h3>Delivery partner details</h3>
            <div className="form-grid">
              <Input
                label="Partner name *"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
              <Input
                label="Company name"
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
              />
              <Input
                label="Contact person *"
                value={form.contactPerson}
                onChange={(e) => set("contactPerson", e.target.value)}
              />
              <Input
                label="Phone *"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
              <Select
                label="District *"
                value={districtId}
                onChange={(value) => {
                  setDistrictId(value)
                  setZoneIds([])
                }}
              >
                <option value="">Choose district</option>
                {districts
                  .filter((district) => district.active)
                  .map((district) => (
                    <option key={district.id} value={district.id}>
                      {district.name}
                    </option>
                  ))}
              </Select>
            </div>
            <fieldset className="form-field">
              <legend>Businesses served *</legend>
              {(["food", "mart"] as const).map((item) => (
                <label key={item} className="check-row">
                  <input
                    type="checkbox"
                    checked={businesses.includes(item)}
                    onChange={(event) =>
                      setBusinesses((current) =>
                        event.target.checked
                          ? [...current, item]
                          : current.filter((entry) => entry !== item),
                      )
                    }
                  />
                  {businessName[item]}
                </label>
              ))}
            </fieldset>
            <Input
              label="Business address *"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
            <fieldset className="form-field">
              <legend>Initial service zones *</legend>
              {districtZones.map((zone) => (
                <label key={zone.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={zoneIds.includes(zone.id)}
                    onChange={(event) =>
                      setZoneIds((ids) =>
                        event.target.checked
                          ? [...ids, zone.id]
                          : ids.filter((id) => id !== zone.id),
                      )
                    }
                  />
                  {zone.location}, {zone.city}
                </label>
              ))}
              {districtId && districtZones.length === 0 && (
                <small>No active zones in this district.</small>
              )}
            </fieldset>
          </>
        )}
        {page === 1 && (
          <>
            <h3>Delivery boys ({riders.length})</h3>
            <p>Each person is saved as a separate rider application under this fleet.</p>
            {riders.map((entry, index) => (
              <div className="check-row" key={`${entry.phone}-${index}`}>
                <strong>{entry.name}</strong> · {entry.phone} ·{" "}
                {districtZones.find((zone) => zone.id === entry.zoneId)?.location}
                <Button
                  onClick={() => setRiders((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <div className="tabs" role="tablist" aria-label="Delivery boy onboarding steps">
              {riderSteps.map((label, index) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={riderStep === index}
                  className={riderStep === index ? "active" : ""}
                  key={label}
                  onClick={() => index < riderStep && setRiderStep(index)}
                >
                  {index + 1}. {label}
                </button>
              ))}
            </div>
            {riderStep === 0 && (
              <>
                <h3>Boy {riders.length + 1} · Personal information</h3>
                <div className="form-grid">
                  <Input
                    label="Full name *"
                    value={rider.name}
                    error={errors.name}
                    onChange={(e) => setRiderField("name", e.target.value)}
                  />
                  <Input
                    label="Mobile number *"
                    inputMode="tel"
                    value={rider.phone}
                    error={errors.phone}
                    onChange={(e) => setRiderField("phone", e.target.value)}
                  />
                  <Input
                    label="Email address"
                    type="email"
                    value={rider.email}
                    error={errors.email}
                    onChange={(e) => setRiderField("email", e.target.value)}
                  />
                  <Input
                    label="Date of birth"
                    type="date"
                    value={rider.dateOfBirth}
                    error={errors.dateOfBirth}
                    onChange={(e) => setRiderField("dateOfBirth", e.target.value)}
                  />
                  <Select
                    label="Gender"
                    value={rider.gender}
                    onChange={(value) => setRiderField("gender", value)}
                  >
                    <option value="">Select gender</option>
                    {GENDERS.map((gender) => (
                      <option key={gender}>{gender}</option>
                    ))}
                  </Select>
                  <Input
                    label="PIN code"
                    inputMode="numeric"
                    value={rider.pinCode}
                    error={errors.pinCode}
                    onChange={(e) => setRiderField("pinCode", e.target.value)}
                  />
                  <Input
                    label="Residential address *"
                    value={rider.address}
                    error={errors.address}
                    onChange={(e) => setRiderField("address", e.target.value)}
                  />
                  <Select
                    label="Service area *"
                    value={rider.zoneId}
                    onChange={(value) => setRiderField("zoneId", value)}
                  >
                    <option value="">Choose an assigned zone</option>
                    {districtZones
                      .filter((zone) => zoneIds.includes(zone.id))
                      .map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.location}, {zone.city}
                        </option>
                      ))}
                  </Select>
                </div>
              </>
            )}
            {riderStep === 1 && (
              <>
                <h3>Identity &amp; license</h3>
                <div className="form-grid">
                  <Input
                    label="Driving licence number *"
                    value={rider.drivingLicence}
                    error={errors.drivingLicence}
                    onChange={(e) => setRiderField("drivingLicence", e.target.value)}
                  />
                  <Input
                    label="Licence valid until"
                    type="date"
                    value={rider.licenceValidUntil}
                    error={errors.licenceValidUntil}
                    onChange={(e) => setRiderField("licenceValidUntil", e.target.value)}
                  />
                </div>
                {RIDER_DOCUMENTS.slice(0, 3).map(([kind, label]) => (
                  <label className="field" key={kind}>
                    <span>{label}</span>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        const issue = fileProblem(file)
                        if (issue) setErrors((current) => ({ ...current, [kind]: issue }))
                        else {
                          setRider((current) => ({
                            ...current,
                            files: { ...current.files, [kind]: file },
                          }))
                          setErrors((current) => {
                            const next = { ...current }
                            delete next[kind]
                            return next
                          })
                        }
                      }}
                    />
                    {rider.files[kind] && <small>{rider.files[kind]?.name}</small>}
                    {errors[kind] && <em>{errors[kind]}</em>}
                  </label>
                ))}
              </>
            )}
            {riderStep === 2 && (
              <>
                <h3>Vehicle information</h3>
                <div className="form-grid">
                  <Select
                    label="Vehicle type *"
                    value={rider.vehicleType}
                    onChange={(value) => setRiderField("vehicleType", value)}
                  >
                    {VEHICLE_TYPES.map((type) => (
                      <option value={type} key={type}>
                        {vehicleLabel[type]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Registration number *"
                    value={rider.vehicleNumber}
                    error={errors.vehicleNumber}
                    onChange={(e) => setRiderField("vehicleNumber", e.target.value)}
                  />
                  <Input
                    label="Vehicle model"
                    value={rider.vehicleModel}
                    error={errors.vehicleModel}
                    onChange={(e) => setRiderField("vehicleModel", e.target.value)}
                  />
                </div>
                {RIDER_DOCUMENTS.slice(3).map(([kind, label]) => (
                  <label className="field" key={kind}>
                    <span>{label}</span>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        const issue = fileProblem(file)
                        if (issue) setErrors((current) => ({ ...current, [kind]: issue }))
                        else {
                          setRider((current) => ({
                            ...current,
                            files: { ...current.files, [kind]: file },
                          }))
                          setErrors((current) => {
                            const next = { ...current }
                            delete next[kind]
                            return next
                          })
                        }
                      }}
                    />
                    {rider.files[kind] && <small>{rider.files[kind]?.name}</small>}
                    {errors[kind] && <em>{errors[kind]}</em>}
                  </label>
                ))}
              </>
            )}
            {riderStep === 3 && (
              <>
                <h3>Payout details · Delivery boy</h3>
                <p>Only the last four account digits are stored in GoKart Admin.</p>
                <div className="form-grid">
                  <Input
                    label="Account holder name *"
                    value={rider.holderName}
                    error={errors.payout}
                    onChange={(e) => setRiderField("holderName", e.target.value)}
                  />
                  <Input
                    label="Bank name"
                    value={rider.bankName}
                    onChange={(e) => setRiderField("bankName", e.target.value)}
                  />
                  <Input
                    label="Account number *"
                    type="password"
                    inputMode="numeric"
                    value={rider.accountNumber}
                    error={errors.payout}
                    onChange={(e) => setRiderField("accountNumber", e.target.value)}
                  />
                  <Input
                    label="Confirm account number *"
                    type="password"
                    value={rider.confirmAccount}
                    error={errors.confirmAccount}
                    onChange={(e) => setRiderField("confirmAccount", e.target.value)}
                  />
                  <Input
                    label="IFSC code *"
                    value={rider.ifsc}
                    error={errors.payout}
                    onChange={(e) => setRiderField("ifsc", e.target.value.toUpperCase())}
                  />
                </div>
              </>
            )}
            {riderStep === 4 && (
              <>
                <h3>Review {rider.name || `delivery boy ${riders.length + 1}`}</h3>
                <div className="form-grid">
                  <p>
                    <b>Contact</b>
                    <br />
                    {rider.name} · {rider.phone}
                    <br />
                    {rider.email || "No email"}
                  </p>
                  <p>
                    <b>Area</b>
                    <br />
                    {rider.address}
                    <br />
                    {districtZones.find((zone) => zone.id === rider.zoneId)?.location}
                  </p>
                  <p>
                    <b>Identity</b>
                    <br />
                    {rider.drivingLicence}
                    <br />
                    {rider.files.photo_id?.name || "Photo ID not attached"}
                  </p>
                  <p>
                    <b>Vehicle</b>
                    <br />
                    {vehicleLabel[rider.vehicleType]} · {rider.vehicleNumber}
                    <br />
                    {rider.vehicleModel || "No model"}
                  </p>
                  <p>
                    <b>Payout account</b>
                    <br />
                    {rider.holderName} · •••• {rider.accountNumber.slice(-4)}
                    <br />
                    {rider.ifsc}
                  </p>
                </div>
              </>
            )}
          </>
        )}
        {page === 2 && (
          <>
            <h3>
              {form.name || "Delivery partner"} · {riders.length} delivery boys
            </h3>
            <p>The delivery partner and all rider applications will be created together.</p>
            <div className="form-grid">
              <p>
                <b>Company</b>
                <br />
                {form.companyName || form.name}
              </p>
              <p>
                <b>Contact</b>
                <br />
                {form.contactPerson} · {form.phone}
              </p>
              <p>
                <b>Businesses</b>
                <br />
                {businesses.map((item) => businessName[item]).join(", ")}
              </p>
              <p>
                <b>District</b>
                <br />
                {districts.find((district) => district.id === districtId)?.name}
              </p>
              <p>
                <b>Zones</b>
                <br />
                {districtZones
                  .filter((zone) => zoneIds.includes(zone.id))
                  .map((zone) => zone.location)
                  .join(", ")}
              </p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Delivery boy</th>
                    <th>Zone</th>
                    <th>Vehicle</th>
                    <th>Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {riders.map((entry, index) => (
                    <tr key={`${entry.phone}-${index}`}>
                      <td>
                        {entry.name}
                        <br />
                        <small>{entry.phone}</small>
                      </td>
                      <td>{districtZones.find((zone) => zone.id === entry.zoneId)?.location}</td>
                      <td>
                        {vehicleLabel[entry.vehicleType]} · {entry.vehicleNumber}
                      </td>
                      <td>•••• {entry.accountNumber.slice(-4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <footer>
          <Button
            onClick={
              page === 0
                ? close
                : () => {
                    if (page === 1 && riderStep > 0) setRiderStep((current) => current - 1)
                    else setPage((current) => Math.max(0, current - 1))
                  }
            }
          >
            {page === 0 ? "Cancel" : page === 1 && riderStep > 0 ? "Previous step" : "Back"}
          </Button>
          <span />
          {page === 0 && (
            <Button
              primary
              disabled={
                !form.name ||
                !form.contactPerson ||
                !districtId ||
                !businesses.length ||
                !zoneIds.length
              }
              onClick={() => setPage(1)}
            >
              Add delivery boys
            </Button>
          )}
          {page === 1 && riderStep < 4 && (
            <Button
              primary
              onClick={() => {
                if (!hasRiderDetails && riders.length) setPage(2)
                else if (validateRider(riderStep)) setRiderStep((current) => current + 1)
              }}
            >
              {riderStep === 0 && !hasRiderDetails && riders.length ? "Review fleet" : "Continue"}
            </Button>
          )}
          {page === 1 && riderStep === 4 && (
            <>
              {riders.length > 0 && <Button onClick={() => setPage(2)}>Review fleet</Button>}
              <Button primary onClick={addRider}>
                Add delivery boy
              </Button>
            </>
          )}
          {page === 2 && (
            <Button
              primary
              disabled={saving || !riders.length}
              onClick={() => {
                const parsed = CreateDeliveryFleetRequest.safeParse(request())
                if (!parsed.success) {
                  setErrors(
                    Object.fromEntries(
                      parsed.error.issues.map((issue) => [
                        String(issue.path.at(-1)),
                        issue.message,
                      ]),
                    ),
                  )
                  setPage(1)
                  return
                }
                submit(parsed.data, allUploads)
              }}
            >
              {saving ? "Creating fleet and riders…" : "Create fleet and submit riders"}
            </Button>
          )}
        </footer>
      </div>
    </Modal>
  )
}

function FleetProfileEditor({
  fleet,
  saving,
  close,
  submit,
}: {
  fleet: DeliveryFleet
  saving: boolean
  close: () => void
  submit: (body: UpdateDeliveryFleetRequest) => void
}) {
  const [form, setForm] = useState({
    name: fleet.name,
    companyName: fleet.companyName ?? "",
    contactPerson: fleet.contactPerson,
    phone: fleet.phone,
    email: fleet.email ?? "",
    address: fleet.address,
  })
  const [businesses, setBusinesses] = useState<Business[]>(fleet.businesses)
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = () => {
    const parsed = UpdateDeliveryFleetRequest.safeParse({
      ...form,
      companyName: form.companyName || null,
      email: form.email || null,
      status: fleet.status === "suspended" ? "suspended" : "active",
      businesses,
      reason: reason.trim(),
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path.at(-1)), issue.message]),
        ),
      )
      return
    }
    submit(parsed.data)
  }
  return (
    <Modal title="Edit delivery partner" subtitle={fleet.code} close={close} wide>
      <div className="modal-body">
        <div className="form-grid">
          <Input
            label="Partner name *"
            value={form.name}
            error={errors.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <Input
            label="Company name"
            value={form.companyName}
            error={errors.companyName}
            onChange={(event) => setForm({ ...form, companyName: event.target.value })}
          />
          <Input
            label="Contact person *"
            value={form.contactPerson}
            error={errors.contactPerson}
            onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
          />
          <Input
            label="Phone *"
            value={form.phone}
            error={errors.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            error={errors.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <Input
            label="Address *"
            value={form.address}
            error={errors.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />
        </div>
        <fieldset className="form-field">
          <legend>Businesses served *</legend>
          {(["food", "mart"] as const).map((business) => (
            <label key={business} className="check-row">
              <input
                type="checkbox"
                checked={businesses.includes(business)}
                onChange={(event) =>
                  setBusinesses((current) =>
                    event.target.checked
                      ? [...current, business]
                      : current.filter((entry) => entry !== business),
                  )
                }
              />
              {businessName[business]}
            </label>
          ))}
          {errors.businesses && <em>{errors.businesses}</em>}
        </fieldset>
        <Input
          label="Reason for editing *"
          value={reason}
          maxLength={500}
          error={errors.reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <footer>
          <Button onClick={close}>Cancel</Button>
          <Button primary disabled={saving} onClick={save}>
            Save changes
          </Button>
        </footer>
      </div>
    </Modal>
  )
}

function ZoneAssignment({
  fleet,
  zones,
  saving,
  close,
  submit,
}: {
  fleet: DeliveryFleet
  zones: NonNullable<ReturnType<typeof useManagedZones>["data"]>
  saving: boolean
  close: () => void
  submit: (zoneId: string, replaceCurrent: boolean, reason: string) => void
}) {
  const [zoneId, setZoneId] = useState("")
  const [replaceCurrent, setReplaceCurrent] = useState(false)
  const [reason, setReason] = useState("")
  const candidates = zones.filter((zone) => zone.districtId === fleet.districtId)
  return (
    <Modal
      title="Manage partner zones"
      subtitle={`${fleet.name} · ${fleet.district}`}
      close={close}
    >
      <div className="modal-body">
        <Select label="Zone" value={zoneId} onChange={setZoneId}>
          <option value="">Choose a zone</option>
          {candidates.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.location}, {zone.city}
            </option>
          ))}
        </Select>
        <label className="check-row">
          <input
            type="checkbox"
            checked={replaceCurrent}
            onChange={(event) => setReplaceCurrent(event.target.checked)}
          />
          Replace the zone’s current primary partner
        </label>
        <Input
          label="Reason for this change *"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
        <p>
          Reassignment keeps the previous partner’s zone history and does not change existing
          deliveries.
        </p>
        <footer>
          <Button onClick={close}>Cancel</Button>
          <Button
            primary
            disabled={!zoneId || reason.trim().length < 3 || saving}
            onClick={() => submit(zoneId, replaceCurrent, reason.trim())}
          >
            Assign zone
          </Button>
        </footer>
      </div>
    </Modal>
  )
}

function RiderApplications() {
  const me = useMe()
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")
  const [districtId, setDistrictId] = useState("")
  const [zoneId, setZoneId] = useState("")
  const [fleetId, setFleetId] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const districts = useManagedDistricts()
  const zones = useManagedZones()
  const fleets = useDeliveryFleets({ page: 1, pageSize: 100 })
  const list = useDeliveryBoys({
    status: (status || undefined) as DeliveryBoyStatus | undefined,
    districtId: districtId || undefined,
    zoneId: zoneId || undefined,
    fleetId: fleetId || undefined,
    search: search.trim() || undefined,
    page: 1,
    pageSize: 100,
  })
  const filteredZones = (zones.data ?? []).filter(
    (zone) => zone.active && (!districtId || zone.districtId === districtId),
  )
  const filteredFleets = (fleets.data?.items ?? []).filter(
    (fleet) =>
      fleet.status === "active" &&
      (!districtId || fleet.districtId === districtId) &&
      (!zoneId || fleet.zones.some((zone) => zone.id === zoneId)),
  )
  const selected = list.data?.items.find((boy) => boy.id === selectedId) ?? null
  return (
    <>
      <section className="panel table-panel">
        <div className="filters">
          <Input
            icon={Search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search rider, application or phone…"
            aria-label="Search rider applications"
          />
          <Select label="Approval status" value={status} onChange={setStatus}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            label="District"
            value={districtId}
            onChange={(value) => {
              setDistrictId(value)
              setZoneId("")
              setFleetId("")
            }}
          >
            <option value="">All districts</option>
            {(districts.data ?? []).map((district) => (
              <option key={district.id} value={district.id}>
                {district.name}
              </option>
            ))}
          </Select>
          <Select
            label="Zone"
            value={zoneId}
            onChange={(value) => {
              setZoneId(value)
              setFleetId("")
            }}
          >
            <option value="">All zones</option>
            {filteredZones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.location}, {zone.city}
              </option>
            ))}
          </Select>
          <Select label="Delivery partner" value={fleetId} onChange={setFleetId}>
            <option value="">All partners</option>
            {filteredFleets.map((fleet) => (
              <option key={fleet.id} value={fleet.id}>
                {fleet.name}
              </option>
            ))}
          </Select>
        </div>
        {list.isError ? (
          <div className="modal-body">
            <ErrorBox icon={AlertTriangle}>{errorText(list.error)}</ErrorBox>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Partner</th>
                  <th>District / zone</th>
                  <th>Documents</th>
                  <th>Approval</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((boy) => (
                  <tr key={boy.id}>
                    <td>
                      <span className="stack">
                        <strong>{boy.name}</strong>
                        <small>
                          {boy.code} · {boy.phone}
                        </small>
                      </span>
                    </td>
                    <td>{boy.fleetName}</td>
                    <td>
                      {boy.district} / {boy.zoneName}
                    </td>
                    <td>
                      {boy.documents.filter((document) => document.verified).length} /{" "}
                      {DeliveryBoyDocumentKind.options.length} verified
                    </td>
                    <td>
                      <Badge tone={statusTone(boy.status)}>{STATUS_LABEL[boy.status]}</Badge>
                    </td>
                    <td>
                      <Button onClick={() => setSelectedId(boy.id)}>Review</Button>
                    </td>
                  </tr>
                ))}
                {list.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6}>No rider applications match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <RiderReview
          key={`${selected.id}-${selected.version}`}
          boy={selected}
          role={me.data?.role}
          close={() => setSelectedId(null)}
        />
      )}
    </>
  )
}

function RiderReview({
  boy,
  role,
  close,
}: {
  boy: DeliveryBoy
  role: string | undefined
  close: () => void
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const review = useReviewDeliveryBoy()
  const verify = useVerifyBoyDocument()
  const superAdmin = role === "super_admin"
  const requiredKinds = ["photo_id", "driving_licence", "vehicle_registration"] as const
  const requiredVerified = requiredKinds.every((kind) =>
    boy.documents.some((document) => document.kind === kind && document.verified),
  )

  const decide = async (
    decision: "forwarded" | "corrections_requested" | "rejected" | "approved",
  ) => {
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
      setError(errorText(cause))
    }
  }

  const verifyDocument = (documentId: string, verified: boolean) => {
    if (reason.trim().length < 3) {
      setError("Enter a reason for each document decision. It is saved to the history.")
      return
    }
    verify.mutate(
      { id: boy.id, docId: documentId, verified, reason: reason.trim() },
      { onError: (cause) => setError(errorText(cause)) },
    )
  }

  return (
    <Modal
      title={`${boy.name} · ${boy.code}`}
      subtitle={`${boy.fleetName} · ${boy.district} / ${boy.zoneName}`}
      close={close}
      wide
    >
      <div className="modal-body">
        <div className="form-grid">
          <p>
            <b>Phone</b>
            <br />
            {boy.phone}
          </p>
          <p>
            <b>Email</b>
            <br />
            {boy.email || "Not provided"}
          </p>
          <p>
            <b>Address</b>
            <br />
            {boy.address}
          </p>
          <p>
            <b>Date of birth / gender</b>
            <br />
            {boy.dateOfBirth ?? "Not provided"} · {boy.gender ?? "Not provided"}
          </p>
          <p>
            <b>PIN code</b>
            <br />
            {boy.pinCode ?? "Not provided"}
          </p>
          <p>
            <b>Driving licence</b>
            <br />
            {boy.drivingLicence ?? "Not provided"} · valid until{" "}
            {boy.licenceValidUntil ?? "Not provided"}
          </p>
          <p>
            <b>Vehicle</b>
            <br />
            {vehicleLabel[boy.vehicleType]} · {boy.vehicleNumber} ·{" "}
            {boy.vehicleModel ?? "Model not provided"}
          </p>
          <p>
            <b>Payout account</b>
            <br />
            {boy.payout
              ? `${boy.payout.holderName} · ${boy.payout.bankName ?? "Bank"} · •••• ${boy.payout.last4} · ${boy.payout.ifsc}`
              : "Not provided"}
          </p>
          <p>
            <b>Responsible Admin</b>
            <br />
            {boy.reviewAdminName || "Not assigned"}
          </p>
          <p>
            <b>Status</b>
            <br />
            <Badge tone={statusTone(boy.status)}>{STATUS_LABEL[boy.status]}</Badge>
          </p>
        </div>
        <section>
          <h3>Required documents</h3>
          {boy.documents.map((document) => (
            <div className="document-row" key={document.id}>
              <span>
                <b>
                  {RIDER_DOCUMENTS.find(([kind]) => kind === document.kind)?.[1] ?? document.kind}
                </b>
                <small>{document.fileName}</small>
              </span>
              <Badge tone={document.verified ? "success" : "warning"}>
                {document.verified ? "Verified" : "Needs verification"}
              </Badge>
              <Button
                onClick={() =>
                  window.open(
                    `/api/v1/delivery/boys/${boy.id}/documents/${document.id}/file`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                View
              </Button>
              <Button
                icon={ShieldCheck}
                disabled={verify.isPending}
                onClick={() => verifyDocument(document.id, !document.verified)}
              >
                {document.verified ? "Unverify" : "Verify"}
              </Button>
            </div>
          ))}
        </section>
        {boy.reviews.length > 0 && (
          <section>
            <h3>Review history</h3>
            {boy.reviews.map((entry) => (
              <p key={entry.id}>
                <b>{entry.actorName}</b> · {entry.from.replaceAll("_", " ")} →{" "}
                {entry.to.replaceAll("_", " ")}
                {entry.reason && <> · {entry.reason}</>}
              </p>
            ))}
          </section>
        )}
        <section>
          <h3>Approval timeline</h3>
          <BoyTimeline boyId={boy.id} />
        </section>
        {((superAdmin && boy.status === "pending_super") ||
          (!superAdmin && boy.status === "pending_admin")) && (
          <>
            <Input
              label="Reason * (saved with every decision and document change)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
            {error && <ErrorBox icon={AlertTriangle}>{error}</ErrorBox>}
            <footer>
              <Button onClick={() => void decide("corrections_requested")}>
                Request corrections
              </Button>
              <Button danger onClick={() => void decide("rejected")}>
                Reject
              </Button>
              {superAdmin ? (
                <Button
                  primary
                  disabled={!requiredVerified}
                  onClick={() => void decide("approved")}
                >
                  {requiredVerified ? "Approve rider" : "Verify all required documents"}
                </Button>
              ) : (
                <Button
                  primary
                  disabled={!requiredVerified}
                  onClick={() => void decide("forwarded")}
                >
                  {requiredVerified ? "Forward to Super Admin" : "Verify all required documents"}
                </Button>
              )}
            </footer>
          </>
        )}
        {review.isPending && <p>Saving review…</p>}
      </div>
    </Modal>
  )
}
