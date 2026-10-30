"use client"
// My profile: account, access, two-step verification, signed-in devices and preferences.
import { ApiError } from "@zoauro/api-client"
import { businessName, roleName, type MemberPreferences } from "@zoauro/shared"
import {
  Bell,
  Building2,
  Laptop,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Smartphone,
} from "lucide-react"
import { TwoStepSettings } from "@/components/two-step-settings"
import { age } from "@/lib/dashboard"
import {
  deviceName,
  useEndSession,
  usePreferences,
  useSavePreferences,
  useSessions,
} from "@/lib/operations"
import { useMe, useZones } from "@/lib/session"
import { AdminBadge, AdminButton, PageHeader } from "./ui"

const PREFS: { key: keyof MemberPreferences; title: string; text: string }[] = [
  {
    key: "emailComplaints",
    title: "Complaint updates by email",
    text: "When a complaint in your zones is escalated or assigned to you.",
  },
  {
    key: "slaAlerts",
    title: "Time-limit alerts",
    text: "When orders in your zones run past their delivery time limit.",
  },
  {
    key: "dailyDigest",
    title: "Daily summary",
    text: "A morning email with yesterday's orders, delays and refunds.",
  },
  {
    key: "sound",
    title: "Notification sound",
    text: "Play a short sound in the portal when something new arrives.",
  },
]

export function AdminProfile() {
  const me = useMe()
  const zones = useZones()
  const m = me.data
  if (!m) return null
  const myZones = (zones.data ?? []).filter((z) => m.zoneIds.includes(z.id))
  return (
    <div className="gk-page">
      <PageHeader title="My profile" subtitle="Your account, security and preferences." />
      <section className="profile-hero gk-rise">
        <span className="profile-avatar">{m.initials}</span>
        <div>
          <h2>{m.name}</h2>
          <p>
            {roleName[m.role]} · {m.businesses.map((b) => businessName[b]).join(" & ")}
          </p>
          <div className="profile-facts">
            <span>
              <Mail className="icon" size={14} /> {m.email}
            </span>
            {m.phone && (
              <span>
                <Phone className="icon" size={14} /> {m.phone}
              </span>
            )}
            <span>
              <ShieldCheck className="icon" size={14} /> Two-step:{" "}
              {m.totpEnabled ? "authenticator app" : m.preferredMfa === "sms" ? "SMS" : "email"}
            </span>
          </div>
        </div>
      </section>

      <div className="profile-grid">
        <section className="panel profile-card gk-rise" style={{ animationDelay: "60ms" }}>
          <div className="panel-head">
            <div>
              <h2>Access</h2>
              <p>What you can see and act on. Ask a Super Admin to change it.</p>
            </div>
          </div>
          <div className="profile-access">
            <div>
              <small>
                <Building2 className="icon" size={14} /> Businesses
              </small>
              <div className="chips">
                {m.businesses.map((b) => (
                  <AdminBadge key={b} tone={b === "food" ? "gold" : "info"}>
                    {businessName[b]}
                  </AdminBadge>
                ))}
              </div>
            </div>
            <div>
              <small>
                <MapPin className="icon" size={14} /> Zones ({myZones.length})
              </small>
              <div className="chips">
                {myZones.slice(0, 12).map((z) => (
                  <span className="zone-chip" key={z.id}>
                    {z.location}, {z.city}
                  </span>
                ))}
                {myZones.length > 12 && (
                  <span className="zone-chip">+{myZones.length - 12} more</span>
                )}
              </div>
            </div>
            <div>
              <small>
                <ShieldCheck className="icon" size={14} /> Permissions ({m.permissions.length})
              </small>
              <div className="chips">
                {m.permissions.map((p) => (
                  <span className="perm-chip" key={p}>
                    {p.replace(".", " · ").replace("_", " ")}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="panel profile-card gk-rise" style={{ animationDelay: "120ms" }}>
          <div className="panel-head">
            <div>
              <h2>Two-step verification</h2>
              <p>How you confirm it&apos;s you when signing in.</p>
            </div>
          </div>
          <div style={{ padding: 18 }}>
            <TwoStepSettings />
          </div>
        </section>

        <Sessions />
        <Preferences />
      </div>
    </div>
  )
}

function Sessions() {
  const q = useSessions()
  const end = useEndSession()
  const others = (q.data ?? []).filter((s) => !s.current).length
  return (
    <section className="panel profile-card gk-rise" style={{ animationDelay: "180ms" }}>
      <div className="panel-head">
        <div>
          <h2>Signed-in devices</h2>
          <p>Sessions stay signed in for 12 hours of inactivity.</p>
        </div>
        {others > 0 && (
          <AdminButton
            kind="secondary"
            icon={LogOut}
            disabled={end.isPending}
            onClick={() => end.mutate("others")}
          >
            Sign out {others} other{others === 1 ? "" : "s"}
          </AdminButton>
        )}
      </div>
      <ul className="session-list">
        {q.data?.map((s) => {
          const mobile = /Android|iPhone|iPad/.test(s.userAgent ?? "")
          const Icon = mobile ? Smartphone : Laptop
          return (
            <li key={s.id} className={s.current ? "current" : ""}>
              <span className="session-icon">
                <Icon className="icon" size={18} />
              </span>
              <span className="session-copy">
                <strong>
                  {deviceName(s.userAgent)}
                  {s.current && <AdminBadge tone="success">This device</AdminBadge>}
                </strong>
                <small>
                  Signed in {age(s.createdAt)} ago{s.ip ? ` · ${s.ip.replace("::ffff:", "")}` : ""}
                </small>
              </span>
              {!s.current && (
                <button
                  type="button"
                  className="session-end"
                  disabled={end.isPending}
                  onClick={() => end.mutate(s.id)}
                >
                  Sign out
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {end.isError && (
        <p className="admin-error" role="alert">
          {end.error instanceof ApiError ? end.error.message : "Couldn't sign that session out."}
        </p>
      )}
    </section>
  )
}

function Preferences() {
  const q = usePreferences()
  const save = useSavePreferences()
  const p = q.data
  return (
    <section className="panel profile-card gk-rise" style={{ animationDelay: "240ms" }}>
      <div className="panel-head">
        <div>
          <h2>
            <Bell className="icon" size={15} /> Notification preferences
          </h2>
          <p>Saved to your account, so they follow you to any device.</p>
        </div>
        {save.isSuccess && <AdminBadge tone="success">Saved</AdminBadge>}
      </div>
      <ul className="pref-list">
        {PREFS.map((x) => (
          <li key={x.key}>
            <span>
              <strong>{x.title}</strong>
              <small>{x.text}</small>
            </span>
            <label className="gk-switch">
              <input
                type="checkbox"
                checked={Boolean(p?.[x.key])}
                disabled={!p || save.isPending}
                onChange={(e) => p && save.mutate({ ...p, [x.key]: e.target.checked })}
                aria-label={x.title}
              />
              <span />
            </label>
          </li>
        ))}
      </ul>
      {save.isError && (
        <p className="admin-error" role="alert">
          {save.error instanceof ApiError ? save.error.message : "Couldn't save your preferences."}
        </p>
      )}
    </section>
  )
}
