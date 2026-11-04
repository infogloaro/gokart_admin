"use client"

import { ApiError } from "@zoauro/api-client"
import {
  SURGE_KINDS,
  SURGE_KIND_LABEL,
  SurgeRuleInput,
  businessName,
  formatINR,
  type ManagedZone,
  type SurgeKind,
  type SurgePreview,
  type SurgeRule,
} from "@zoauro/shared"
import { Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Badge, Button, Input, Modal, Panel, Select } from "./ui"
import {
  useDeleteSurgeRule,
  useSaveSurgeRule,
  useSetSurgeActive,
  useSurgePreview,
  useSurgeRules,
} from "@/lib/system"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type Draft = {
  name: string
  kind: SurgeKind
  business: "" | "food" | "mart"
  zoneId: string
  multiplier: string
  maxExtra: string
  start: string
  end: string
  days: number[]
  startsOn: string
  endsOn: string
  active: boolean
}

/** Starting values per kind, so an operator only adjusts instead of filling a blank form. */
const PRESETS: Record<SurgeKind, Partial<Draft>> = {
  peak: { name: "Dinner rush", multiplier: "1.25", start: "19:00", end: "22:00" },
  night: { name: "Late night", multiplier: "1.3", start: "22:00", end: "06:00" },
  rain: { name: "Rain surge", multiplier: "1.4", start: "", end: "" },
  festival: { name: "Festival days", multiplier: "1.5", start: "", end: "" },
  custom: { name: "", multiplier: "1.2", start: "", end: "" },
}

const blank = (kind: SurgeKind = "peak"): Draft => ({
  name: "",
  kind,
  business: "",
  zoneId: "",
  multiplier: "1.25",
  maxExtra: "",
  start: "",
  end: "",
  days: [],
  startsOn: "",
  endsOn: "",
  active: true,
  ...PRESETS[kind],
})

const toTime = (minute: number | null) =>
  minute === null
    ? ""
    : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
const toMinute = (time: string) => {
  if (!time) return null
  const [h, m] = time.split(":").map(Number)
  return h! * 60 + m!
}
const localNow = () => {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  return date.toISOString().slice(0, 16)
}
const message = (error: unknown) =>
  error instanceof ApiError ? error.message : "The request failed. Please try again."

const draftOf = (rule: SurgeRule): Draft => ({
  name: rule.name,
  kind: rule.kind,
  business: rule.business ?? "",
  zoneId: rule.zoneId ?? "",
  multiplier: String(rule.multiplierPercent / 100),
  maxExtra: rule.maxExtraPaise === null ? "" : String(rule.maxExtraPaise / 100),
  start: toTime(rule.startMinute),
  end: toTime(rule.endMinute),
  days: rule.days,
  startsOn: rule.startsOn ?? "",
  endsOn: rule.endsOn ?? "",
  active: rule.active,
})

function bodyOf(draft: Draft) {
  const maxExtra = draft.maxExtra.trim() ? Math.round(Number(draft.maxExtra) * 100) : null
  return {
    name: draft.name,
    kind: draft.kind,
    business: draft.business || null,
    zoneId: draft.zoneId || null,
    multiplierPercent: Math.round(Number(draft.multiplier) * 100),
    maxExtraPaise: maxExtra,
    startMinute: toMinute(draft.start),
    endMinute: toMinute(draft.end),
    days: draft.days,
    startsOn: draft.startsOn || null,
    endsOn: draft.endsOn || null,
  }
}

function whenText(rule: SurgeRule) {
  const parts: string[] = []
  if (rule.startMinute !== null && rule.endMinute !== null)
    parts.push(`${toTime(rule.startMinute)}–${toTime(rule.endMinute)}`)
  if (rule.days.length) parts.push(rule.days.map((day) => DAYS[day]).join(", "))
  if (rule.startsOn && rule.endsOn)
    parts.push(rule.startsOn === rule.endsOn ? rule.startsOn : `${rule.startsOn} → ${rule.endsOn}`)
  return parts.length ? parts.join(" · ") : rule.kind === "rain" ? "Whenever switched on" : "Always"
}

