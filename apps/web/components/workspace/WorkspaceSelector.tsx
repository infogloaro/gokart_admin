"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useWorkspace } from "@/providers/WorkspaceProvider"
import { fetchDashboard } from "@/lib/dashboard-api"
import "./workspace-selector.css"

type WorkspaceStats = { orders: string; partners: string }

function todayRange() {
  const today = new Date().toISOString().slice(0, 10)
  return { start: today, end: today }
}

function FoodIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18M8 3l13 13M3 8l13 13M14 3l7 7M3 14l7 7" />
      <path d="M16 2l6 6M2 16l6 6" />
    </svg>
  )
}

function MartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8h14l-1 13H6L5 8Z" />
      <path d="M8 8V6a4 4 0 0 1 8 0v2M9 12a3 3 0 0 0 6 0" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" />
    </svg>
  )
}

function DecorativeIcons() {
  return (
    <div className="m05-decor" aria-hidden="true">
      <svg className="decor decor-pizza" viewBox="0 0 100 100">
        <path d="M15 77 73 18Q89 40 91 79Z" />
        <path d="M27 70 70 28M40 70l5-8M56 54l4-7M69 70l-2-9" />
      </svg>
      <svg className="decor decor-cutlery" viewBox="0 0 70 70">
        <path d="M12 8v19M20 8v19M28 8v19M12 20h16M20 27v32M47 8c-8 12-8 22 0 27v24M47 8v27M47 35l12-27" />
      </svg>
      <svg className="decor decor-bag" viewBox="0 0 70 70">
        <path d="M15 24h40l-4 39H19Z" />
        <path d="M25 24v-5a10 10 0 0 1 20 0v5M28 37a7 7 0 0 0 14 0" />
      </svg>
      <svg className="decor decor-cart" viewBox="0 0 100 100">
        <path d="M10 17h12l10 49h45l13-35H27M35 78a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM72 78a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
        <path d="m30 39 52 10M34 54h46" />
      </svg>
      <svg className="decor decor-cup" viewBox="0 0 80 80">
        <path d="M15 30h42l-5 34H22ZM57 35h7a10 10 0 0 1 0 20h-9M25 20c-5-6 4-8 0-14M39 20c-5-6 4-8 0-14M52 20c-5-6 4-8 0-14" />
      </svg>
      <svg className="decor decor-box" viewBox="0 0 80 80">
        <path d="m14 25 27-15 26 15-26 16ZM14 25v31l27 15V41M67 25v31L41 71M27 18l26 16M41 41v30" />
      </svg>
      <svg className="decor decor-shirt" viewBox="0 0 80 80">
        <path d="m25 13 15 7 15-7 17 9-8 17-9-5v34H25V34l-9 5-8-17Z" />
      </svg>
      <svg className="decor decor-phone" viewBox="0 0 70 90">
        <rect x="17" y="7" width="37" height="72" rx="6" transform="rotate(10 35 43)" />
        <path d="M32 68h5" />
      </svg>
      <svg className="decor decor-bowl" viewBox="0 0 100 100">
        <path d="M16 48h68a34 34 0 0 1-68 0ZM10 48h80M28 35c-9-9 8-10 0-20M48 35c-9-9 8-10 0-20M68 35c-9-9 8-10 0-20" />
      </svg>
      <svg className="decor decor-sandwich" viewBox="0 0 80 80">
        <path d="m12 43 42-27 18 18-42 27ZM12 43l5 18 42-4 13-23M19 61l5 8 42-5 2-7" />
      </svg>
      <svg className="decor decor-gift" viewBox="0 0 70 70">
        <path d="M10 31h50v10H10zM15 41h40v22H15zM35 31v32M35 31C14 31 13 12 25 14c8 1 10 17 10 17ZM35 31c21 0 22-19 10-17-8 1-10 17-10 17Z" />
      </svg>
    </div>
  )
}

function businessDetails(name: string) {
  const normalized = name.toLowerCase()
  if (normalized.includes("zoauro") || normalized.includes("food")) {
    return {
      title: "ZOAURO FOOD",
      description:
        "Restaurant orders, preparation, food delivery partners, revenue and customer issues.",
      kind: "food",
    }
  }
  if (normalized.includes("gloaro") || normalized.includes("mart")) {
    return {
      title: "GLOARO MART",
      description: "Marketplace orders, sellers, inventory, parcel shipments, revenue and returns.",
      kind: "mart",
    }
  }
  return {
    title: name,
    description: "Open this business workspace to manage its operations.",
    kind: "mart",
  }
}

