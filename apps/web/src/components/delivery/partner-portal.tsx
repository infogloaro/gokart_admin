"use client"

import { ApiError } from "@zoauro/api-client"
import {
  DeliveryBoyApplicationRequest,
  FleetDeliveryBoyOnboardingRequest,
  GENDERS,
  VEHICLE_TYPES,
  businessName,
  type DeliveryBoy,
  type DeliveryBoyOtpChallenge,
  type DeliveryFleet,
  type VehicleType,
  vehicleLabel,
} from "@zoauro/shared"
import { AlertTriangle, LogOut, Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import {
  correctFleetDeliveryBoy,
  getFleetPartnerBoys,
  getFleetPartnerProfile,
  requestDeliveryBoyOtp,
  submitFleetDeliveryBoy,
  uploadDeliveryBoyDocument,
} from "@/lib/delivery"
import { fileProblem } from "@/lib/documents"
import { Badge, Button, ErrorBox, Input, Modal, Select } from "@/components/super/ui"

const DOCUMENTS = [
  { kind: "photo_id", label: "Photo ID / Aadhaar", required: true },
  { kind: "driving_licence", label: "Driving licence", required: true },
  { kind: "vehicle_registration", label: "Vehicle registration", required: true },
  { kind: "profile_photo", label: "Profile photo", required: false },
  { kind: "insurance", label: "Vehicle insurance", required: false },
] as const

type DocumentKind = (typeof DOCUMENTS)[number]["kind"]
type RiderForm = {
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
  ifsc: string
  reason: string
  files: Partial<Record<DocumentKind, File>>
}
type TextField = Exclude<keyof RiderForm, "files" | "vehicleType">

const emptyRider = (): RiderForm => ({
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
  ifsc: "",
  reason: "",
  files: {},
})

const statusLabel: Record<DeliveryBoy["status"], string> = {
  pending_admin: "Admin review",
  pending_super: "Super Admin review",
  corrections_requested: "Corrections requested",
  rejected: "Rejected",
  active: "Approved",
  suspended: "Suspended",
}

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "The request couldn't be completed."

function applicationPayload(form: RiderForm) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    ...(form.email.trim() && { email: form.email.trim() }),
    ...(form.dateOfBirth && { dateOfBirth: form.dateOfBirth }),
    ...(form.gender && { gender: form.gender }),
    address: form.address.trim(),
    ...(form.pinCode && { pinCode: form.pinCode.trim() }),
    zoneId: form.zoneId,
    drivingLicence: form.drivingLicence.trim(),
    ...(form.licenceValidUntil && { licenceValidUntil: form.licenceValidUntil }),
    vehicleType: form.vehicleType,
    vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
    ...(form.vehicleModel.trim() && { vehicleModel: form.vehicleModel.trim() }),
    ...(form.accountNumber && {
      payout: {
        holderName: form.holderName.trim(),
        ...(form.bankName.trim() && { bankName: form.bankName.trim() }),
        accountNumber: form.accountNumber,
        ifsc: form.ifsc.trim().toUpperCase(),
      },
    }),
  }
}