export function SurgePricing({ zones }: { zones: ManagedZone[] }) {
  const rules = useSurgeRules()
  const save = useSaveSurgeRule()
  const setActive = useSetSurgeActive()
  const remove = useDeleteSurgeRule()
  const preview = useSurgePreview()
  const [editing, setEditing] = useState<SurgeRule | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState("")
  const [listError, setListError] = useState("")
  const [distance, setDistance] = useState("5")
  const [cart, setCart] = useState("300")
  const [at, setAt] = useState(localNow)
  const [previewBusiness, setPreviewBusiness] = useState<"food" | "mart">("food")
  const [result, setResult] = useState<SurgePreview | null>(null)

  const open = (rule?: SurgeRule) => {
    setEditing(rule ?? null)
    setDraft(rule ? draftOf(rule) : blank())
    setError("")
    setResult(null)
    setAt(localNow())
  }
  const close = () => {
    setDraft(null)
    setEditing(null)
    setError("")
    setResult(null)
    save.reset()
    preview.reset()
  }
  const patch = (changes: Partial<Draft>) => draft && setDraft({ ...draft, ...changes })

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    const body = { ...bodyOf(draft), active: draft.active }
    const parsed = SurgeRuleInput.safeParse(body)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form.")
    setError("")
    try {
      await save.mutateAsync({ id: editing?.id ?? null, body })
      close()
    } catch (caught) {
      setError(message(caught))
    }
  }

  const runPreview = async () => {
    if (!draft) return
    const parsed = SurgeRuleInput.safeParse(bodyOf(draft))
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form.")
    const km = Number(distance)
    const cartRupees = Number(cart)
    if (!Number.isFinite(km) || km < 0 || !Number.isFinite(cartRupees) || cartRupees < 0)
      return setError("Enter a valid distance and cart value.")
    setError("")
    try {
      setResult(
        await preview.mutateAsync({
          business: draft.business || previewBusiness,
          zoneId: draft.zoneId || null,
          distanceKm: km,
          cartPaise: Math.round(cartRupees * 100),
          at: new Date(at).toISOString(),
          draft: parsed.data,
        }),
      )
    } catch (caught) {
      setResult(null)
      setError(message(caught))
    }
  }

  const toggle = async (rule: SurgeRule) => {
    setListError("")
    try {
      await setActive.mutateAsync({ id: rule.id, active: !rule.active })
    } catch (caught) {
      setListError(message(caught))
    }
  }
  const destroy = async (rule: SurgeRule) => {
    if (!window.confirm(`Delete the surge rule “${rule.name}”? This cannot be undone.`)) return
    setListError("")
    try {
      await remove.mutateAsync(rule.id)
    } catch (caught) {
      setListError(message(caught))
    }
  }

  return (
    <>
      <Panel
        title="Surge pricing"
        subtitle="Scheduled multipliers on the delivery fee for peak hours, nights, rain and festivals. Only the strongest matching rule is charged. Times are IST."
      >
        <div className="sys-toolbar">
          <Button primary icon={Plus} onClick={() => open()}>
            Add surge rule
          </Button>
        </div>
        {listError && (
          <p className="sys-state error" role="alert">
            {listError}
          </p>
        )}
        {rules.isError ? (
          <p className="sys-state error" role="alert">
            Could not load surge rules. {rules.error.message}
          </p>
        ) : rules.isPending ? (
          <p className="sys-state">Loading surge rules…</p>
        ) : rules.data.length ? (
          <div className="sys-table-scroll">
            <table className="sys-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Applies to</th>
                  <th>When</th>
                  <th>Multiplier</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.data.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.name}</strong>
                      <small>{SURGE_KIND_LABEL[rule.kind]}</small>
                    </td>
                    <td>
                      {rule.business ? businessName[rule.business] : "Both businesses"}
                      <small>{rule.zoneName ?? "All zones"}</small>
                    </td>
                    <td>{whenText(rule)}</td>
                    <td>
                      ×{rule.multiplierPercent / 100}
                      {rule.maxExtraPaise !== null && (
                        <small>Extra up to {formatINR(rule.maxExtraPaise)}</small>
                      )}
                    </td>
                    <td>
                      <Badge tone={rule.active ? "success" : "neutral"}>
                        {rule.active ? "On" : "Off"}
                      </Badge>
                    </td>
                    <td>
                      <Button disabled={setActive.isPending} onClick={() => void toggle(rule)}>
                        {rule.active ? "Turn off" : "Turn on"}
                      </Button>{" "}
                      <Button onClick={() => open(rule)}>Edit</Button>{" "}
                      <Button onClick={() => void destroy(rule)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sys-state">
            No surge rules yet. Add one for peak hours, or a Rain rule you can switch on when it
            pours.
          </p>
        )}
      </Panel>

      {draft && (
        <Modal
          title={editing ? "Edit surge rule" : "Add surge rule"}
          subtitle="Preview the price before saving. Orders do not use fee rules yet, so this does not change what customers pay."
          close={close}
        >
          <form className="sys-editor" onSubmit={(event) => void submit(event)}>
            <div className="sys-form-grid">
              <Select
                label="Type"
                value={draft.kind}
                onChange={(value) => {
                  const kind = value as SurgeKind
                  setDraft({ ...blank(kind), business: draft.business, zoneId: draft.zoneId })
                }}
              >
                {SURGE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SURGE_KIND_LABEL[kind]}
                  </option>
                ))}
              </Select>
              <Input
                label="Name"
                required
                minLength={2}
                maxLength={80}
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
              <Select
                label="Business"
                value={draft.business}
                onChange={(value) => patch({ business: value as Draft["business"] })}
              >
                <option value="">Both businesses</option>
                <option value="food">{businessName["food"]}</option>
                <option value="mart">{businessName["mart"]}</option>
              </Select>
              <Select
                label="Zone"
                value={draft.zoneId}
                onChange={(value) => patch({ zoneId: value })}
              >
                <option value="">All zones</option>
                {zones
                  .filter((zone) => zone.active)
                  .map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.location}, {zone.city}
                    </option>
                  ))}
              </Select>
              <Input
                label="Multiplier (1.25 = 25% more)"
                type="number"
                step="0.05"
                min="1.01"
                max="5"
                required
                value={draft.multiplier}
                onChange={(event) => patch({ multiplier: event.target.value })}
              />
              <Input
                label="Max extra charge, ₹ (optional)"
                type="number"
                step="1"
                min="1"
                value={draft.maxExtra}
                onChange={(event) => patch({ maxExtra: event.target.value })}
              />
              <Input
                label={`From (IST)${draft.kind === "peak" || draft.kind === "night" ? " *" : ""}`}
                type="time"
                value={draft.start}
                onChange={(event) => patch({ start: event.target.value })}
              />
              <Input
                label="Until (IST)"
                type="time"
                value={draft.end}
                onChange={(event) => patch({ end: event.target.value })}
              />
              <Input
                label={`First date${draft.kind === "festival" ? " *" : ""}`}
                type="date"
                value={draft.startsOn}
                onChange={(event) => patch({ startsOn: event.target.value })}
              />
              <Input
                label="Last date"
                type="date"
                value={draft.endsOn}
                onChange={(event) => patch({ endsOn: event.target.value })}
              />
            </div>
            <fieldset className="sys-field">
              <span>Days (none selected = every day)</span>
              <div className="sys-toolbar">
                {DAYS.map((label, day) => (
                  <label key={label}>
                    <input
                      type="checkbox"
                      checked={draft.days.includes(day)}
                      onChange={(event) =>
                        patch({
                          days: event.target.checked
                            ? [...draft.days, day].sort()
                            : draft.days.filter((value) => value !== day),
                        })
                      }
                    />{" "}
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => patch({ active: event.target.checked })}
              />{" "}
              Rule is on
            </label>

            <div className="sys-editor">
              <strong>Preview the price</strong>
              <div className="sys-form-grid">
                {!draft.business && (
                  <Select
                    label="Business"
                    value={previewBusiness}
                    onChange={(value) => setPreviewBusiness(value as "food" | "mart")}
                  >
                    <option value="food">{businessName["food"]}</option>
                    <option value="mart">{businessName["mart"]}</option>
                  </Select>
                )}
                <Input
                  label="Distance (km)"
                  type="number"
                  step="0.1"
                  min="0"
                  value={distance}
                  onChange={(event) => setDistance(event.target.value)}
                />
                <Input
                  label="Cart value (₹)"
                  type="number"
                  step="1"
                  min="0"
                  value={cart}
                  onChange={(event) => setCart(event.target.value)}
                />
                <Input
                  label="Delivery time (IST)"
                  type="datetime-local"
                  value={at}
                  onChange={(event) => setAt(event.target.value)}
                />
              </div>
              <Button disabled={preview.isPending} onClick={() => void runPreview()}>
                {preview.isPending ? "Pricing…" : "Preview price"}
              </Button>
              {result && <PreviewResult result={result} />}
            </div>

            {error && (
              <p className="sys-form-error" role="alert">
                {error}
              </p>
            )}
            <footer className="sys-editor-actions">
              <Button onClick={close}>Cancel</Button>
              <Button primary type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : editing ? "Save changes" : "Create rule"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  )
}

