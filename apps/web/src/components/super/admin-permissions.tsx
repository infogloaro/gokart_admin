"use client"

import { ApiError } from "@zoauro/api-client"
import {
  businessName,
  rolePermissions,
  type AdminMember,
  type Business,
  type Permission,
} from "@zoauro/shared"
import { Download, KeyRound, Plus, RefreshCw, Search, ShieldCheck, UserCog } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useMe } from "@/lib/session"
import { adminsCsv, useAdmins, useCreateAdmin, useManagedZones, useUpdateAdmin } from "@/lib/system"
import { Badge, Button, Input, Modal, Panel, Toast } from "./ui"
import { Count, HeadActions } from "./dashboard"
import { useCsvExport } from "./export"
import { useRefreshToast } from "@/components/refresh-toast"

type StatusFilter = "all" | "active" | "disabled"
type Draft = {
  name: string
  email: string
  password: string
  status: "active" | "disabled"
  businesses: Business[]
  zoneIds: string[]
  permissions: Permission[]
}

const blankDraft = (): Draft => ({
  name: "",
  email: "",
  password: "",
  status: "active",
  businesses: ["food", "mart"],
  zoneIds: [],
  permissions: [...rolePermissions.admin],
})

const adminPermissions = rolePermissions.admin
const permissionGroups = [
  ...new Set(adminPermissions.map((permission) => permission.split(".")[0]!)),
]
const label = (value: string) =>
  value
    .split(/[._]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
const apiMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : "The request failed. Please try again."

export function AdminPermissions() {
  const runRefresh = useRefreshToast()
  const me = useMe()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editing, setEditing] = useState<AdminMember | null>(null)
  const [error, setError] = useState("")
  const allMembers = useAdmins("", "all")
  const members = useAdmins(search.trim(), status)
  const zones = useManagedZones()
  const createAdmin = useCreateAdmin()
  const updateAdmin = useUpdateAdmin()
  const csv = useCsvExport()
  const busy = createAdmin.isPending || updateAdmin.isPending
  const activeCount = (allMembers.data ?? []).filter((member) => member.status === "active").length
  const disabledCount = (allMembers.data ?? []).filter(
    (member) => member.status === "disabled",
  ).length
  const activeZoneIds = new Set(zones.data?.filter((zone) => zone.active).map((zone) => zone.id))

  const closeEditor = () => {
    setDraft(null)
    setEditing(null)
    setError("")
    createAdmin.reset()
    updateAdmin.reset()
  }

  const edit = (member: AdminMember) => {
    setEditing(member)
    setDraft({
      name: member.name,
      email: member.email,
      password: "",
      status: member.status,
      businesses: member.businesses,
      zoneIds: member.zones.map((zone) => zone.id),
      permissions: member.permissions,
    })
    setError("")
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    setError("")
    if (!draft.businesses.length || !draft.zoneIds.length) {
      setError("Select at least one business and one service area.")
      return
    }
    if (editing) {
      try {
        await updateAdmin.mutateAsync({
          id: editing.id,
          body: {
            name: draft.name,
            status: draft.status,
            businesses: draft.businesses,
            zoneIds: draft.zoneIds,
            permissions: draft.permissions,
          },
        })
        closeEditor()
      } catch (reason) {
        setError(apiMessage(reason))
      }
      return
    }
    try {
      await createAdmin.mutateAsync({
        name: draft.name,
        email: draft.email,
        password: draft.password,
        businesses: draft.businesses,
        zoneIds: draft.zoneIds,
        permissions: draft.permissions,
      })
      closeEditor()
    } catch (reason) {
      setError(apiMessage(reason))
    }
  }

  const toggle = <T extends string>(values: T[], value: T, checked: boolean) =>
    checked ? [...new Set([...values, value])] : values.filter((item) => item !== value)

  return (
    <>
      <HeadActions>
        <Button
          icon={RefreshCw}
          className={members.isFetching ? "spinning" : ""}
          onClick={() =>
            void runRefresh(async () => {
              const result = await members.refetch()
              if (result.isError) throw new Error("Refresh failed")
            })
          }
        >
          Refresh
        </Button>
        {me.data?.permissions.includes("members.manage") && (
          <>
            <Button
              icon={Download}
              disabled={csv.exporting || members.isFetching || members.isError}
              onClick={() =>
                void csv.run("admin-accounts", async () => ({
                  csv: adminsCsv(members.data ?? []),
                  count: members.data?.length ?? 0,
                }))
              }
            >
              {csv.exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button
              primary
              icon={Plus}
              onClick={() => {
                setEditing(null)
                setDraft(blankDraft())
                setError("")
              }}
            >
              Add Admin
            </Button>
          </>
        )}
      </HeadActions>

      <div className="sys-summary">
        <div>
          <UserCog size={18} />
          <span>Admin accounts</span>
          <Count value={allMembers.data?.length} />
        </div>
        <div>
          <ShieldCheck size={18} />
          <span>Active</span>
          <Count value={activeCount} />
        </div>
        <div>
          <KeyRound size={18} />
          <span>Disabled</span>
          <Count value={disabledCount} />
        </div>
      </div>

      <Panel
        title="Admins & access"
        subtitle="Manage business scope, service areas, and role permissions."
      >
        <div className="sys-toolbar">
          <Input
            icon={Search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email"
            aria-label="Search admin accounts"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            aria-label="Filter by account status"
          >
            <option value="all">All account statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        {members.isError ? (
          <p className="sys-state error" role="alert">
            Could not load Admin accounts. {members.error.message}
          </p>
        ) : members.isPending ? (
          <p className="sys-state">Loading Admin accounts…</p>
        ) : members.data?.length ? (
          <div className="sys-table-scroll">
            <table className="sys-table">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Business access</th>
                  <th>Service areas</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th>Authenticator</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.data.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </td>
                    <td>
                      {member.businesses.map((business) => businessName[business]).join(", ")}
                    </td>
                    <td>
                      {activeZoneIds.size > 0 &&
                      member.zones.length === activeZoneIds.size &&
                      member.zones.every((zone) => activeZoneIds.has(zone.id))
                        ? "All areas"
                        : `${member.zones.length} area${member.zones.length === 1 ? "" : "s"}`}
                    </td>
                    <td>{member.permissions.length} granted</td>
                    <td>
                      <Badge tone={member.status === "active" ? "success" : "danger"}>
                        {label(member.status)}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={member.authenticatorEnabled ? "success" : "warning"}>
                        {member.authenticatorEnabled ? "Enabled" : "Email code"}
                      </Badge>
                    </td>
                    <td>
                      <Button onClick={() => edit(member)}>Manage</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sys-state">No Admin accounts match this search.</p>
        )}
      </Panel>

      {draft && (
        <Modal
          title={editing ? `Manage ${editing.name}` : "Add Admin account"}
          subtitle="Access changes are recorded in the audit log."
          close={closeEditor}
          wide
        >
          <form method="post" className="sys-editor" onSubmit={(event) => void submit(event)}>
            <div className="sys-form-grid">
              <label className="sys-field">
                <span>Full name</span>
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              {!editing && (
                <label className="sys-field">
                  <span>Email address</span>
                  <input
                    type="email"
                    required
                    value={draft.email}
                    onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  />
                </label>
              )}
              {!editing && (
                <label className="sys-field">
                  <span>Initial password (12+ characters)</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                    value={draft.password}
                    onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                  />
                  <small>Share this initial password securely with the new Admin.</small>
                </label>
              )}
              {editing && (
                <label className="sys-field">
                  <span>Account status</span>
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft({ ...draft, status: event.target.value as Draft["status"] })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              )}
            </div>
            <fieldset className="sys-check-group">
              <legend>Business access</legend>
              {(["food", "mart"] as const).map((business) => (
                <label key={business}>
                  <input
                    type="checkbox"
                    checked={draft.businesses.includes(business)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        businesses: toggle(draft.businesses, business, event.target.checked),
                      })
                    }
                  />
                  {businessName[business]}
                </label>
              ))}
            </fieldset>
            <fieldset className="sys-check-group">
              <legend>Service-area access</legend>
              {zones.isError ? (
                <p className="sys-state error">
                  Could not load service areas. {zones.error.message}
                </p>
              ) : zones.isPending ? (
                <p className="sys-state">Loading areas…</p>
              ) : zones.data?.some((zone) => zone.active) ? (
                <div className="sys-check-grid">
                  {zones.data
                    .filter((zone) => zone.active || draft.zoneIds.includes(zone.id))
                    .map((zone) => (
                      <label key={zone.id}>
                        <input
                          type="checkbox"
                          checked={draft.zoneIds.includes(zone.id)}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              zoneIds: toggle(
                                draft.zoneIds,
                                zone.id,
                                zone.active && event.target.checked,
                              ),
                            })
                          }
                        />
                        {zone.location}, {zone.city}
                        {!zone.active && " (inactive — remove access)"}
                      </label>
                    ))}
                </div>
              ) : (
                <p className="sys-state">Add an active area before assigning an Admin.</p>
              )}
            </fieldset>
            <fieldset className="sys-check-group">
              <legend>Permissions</legend>
              <div className="sys-permission-groups">
                {permissionGroups.map((group) => (
                  <section key={group}>
                    <strong>{label(group)}</strong>
                    {adminPermissions
                      .filter((permission) => permission.startsWith(`${group}.`))
                      .map((permission) => (
                        <label key={permission}>
                          <input
                            type="checkbox"
                            checked={draft.permissions.includes(permission)}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                permissions: toggle(
                                  draft.permissions,
                                  permission,
                                  event.target.checked,
                                ),
                              })
                            }
                          />
                          {label(permission.split(".")[1]!)}
                        </label>
                      ))}
                  </section>
                ))}
              </div>
            </fieldset>
            {error && (
              <p className="sys-form-error" role="alert">
                {error}
              </p>
            )}
            {createAdmin.isError && !error && (
              <p className="sys-form-error" role="alert">
                {apiMessage(createAdmin.error)}
              </p>
            )}
            {updateAdmin.isError && !error && (
              <p className="sys-form-error" role="alert">
                {apiMessage(updateAdmin.error)}
              </p>
            )}
            <footer className="sys-editor-actions">
              <Button onClick={closeEditor}>Cancel</Button>
              <Button primary type="submit" disabled={busy || zones.isPending || zones.isError}>
                {busy ? "Saving…" : editing ? "Save access" : "Create Admin"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
      {csv.toast && <Toast toast={csv.toast} close={csv.dismiss} />}
    </>
  )
}