export function DeliveryPartnerPortal() {
  const [credentialInput, setCredentialInput] = useState("")
  const [credential, setCredential] = useState("")
  const [fleet, setFleet] = useState<DeliveryFleet | null>(null)
  const [boys, setBoys] = useState<DeliveryBoy[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<RiderForm>(emptyRider)
  const [editingBoy, setEditingBoy] = useState<DeliveryBoy | null>(null)
  const [step, setStep] = useState(0)
  const [challenge, setChallenge] = useState<DeliveryBoyOtpChallenge | null>(null)
  const [otp, setOtp] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const refreshBoys = async (token: string) => setBoys(await getFleetPartnerBoys(token))

  const connect = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError("")
    const token = credentialInput.trim()
    try {
      const partner = await getFleetPartnerProfile(token)
      const applications = await getFleetPartnerBoys(token)
      setCredential(token)
      setFleet(partner)
      setBoys(applications)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }

  const disconnect = () => {
    setCredential("")
    setCredentialInput("")
    setFleet(null)
    setBoys([])
    setError("")
    setNotice("")
  }

  const openNew = () => {
    setForm({ ...emptyRider(), zoneId: fleet?.zones[0]?.id ?? "" })
    setEditingBoy(null)
    setChallenge(null)
    setOtp("")
    setFieldErrors({})
    setStep(0)
    setError("")
    setAdding(true)
  }

  const openCorrection = (boy: DeliveryBoy) => {
    setForm({
      ...emptyRider(),
      name: boy.name,
      phone: boy.phone,
      email: boy.email ?? "",
      dateOfBirth: boy.dateOfBirth ?? "",
      gender: boy.gender ?? "",
      address: boy.address,
      pinCode: boy.pinCode ?? "",
      zoneId: boy.zoneId,
      drivingLicence: boy.drivingLicence ?? "",
      licenceValidUntil: boy.licenceValidUntil ?? "",
      vehicleType: boy.vehicleType,
      vehicleNumber: boy.vehicleNumber,
      vehicleModel: boy.vehicleModel ?? "",
    })
    setEditingBoy(boy)
    setChallenge(null)
    setOtp("")
    setFieldErrors({})
    setStep(0)
    setError("")
    setAdding(true)
  }

  const uploadFiles = async (boyId: string) => {
    const failed: string[] = []
    for (const { kind } of DOCUMENTS) {
      const file = form.files[kind]
      if (!file) continue
      try {
        await uploadDeliveryBoyDocument(credential, boyId, kind, file)
      } catch (cause) {
        failed.push(`${kind}: ${errorText(cause)}`)
      }
    }
    await refreshBoys(credential)
    if (failed.length)
      setNotice(`Application submitted; some documents need retry: ${failed.join("; ")}`)
    else setNotice("Application submitted to the Admin review queue.")
  }

  const validateProfile = () => {
    const parsed = (
      editingBoy ? DeliveryBoyApplicationRequest : FleetDeliveryBoyOnboardingRequest
    ).safeParse(applicationPayload(form))
    const nextErrors: Record<string, string> = {}
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        nextErrors[String(issue.path[0] ?? "form")] ??= issue.message
    if (editingBoy && form.reason.trim().length < 3)
      nextErrors.reason = "Explain why the delivery boy profile is being edited."
    for (const document of DOCUMENTS.filter((entry) => entry.required)) {
      if (!editingBoy && !form.files[document.kind])
        nextErrors[document.kind] = `${document.label} is required.`
    }
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const sendOtp = async () => {
    setError("")
    if (!validateProfile()) return
    setLoading(true)
    try {
      const response = await requestDeliveryBoyOtp(credential, form.phone.trim())
      setChallenge(response)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    setError("")
    if (!validateProfile()) return
    setLoading(true)
    try {
      if (editingBoy) {
        const parsed = DeliveryBoyApplicationRequest.safeParse(applicationPayload(form))
        if (!parsed.success)
          return setError(parsed.error.issues[0]?.message ?? "Check rider details.")
        await correctFleetDeliveryBoy(credential, editingBoy.id, {
          ...parsed.data,
          reason: form.reason.trim(),
        })
        await uploadFiles(editingBoy.id)
      } else {
        if (!challenge) return setError("Verify the delivery boy's phone before submitting.")
        const parsed = FleetDeliveryBoyOnboardingRequest.safeParse(applicationPayload(form))
        if (!parsed.success)
          return setError(parsed.error.issues[0]?.message ?? "Check rider details.")
        const result = await submitFleetDeliveryBoy(credential, {
          ...parsed.data,
          otpChallengeId: challenge.challengeId,
          otp,
        })
        await uploadFiles(result.id)
      }
      setAdding(false)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="super-ui">
      <main className="content">
        <header className="page-head">
          <div>
            <div>Delivery partner portal</div>
            <p>Manage your delivery boys and follow their approval progress.</p>
          </div>
          {fleet && (
            <Button icon={LogOut} onClick={disconnect}>
              Sign out
            </Button>
          )}
        </header>
        {!fleet ? (
          <section className="panel modal-body" style={{ maxWidth: 520 }}>
            <h2>Secure partner access</h2>
            <p>Enter the one-time credential issued to your delivery partner account.</p>
            <form onSubmit={connect}>
              <Input
                label="Partner credential"
                type="password"
                autoComplete="current-password"
                value={credentialInput}
                onChange={(event) => setCredentialInput(event.target.value)}
              />
              {error && <ErrorBox icon={AlertTriangle}>{error}</ErrorBox>}
              <Button primary disabled={loading || !credentialInput.trim()}>
                {loading ? "Connecting…" : "Continue"}
              </Button>
            </form>
          </section>
        ) : (
          <>
            <section className="summary">
              <div>
                <i className="navy" />
                <span>
                  Delivery partner <b>{fleet.name}</b>
                </span>
              </div>
              <div>
                <i className="green" />
                <span>
                  Businesses <b>{fleet.businesses.map((item) => businessName[item]).join(", ")}</b>
                </span>
              </div>
              <div>
                <i className="navy" />
                <span>
                  District <b>{fleet.district}</b>
                </span>
              </div>
              <Button primary icon={Plus} onClick={openNew}>
                Add delivery boy
              </Button>
            </section>
            {notice && <p role="status">{notice}</p>}
            {error && <ErrorBox icon={AlertTriangle}>{error}</ErrorBox>}
            <section className="panel table-panel">
              <div className="table-wrap">
                <table className="partner-table">
                  <thead>
                    <tr>
                      <th>Delivery boy</th>
                      <th>Business → District → Zone</th>
                      <th>Documents</th>
                      <th>Review status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boys.map((boy) => (
                      <tr key={boy.id}>
                        <td>
                          <span className="stack">
                            <strong>{boy.name}</strong>
                            <small>
                              {boy.phone} · {boy.code}
                            </small>
                          </span>
                        </td>
                        <td>
                          {fleet.businesses.map((item) => businessName[item]).join(", ")} →{" "}
                          {fleet.district} → {boy.zoneName}
                        </td>
                        <td>{boy.documents.length} uploaded</td>
                        <td>
                          <Badge
                            tone={
                              boy.status === "active"
                                ? "success"
                                : boy.status === "rejected" || boy.status === "suspended"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {statusLabel[boy.status]}
                          </Badge>
                          {boy.reviews.at(-1)?.reason && (
                            <small>{boy.reviews.at(-1)?.reason}</small>
                          )}
                        </td>
                        <td>
                          {boy.status === "corrections_requested" && (
                            <Button onClick={() => openCorrection(boy)}>Edit & resubmit</Button>
                          )}
                          {DOCUMENTS.some(
                            ({ kind, required }) =>
                              required && !boy.documents.some((document) => document.kind === kind),
                          ) && (
                            <label className="field">
                              <span>Upload missing required document</span>
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png"
                                onChange={async (event) => {
                                  const file = event.target.files?.[0]
                                  const missing = DOCUMENTS.find(
                                    ({ kind, required }) =>
                                      required &&
                                      !boy.documents.some((document) => document.kind === kind),
                                  )
                                  if (!file || !missing) return
                                  const problem = fileProblem(file)
                                  if (problem) return setError(problem)
                                  try {
                                    await uploadDeliveryBoyDocument(
                                      credential,
                                      boy.id,
                                      missing.kind,
                                      file,
                                    )
                                    await refreshBoys(credential)
                                    setNotice(`${missing.label} uploaded for ${boy.name}.`)
                                  } catch (cause) {
                                    setError(errorText(cause))
                                  }
                                }}
                              />
                            </label>
                          )}
                        </td>
                      </tr>
                    ))}
                    {boys.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          No delivery boys yet. Add the first rider to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p>
                Admin reviews applications first. Forwarded applications move automatically to Super
                Admin for final approval.
              </p>
            </section>
          </>
        )}
      </main>
      {adding && fleet && (
        <RiderWizard
          form={form}
          setForm={setForm}
          fleet={fleet}
          step={step}
          setStep={setStep}
          challenge={challenge}
          otp={otp}
          setOtp={setOtp}
          errors={fieldErrors}
          error={error}
          editing={Boolean(editingBoy)}
          saving={loading}
          close={() => setAdding(false)}
          sendOtp={() => void sendOtp()}
          submit={() => void submit()}
          setErrors={setFieldErrors}
        />
      )}
    </div>
  )
}

function RiderWizard({
  form,
  setForm,
  fleet,
  step,
  setStep,
  challenge,
  otp,
  setOtp,
  errors,
  error,
  editing,
  saving,
  close,
  sendOtp,
  submit,
  setErrors,
}: {
  form: RiderForm
  setForm: (form: RiderForm) => void
  fleet: DeliveryFleet
  step: number
  setStep: (step: number) => void
  challenge: DeliveryBoyOtpChallenge | null
  otp: string
  setOtp: (value: string) => void
  errors: Record<string, string>
  error: string
  editing: boolean
  saving: boolean
  close: () => void
  sendOtp: () => void
  submit: () => void
  setErrors: (errors: Record<string, string>) => void
}) {
  const update = (key: TextField, value: string) => setForm({ ...form, [key]: value })
  const steps = ["Personal", "Identity", "Vehicle", "Payout", "Review"]
  const label = (key: TextField, name: string, value: string, type = "text") => (
    <Input
      label={name}
      type={type}
      value={value}
      error={errors[key]}
      onChange={(event) => update(key, event.target.value)}
    />
  )
  const documentInputs = (kinds: readonly DocumentKind[]) =>
    kinds.map((kind) => (
      <label className="field" key={kind}>
        <span>
          {DOCUMENTS.find((document) => document.kind === kind)?.label}
          {DOCUMENTS.find((document) => document.kind === kind)?.required && !editing ? " *" : ""}
        </span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            const problem = fileProblem(file)
            if (problem) {
              setErrors({ ...errors, [kind]: problem })
              return
            }
            setForm({ ...form, files: { ...form.files, [kind]: file } })
            const nextErrors = { ...errors }
            delete nextErrors[kind]
            setErrors(nextErrors)
          }}
        />
        {form.files[kind] && <small>{form.files[kind]?.name}</small>}
        {errors[kind] && <em>{errors[kind]}</em>}
      </label>
    ))

  return (
    <Modal
      title={editing ? "Correct delivery boy details" : "Add delivery boy"}
      subtitle={`${fleet.name} · ${fleet.district} · Step ${step + 1} of ${steps.length}`}
      close={close}
      wide
    >
      <div className="modal-body">
        <div className="tabs" role="tablist" aria-label="Delivery boy onboarding steps">
          {steps.map((item, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={step === index}
              className={step === index ? "active" : ""}
              key={item}
              onClick={() => index < step && setStep(index)}
            >
              {item}
            </button>
          ))}
        </div>
        {Object.keys(errors).length > 0 && (
          <ErrorBox icon={AlertTriangle}>{Object.values(errors).join(" ")}</ErrorBox>
        )}
        {step === 0 && (
          <>
            <div className="form-grid">
              {label("name", "Full name *", form.name)}
              {label("phone", "Phone *", form.phone, "tel")}
              {label("email", "Email", form.email, "email")}
              {label("dateOfBirth", "Date of birth", form.dateOfBirth, "date")}
              {label("pinCode", "PIN code", form.pinCode)}
              <Select
                label="Gender"
                value={form.gender}
                onChange={(value) => update("gender", value)}
              >
                <option value="">Not specified</option>
                {GENDERS.map((gender) => (
                  <option key={gender}>{gender}</option>
                ))}
              </Select>
              {label("address", "Address *", form.address)}
              <Select
                label="Service zone *"
                value={form.zoneId}
                onChange={(value) => update("zoneId", value)}
              >
                <option value="">Choose zone</option>
                {fleet.zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </Select>
            </div>
            {!editing && documentInputs(["photo_id", "profile_photo"])}
          </>
        )}
        {step === 1 && (
          <>
            <div className="form-grid">
              {label("drivingLicence", "Driving licence *", form.drivingLicence)}
              {label("licenceValidUntil", "Licence expiry", form.licenceValidUntil, "date")}
            </div>
            {documentInputs(["driving_licence"])}
          </>
        )}
        {step === 2 && (
          <>
            <div className="form-grid">
              <Select
                label="Vehicle type *"
                value={form.vehicleType}
                onChange={(value) => {
                  const vehicleType = VEHICLE_TYPES.find((type) => type === value)
                  if (vehicleType) setForm({ ...form, vehicleType })
                }}
              >
                {VEHICLE_TYPES.map((type) => (
                  <option value={type} key={type}>
                    {vehicleLabel[type]}
                  </option>
                ))}
              </Select>
              {label("vehicleNumber", "Vehicle number *", form.vehicleNumber)}
              {label("vehicleModel", "Vehicle model", form.vehicleModel)}
            </div>
            {documentInputs(["vehicle_registration", "insurance"])}
          </>
        )}
        {step === 3 && (
          <>
            <p>
              Full account numbers are never retained; the payout profile stores only the last four
              digits.
            </p>
            <div className="form-grid">
              {label("holderName", "Account holder *", form.holderName)}
              {label("bankName", "Bank name", form.bankName)}
              {label("accountNumber", "Account number *", form.accountNumber, "password")}
              {label("ifsc", "IFSC *", form.ifsc)}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <div className="form-grid">
              <p>
                <b>Delivery boy</b>
                <br />
                {form.name} · {form.phone}
              </p>
              <p>
                <b>Business and area</b>
                <br />
                {fleet.businesses.map((item) => businessName[item]).join(", ")} → {fleet.district} →{" "}
                {fleet.zones.find((zone) => zone.id === form.zoneId)?.name}
              </p>
              <p>
                <b>Identity</b>
                <br />
                {form.drivingLicence}
                <br />
                {form.files.photo_id?.name ?? "Photo ID selected in previous step"}
              </p>
              <p>
                <b>Vehicle</b>
                <br />
                {vehicleLabel[form.vehicleType]} · {form.vehicleNumber} · {form.vehicleModel}
              </p>
              {form.accountNumber && (
                <p>
                  <b>Payout</b>
                  <br />
                  {form.holderName} · •••• {form.accountNumber.slice(-4)} · {form.ifsc}
                </p>
              )}
            </div>
            {editing && label("reason", "Reason *", form.reason)}
            {!editing && !challenge && (
              <Button primary onClick={sendOtp}>
                Verify phone with OTP
              </Button>
            )}
            {!editing && challenge && (
              <>
                <p role="status">Code sent to {challenge.destination}. Expires in 10 minutes.</p>
                <Input
                  label="6-digit phone verification code *"
                  inputMode="numeric"
                  value={otp}
                  maxLength={6}
                  error={errors.otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </>
            )}
          </>
        )}
        {error && <ErrorBox icon={AlertTriangle}>{error}</ErrorBox>}
        <footer>
          <Button onClick={step ? () => setStep(step - 1) : close}>
            {step ? "Previous" : "Cancel"}
          </Button>
          <span />
          {step < 4 ? (
            <Button primary onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : editing ? (
            <Button primary disabled={saving} onClick={submit}>
              Submit corrections
            </Button>
          ) : challenge ? (
            <Button primary disabled={saving || otp.length !== 6} onClick={submit}>
              Submit for Admin review
            </Button>
          ) : null}
        </footer>
      </div>
    </Modal>
  )
}