function PreviewResult({ result }: { result: SurgePreview }) {
  const { with: after, without: before, feeRule } = result
  const change = after.totalPaise - before.totalPaise
  return (
    <div className="sys-state">
      <p>
        Fee rule in effect: base {formatINR(feeRule?.baseFeePaise ?? 0)} +{" "}
        {formatINR(feeRule?.perKmPaise ?? 0)}
        /km
        {feeRule?.zoneName ? ` for ${feeRule.zoneName}` : " (platform-wide)"}
        {feeRule?.freeAbovePaise ? `, free above ${formatINR(feeRule.freeAbovePaise)}` : ""}.
      </p>
      <table className="sys-table">
        <tbody>
          <tr>
            <td>Base + distance</td>
            <td>{formatINR(after.subtotalPaise)}</td>
          </tr>
          <tr>
            <td>
              Surge{" "}
              {after.surgeName
                ? `(${after.surgeName}, ×${(after.multiplierPercent ?? 100) / 100})`
                : ""}
            </td>
            <td>{after.surgeName ? `+${formatINR(after.extraPaise)}` : "None applies"}</td>
          </tr>
          <tr>
            <td>
              <strong>Delivery fee</strong>
            </td>
            <td>
              <strong>{after.freeDelivery ? "Free" : formatINR(after.totalPaise)}</strong>
            </td>
          </tr>
          <tr>
            <td>Without this rule</td>
            <td>{before.freeDelivery ? "Free" : formatINR(before.totalPaise)}</td>
          </tr>
        </tbody>
      </table>
      {after.freeDelivery && (
        <p>The cart is above the free-delivery threshold, so no surge is charged.</p>
      )}
      {after.capped && <p>The extra charge was held at the maximum you set.</p>}
      {after.matched.length > 1 && (
        <p>Other matching rules, not stacked: {after.matched.slice(1).join(", ")}.</p>
      )}
      {!after.freeDelivery && (
        <p>
          {change > 0
            ? `This rule adds ${formatINR(change)}.`
            : "This rule would not change this price."}
        </p>
      )}
    </div>
  )
}