export default function WorkspaceSelector() {
  const router = useRouter()
  const { workspaces, activeWorkspace, loading, error, switchWorkspace, refreshWorkspaces } =
    useWorkspace()

  const [stats, setStats] = useState<Record<string, WorkspaceStats>>({})
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState("")

  async function openWorkspace(workspaceId: string) {
    if (!workspaceId || saving) return
    setSaving(true)
    setActionError("")
    try {
      if (workspaceId !== activeWorkspace?.id) {
        await switchWorkspace(workspaceId)
      }
      router.push(`/admin/${workspaceId}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to open this workspace.")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const range = todayRange()
    for (const workspace of workspaces) {
      fetchDashboard(workspace.slug, range)
        .then((data) => {
          if (cancelled) return
          const value = (label: string) =>
            data.metrics.find((metric) => metric.label === label)?.value ?? "—"
          setStats((current) => ({
            ...current,
            [workspace.id]: { orders: value("Total orders"), partners: value("Delivery partners") },
          }))
        })
        .catch(() => {
          // Leave the placeholder dashes when live data cannot be loaded.
        })
    }
    return () => {
      cancelled = true
    }
  }, [workspaces])

  const selectedWorkspaceId = activeWorkspace?.id || ""

  return (
    <main className="m05-page">
      <header className="m05-topbar">
        <Link className="m05-brand" href="/" aria-label="GoKart home">
          <span className="m05-brand-mark">G</span>
          <span className="m05-brand-word">
            GO<span>KART</span>
          </span>
        </Link>
        <div className="m05-session">
          <span className="m05-shield">
            <ShieldIcon />
          </span>
          <span>Secure Super Admin session</span>
          <button
            type="button"
            className="m05-logout"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => setActionError("Connect this button to the M03 sign-out flow.")}
          >
            <LogoutIcon />
          </button>
        </div>
      </header>

      <section className="m05-hero">
        <DecorativeIcons />
        <div className="m05-content">
          <div className="m05-step">STEP 2 OF 2</div>
          <h1>Select your workspace</h1>
          <p className="m05-subtitle">
            Revenue, notifications, dashboards and operational records remain separated by business.
          </p>

          {(error || actionError) && (
            <div className="m05-error" role="alert">
              <span>{error || actionError}</span>
              {error && (
                <button type="button" onClick={() => void refreshWorkspaces()}>
                  Retry
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="m05-state">Loading your workspaces…</div>
          ) : workspaces.length === 0 ? (
            <div className="m05-state">
              <strong>No accessible workspaces</strong>
              <p>Your account has no available workspaces, or they could not be loaded.</p>
              <button type="button" onClick={() => void refreshWorkspaces()}>
                Retry
              </button>
            </div>
          ) : (
            <div className="m05-cards">
              {workspaces.map((workspace) => {
                const details = businessDetails(workspace.name)
                const active = activeWorkspace?.id === workspace.id
                const selected = selectedWorkspaceId === workspace.id

                return (
                  <div
                    key={workspace.id}
                    className={`m05-card ${selected ? "is-selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${details.title} Administration`}
                    onClick={() => void openWorkspace(workspace.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        void openWorkspace(workspace.id)
                      }
                    }}
                  >
                    <div className="m05-card-top">
                      <div className={`m05-business-icon ${details.kind}`}>
                        {details.kind === "food" ? <FoodIcon /> : <MartIcon />}
                      </div>
                      <span className={`m05-access ${selected ? "blue" : "green"}`}>
                        <span className="m05-dot" />
                        {active ? "Access granted" : "Access granted"}
                      </span>
                    </div>

                    <h2>{details.title}</h2>
                    <p className="m05-description">{details.description}</p>

                    <div className="m05-metrics">
                      <div>
                        <strong>{stats[workspace.id]?.orders ?? "—"}</strong>
                        <span>orders today</span>
                      </div>
                      <div>
                        <strong>{stats[workspace.id]?.partners ?? "—"}</strong>
                        <span>active partners</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="m05-open"
                      onClick={(event) => {
                        event.stopPropagation()
                        void openWorkspace(workspace.id)
                      }}
                      disabled={saving}
                    >
                      <span>Open {details.title} Administration</span>
                      <span className="m05-arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="m05-footer-note">
            <span className="m05-lock" aria-hidden="true">
              ♙
            </span>
            Business dashboards, revenue and alerts update to the selected workspace.
          </div>
        </div>
      </section>
    </main>
  )
}
