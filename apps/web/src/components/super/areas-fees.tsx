"use client"

import { ApiError } from "@zoauro/api-client"
import { businessName, formatINR, type ManagedZone } from "@zoauro/shared"
import { CircleDollarSign, MapPinned, Plus, RefreshCw, Search, Settings2 } from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"
import { Button, Input, Modal, Panel, Select, Badge } from "./ui"
import { Count, HeadActions } from "./dashboard"
import { useRefreshToast } from "@/components/refresh-toast"
import {
  useCreateFeeRule,
  useCreateZone,
  useFeeRules,
  useManagedZones,
  useUpdateZone,
} from "@/lib/system"

const PAGE_SIZE = 10
type ZoneDraft = {
  district: string
  city: string
  location: string
  lat: string
  lng: string
  active: boolean
}
type FeeDraft = {
  business: "food" | "mart"
  zoneId: string
  baseFee: string
  perKm: string
  freeAbove: string
  effectiveFrom: string
}
const blankZone = (): ZoneDraft => ({
  district: "",
  city: "",
  location: "",
  lat: "",
  lng: "",
  active: true,
})
const localDateTime = () => {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  return date.toISOString().slice(0, 16)
}
const blankFee = (): FeeDraft => ({
  business: "food",
  zoneId: "",
  baseFee: "",
  perKm: "",
  freeAbove: "",
  effectiveFrom: localDateTime(),
})
const message = (error: unknown) =>
  error instanceof ApiError ? error.message : "The request failed. Please try again."
const toPaise = (value: string) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null
}
const rupees = (paise: number) => formatINR(paise)

export function AreasFees() {
  const runRefresh = useRefreshToast()
  const zones = useManagedZones()
  const createZone = useCreateZone()
  const updateZone = useUpdateZone()
  const [zoneSearch, setZoneSearch] = useState("")
  const [zoneStatus, setZoneStatus] = useState<"all" | "active" | "inactive">("all")
  const [zonePage, setZonePage] = useState(1)
  const [zoneEditor, setZoneEditor] = useState<ZoneDraft | null>(null)
  const [editingZone, setEditingZone] = useState<ManagedZone | null>(null)
  const [zoneError, setZoneError] = useState("")

  const [business, setBusiness] = useState<"" | "food" | "mart">("")
  const [feeZone, setFeeZone] = useState("")
  const [feePage, setFeePage] = useState(1)
  const feeQuery = useFeeRules({
    business: business || undefined,
    zoneId: feeZone || undefined,
    page: feePage,
    pageSize: PAGE_SIZE,
  })
  const createFee = useCreateFeeRule()
  const [feeEditor, setFeeEditor] = useState<FeeDraft | null>(null)
  const [feeError, setFeeError] = useState("")

  const filteredZones = useMemo(() => {
    const query = zoneSearch.trim().toLowerCase()
    return (zones.data ?? []).filter(
      (zone) =>
        (zoneStatus === "all" || (zoneStatus === "active" ? zone.active : !zone.active)) &&
        (!query || `${zone.district} ${zone.city} ${zone.location}`.toLowerCase().includes(query)),
    )
  }, [zones.data, zoneSearch, zoneStatus])
  const zonePageCount = Math.max(1, Math.ceil(filteredZones.length / PAGE_SIZE))
  const currentZonePage = Math.min(zonePage, zonePageCount)
  const visibleZones = filteredZones.slice(
    (currentZonePage - 1) * PAGE_SIZE,
    currentZonePage * PAGE_SIZE,
  )
  const zonePageStart = Math.max(1, Math.min(currentZonePage - 2, zonePageCount - 4))
  const zonePageNumbers = Array.from(
    { length: Math.min(5, zonePageCount) },
    (_, index) => zonePageStart + index,
  )
  const activeCount = (zones.data ?? []).filter((zone) => zone.active).length
  const inactiveCount = (zones.data ?? []).length - activeCount

  const openZone = (zone?: ManagedZone) => {
    setEditingZone(zone ?? null)
    setZoneEditor(
      zone
        ? {
            district: zone.district,
            city: zone.city,
            location: zone.location,
            lat: zone.lat == null ? "" : String(zone.lat),
            lng: zone.lng == null ? "" : String(zone.lng),
            active: zone.active,
          }
        : blankZone(),
    )
    setZoneError("")
  }
  const closeZone = () => {
    setZoneEditor(null)
    setEditingZone(null)
    setZoneError("")
    createZone.reset()
    updateZone.reset()
  }
  const saveZone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!zoneEditor) return
    const latText = zoneEditor.lat.trim()
    const lngText = zoneEditor.lng.trim()
    if (Boolean(latText) !== Boolean(lngText)) {
      setZoneError("Enter both latitude and longitude, or leave both blank.")
      return
    }
    const lat = latText ? Number(latText) : null
    const lng = lngText ? Number(lngText) : null
    if (
      (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
      (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180))
    ) {
      setZoneError("Enter valid latitude and longitude coordinates.")
      return
    }
    const body = {
      district: zoneEditor.district,
      city: zoneEditor.city,
      location: zoneEditor.location,
      lat,
      lng,
    }
    setZoneError("")
    try {
      if (editingZone)
        await updateZone.mutateAsync({
          id: editingZone.id,
          body: { ...body, active: zoneEditor.active },
        })
      else await createZone.mutateAsync(body)
      closeZone()
    } catch (error) {
      setZoneError(message(error))
    }
  }
  const closeFee = () => {
    setFeeEditor(null)
    setFeeError("")
    createFee.reset()
  }
  const saveFee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!feeEditor) return
    const baseFeePaise = toPaise(feeEditor.baseFee)
    const perKmPaise = toPaise(feeEditor.perKm)
    const freeAbovePaise = feeEditor.freeAbove.trim() ? toPaise(feeEditor.freeAbove) : null
    if (
      baseFeePaise === null ||
      perKmPaise === null ||
      (feeEditor.freeAbove.trim() && freeAbovePaise === null)
    ) {
      setFeeError("Enter valid non-negative fee amounts.")
      return
    }
    setFeeError("")
    try {
      await createFee.mutateAsync({
        business: feeEditor.business,
        zoneId: feeEditor.zoneId || null,
        baseFeePaise,
        perKmPaise,
        freeAbovePaise,
        effectiveFrom: new Date(feeEditor.effectiveFrom).toISOString(),
      })
      closeFee()
    } catch (error) {
      setFeeError(message(error))
    }
  }

  return (
    <>
      <HeadActions>
        <Button
          icon={RefreshCw}
          className={zones.isFetching || feeQuery.isFetching ? "spinning" : ""}
          onClick={() =>
            void runRefresh(async () => {
              const results = await Promise.all([zones.refetch(), feeQuery.refetch()])
              if (results.some((result) => result.isError)) throw new Error("Refresh failed")
            })
          }
        >
          Refresh
        </Button>
        <Button icon={Plus} onClick={() => openZone()}>
          Add service area
        </Button>
        <Button
          primary
          icon={CircleDollarSign}
          onClick={() => {
            setFeeEditor(blankFee())
            setFeeError("")
          }}
        >
          Add fee rule
        </Button>
      </HeadActions>

      <div className="sys-summary">
        <div>
          <MapPinned size={18} />
          <span>Service areas</span>
          <Count value={zones.data?.length} />
        </div>
        <div>
          <Settings2 size={18} />
          <span>Active</span>
          <Count value={activeCount} />
        </div>
        <div>
          <CircleDollarSign size={18} />
          <span>Inactive</span>
          <Count value={inactiveCount} />
        </div>
      </div>

      <Panel
        title="Service areas"
        subtitle="Manage district, city, location, map centre, and availability."
      >
        <div className="sys-toolbar">
          <Input
            icon={Search}
            value={zoneSearch}
            onChange={(event) => {
              setZoneSearch(event.target.value)
              setZonePage(1)
            }}
            placeholder="Search district, city or area"
            aria-label="Search service areas"
          />
          <select
            value={zoneStatus}
            onChange={(event) => {
              setZoneStatus(event.target.value as typeof zoneStatus)
              setZonePage(1)
            }}
            aria-label="Filter service-area status"
          >
            <option value="all">All areas</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {zones.isError ? (
          <p className="sys-state error" role="alert">
            Could not load service areas. {zones.error.message}
          </p>
        ) : zones.isPending ? (
          <p className="sys-state">Loading service areas…</p>
        ) : filteredZones.length ? (
          <div className="sys-table-scroll">
            <table className="sys-table">
              <thead>
                <tr>
                  <th>Service area</th>
                  <th>District</th>
                  <th>Map centre</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleZones.map((zone) => (
                  <tr key={zone.id}>
                    <td>
                      <strong>{zone.location}</strong>
                      <small>{zone.city}</small>
                    </td>
                    <td>{zone.district}</td>
                    <td>
                      {zone.lat == null || zone.lng == null
                        ? "Not configured"
                        : `${zone.lat.toFixed(5)}, ${zone.lng.toFixed(5)}`}
                    </td>
                    <td>
                      <Badge tone={zone.active ? "success" : "neutral"}>
                        {zone.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td>
                      <Button onClick={() => openZone(zone)}>Edit area</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sys-state">No service areas match these filters.</p>
        )}
        {filteredZones.length > PAGE_SIZE && (
          <nav className="sys-pagination zone-pagination" aria-label="Service area pages">
            <span>
              Showing {(currentZonePage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentZonePage * PAGE_SIZE, filteredZones.length)} of{" "}
              {filteredZones.length} areas
            </span>
            <div>
              <Button
                disabled={currentZonePage <= 1}
                aria-label="Previous service area page"
                onClick={() => setZonePage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              {zonePageNumbers.map((pageNumber) => (
                <Button
                  key={pageNumber}
                  className="zone-page-number"
                  aria-label={`Service area page ${pageNumber}`}
                  aria-current={currentZonePage === pageNumber ? "page" : undefined}
                  onClick={() => setZonePage(pageNumber)}
                >
                  {pageNumber}
                </Button>
              ))}
              <Button
                disabled={currentZonePage >= zonePageCount}
                aria-label="Next service area page"
                onClick={() => setZonePage((page) => Math.min(zonePageCount, page + 1))}
              >
                Next
              </Button>
            </div>
          </nav>
        )}
      </Panel>

      <Panel
        title="Delivery fee rules"
        subtitle="Versioned fee configuration. The current order API does not calculate charges from these rules."
      >
        <div className="sys-toolbar">
          <Select
            label="Business"
            value={business}
            onChange={(value) => {
              setBusiness(value as typeof business)
              setFeePage(1)
            }}
          >
            <option value="">All businesses</option>
            <option value="food">{businessName.food}</option>
            <option value="mart">{businessName.mart}</option>
          </Select>
          <Select
            label="Service area"
            value={feeZone}
            onChange={(value) => {
              setFeeZone(value)
              setFeePage(1)
            }}
          >
            <option value="">All areas (including platform-wide)</option>
            {zones.data?.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.location}, {zone.city}
              </option>
            ))}
          </Select>
          <span>{feeQuery.data?.total ?? "—"} rules</span>
        </div>
        {feeQuery.isError ? (
          <p className="sys-state error" role="alert">
            Could not load fee rules. {feeQuery.error.message}
          </p>
        ) : feeQuery.isPending ? (
          <p className="sys-state">Loading delivery fee rules…</p>
        ) : feeQuery.data?.items.length ? (
          <div className="sys-table-scroll">
            <table className="sys-table">
              <thead>
                <tr>
                  <th>Business / area</th>
                  <th>Base fee</th>
                  <th>Per km</th>
                  <th>Free above</th>
                  <th>Effective from</th>
                </tr>
              </thead>
              <tbody>
                {feeQuery.data.items.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{businessName[rule.business]}</strong>
                      <small>{rule.zoneName ?? "Platform-wide"}</small>
                    </td>
                    <td>{rupees(rule.baseFeePaise)}</td>
                    <td>{rupees(rule.perKmPaise)}</td>
                    <td>{rule.freeAbovePaise == null ? "—" : rupees(rule.freeAbovePaise)}</td>
                    <td>
                      {new Date(rule.effectiveFrom).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sys-state">No delivery fee rules have been configured for these filters.</p>
        )}
        {feeQuery.data && feeQuery.data.total > PAGE_SIZE && (
          <div className="sys-pagination">
            <span>
              Page {feePage} of {Math.ceil(feeQuery.data.total / PAGE_SIZE)}
            </span>
            <div>
              <Button
                disabled={feePage <= 1 || feeQuery.isFetching}
                onClick={() => setFeePage((page) => page - 1)}
              >
                Previous
              </Button>
              <Button
                disabled={feePage * PAGE_SIZE >= feeQuery.data.total || feeQuery.isFetching}
                onClick={() => setFeePage((page) => page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {zoneEditor && (
        <Modal
          title={editingZone ? "Edit service area" : "Add service area"}
          subtitle="Map coordinates are optional; leave blank when they are not known."
          close={closeZone}
        >
          <form className="sys-editor" onSubmit={(event) => void saveZone(event)}>
            <label className="sys-field">
              <span>District</span>
              <input
                required
                value={zoneEditor.district}
                onChange={(event) => setZoneEditor({ ...zoneEditor, district: event.target.value })}
              />
            </label>
            <label className="sys-field">
              <span>City</span>
              <input
                required
                value={zoneEditor.city}
                onChange={(event) => setZoneEditor({ ...zoneEditor, city: event.target.value })}
              />
            </label>
            <label className="sys-field">
              <span>Area / locality</span>
              <input
                required
                value={zoneEditor.location}
                onChange={(event) => setZoneEditor({ ...zoneEditor, location: event.target.value })}
              />
            </label>
            <div className="sys-form-grid">
              <label className="sys-field">
                <span>Latitude</span>
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={zoneEditor.lat}
                  onChange={(event) => setZoneEditor({ ...zoneEditor, lat: event.target.value })}
                />
              </label>
              <label className="sys-field">
                <span>Longitude</span>
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={zoneEditor.lng}
                  onChange={(event) => setZoneEditor({ ...zoneEditor, lng: event.target.value })}
                />
              </label>
            </div>
            {editingZone && (
              <label className="sys-inline-check">
                <input
                  type="checkbox"
                  checked={zoneEditor.active}
                  onChange={(event) =>
                    setZoneEditor({ ...zoneEditor, active: event.target.checked })
                  }
                />{" "}
                Area is active for operations
              </label>
            )}
            {zoneError && (
              <p className="sys-form-error" role="alert">
                {zoneError}
              </p>
            )}
            <footer className="sys-editor-actions">
              <Button onClick={closeZone}>Cancel</Button>
              <Button primary type="submit" disabled={createZone.isPending || updateZone.isPending}>
                {createZone.isPending || updateZone.isPending ? "Saving…" : "Save area"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}

      {feeEditor && (
        <Modal
          title="Add delivery fee rule"
          subtitle="Creates a versioned configuration record; checkout pricing integration is separate."
          close={closeFee}
        >
          <form className="sys-editor" onSubmit={(event) => void saveFee(event)}>
            <label className="sys-field">
              <span>Business</span>
              <select
                value={feeEditor.business}
                onChange={(event) =>
                  setFeeEditor({
                    ...feeEditor,
                    business: event.target.value as FeeDraft["business"],
                  })
                }
              >
                <option value="food">{businessName.food}</option>
                <option value="mart">{businessName.mart}</option>
              </select>
            </label>
            <label className="sys-field">
              <span>Service area (optional)</span>
              <select
                value={feeEditor.zoneId}
                onChange={(event) => setFeeEditor({ ...feeEditor, zoneId: event.target.value })}
              >
                <option value="">Platform-wide default</option>
                {zones.data
                  ?.filter((zone) => zone.active)
                  .map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.location}, {zone.city}
                    </option>
                  ))}
              </select>
            </label>
            <div className="sys-form-grid">
              <label className="sys-field">
                <span>Base delivery fee (₹)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={feeEditor.baseFee}
                  onChange={(event) => setFeeEditor({ ...feeEditor, baseFee: event.target.value })}
                />
              </label>
              <label className="sys-field">
                <span>Fee per km (₹)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={feeEditor.perKm}
                  onChange={(event) => setFeeEditor({ ...feeEditor, perKm: event.target.value })}
                />
              </label>
              <label className="sys-field">
                <span>Free delivery above order value (₹)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={feeEditor.freeAbove}
                  onChange={(event) =>
                    setFeeEditor({ ...feeEditor, freeAbove: event.target.value })
                  }
                  placeholder="Optional"
                />
              </label>
              <label className="sys-field">
                <span>Effective from</span>
                <input
                  type="datetime-local"
                  required
                  value={feeEditor.effectiveFrom}
                  onChange={(event) =>
                    setFeeEditor({ ...feeEditor, effectiveFrom: event.target.value })
                  }
                />
              </label>
            </div>
            {feeError && (
              <p className="sys-form-error" role="alert">
                {feeError}
              </p>
            )}
            <footer className="sys-editor-actions">
              <Button onClick={closeFee}>Cancel</Button>
              <Button primary type="submit" disabled={createFee.isPending}>
                {createFee.isPending ? "Saving…" : "Create versioned rule"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  )
}
