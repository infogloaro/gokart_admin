"use client"
// Two-step verification settings, shared by both portals: which sign-in methods the
// member can use, authenticator-app setup (QR code or setup key), backup codes, and
// turning the app off.

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@zoauro/api-client"
import { mfaMethodName, type MfaMethod } from "@zoauro/shared"
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Mail,
  MessageSquareText,
  Smartphone,
  type LucideIcon,
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { meKey, useMe } from "@/lib/session"

const icons: Record<MfaMethod, LucideIcon> = {
  email: Mail,
  sms: MessageSquareText,
  totp: Smartphone,
}

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : e ? "Something went wrong. Try again." : ""

const btn = {
  gold: "h-10 rounded-lg bg-gold px-4 text-sm font-bold text-navy-2 transition hover:brightness-105 disabled:opacity-60",
  navy: "h-10 rounded-lg bg-navy px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60",
  plain:
    "h-10 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-300",
  danger:
    "h-10 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60",
}

function Status({ on, children }: { on: boolean; children: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {on && <CheckCircle2 size={13} />}
      {children}
    </span>
  )
}

function Box({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "slate" }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-card border p-4 text-sm ${
        tone === "gold" ? "border-gold/40 bg-gold-soft/60" : "border-line bg-slate-50"
      }`}
    >
      {children}
    </div>
  )
}

/** Copies text and shows "Copied" for a moment; falls back to selecting nothing on refusal. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`${btn.plain} inline-flex items-center gap-2`}
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1800)
          })
          .catch(() => setDone(false))
      }
    >
      {done ? <Check size={15} /> : <Copy size={15} />}
      {done ? "Copied" : label}
    </button>
  )
}

export function TwoStepSettings() {
  const me = useMe().data
  const [panel, setPanel] = useState<"none" | "setup" | "manage">("none")
  const [codes, setCodes] = useState<string[] | null>(null)
  if (!me) return null

  const rows: { method: MfaMethod; detail: string; on: boolean; status: string }[] = [
    { method: "email", detail: me.email, on: true, status: "On" },
    {
      method: "sms",
      detail: me.phone ?? "No mobile number on file. Ask your Super Admin to add one.",
      on: Boolean(me.phone),
      status: me.phone ? "On" : "Not set up",
    },
    {
      method: "totp",
      detail: me.totpEnabled
        ? `${me.recoveryCodesLeft} of 10 backup codes left`
        : "Google Authenticator, Microsoft Authenticator or similar",
      on: me.totpEnabled,
      status: me.totpEnabled ? "On" : "Not set up",
    },
  ]

  return (
    <div className="flex flex-col gap-4 font-sans text-ink">
      <p className="m-0 text-sm leading-relaxed text-muted">
        After your password, you choose one of these to get a 6-digit code. Signing in with your
        mobile number picks SMS for you; signing in with your email picks the email code.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => {
          const Icon = icons[r.method]
          return (
            <li
              key={r.method}
              className="flex items-center gap-3 rounded-card border border-line bg-white px-4 py-3"
            >
              <span className="grid size-10 flex-none place-items-center rounded-lg bg-gold-soft text-gold">
                <Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="flex items-center gap-2 text-sm">
                  {mfaMethodName[r.method]}
                  {me.preferredMfa === r.method && r.on && (
                    <span className="rounded-full bg-navy/5 px-2 py-0.5 text-[11px] font-semibold text-navy">
                      Last used
                    </span>
                  )}
                </b>
                <small
                  className={`block truncate text-xs ${
                    r.method === "totp" && me.totpEnabled && me.recoveryCodesLeft <= 2
                      ? "font-semibold text-amber-700"
                      : "text-muted"
                  }`}
                >
                  {r.detail}
                </small>
              </span>
              {r.method === "totp" && !r.on && (
                <button
                  type="button"
                  onClick={() => setPanel("setup")}
                  className={`${btn.gold} h-9 text-xs`}
                >
                  Set up
                </button>
              )}
              {r.method === "totp" && r.on && (
                <>
                  <Status on>On</Status>
                  <button
                    type="button"
                    onClick={() => setPanel(panel === "manage" ? "none" : "manage")}
                    aria-expanded={panel === "manage"}
                    className={`${btn.plain} h-9 text-xs`}
                  >
                    Manage
                  </button>
                </>
              )}
              {r.method !== "totp" && <Status on={r.on}>{r.status}</Status>}
            </li>
          )
        })}
      </ul>

      {codes && <RecoveryCodesSheet codes={codes} done={() => setCodes(null)} />}
      {!codes && panel === "setup" && !me.totpEnabled && (
        <AuthenticatorSetup
          cancel={() => setPanel("none")}
          enabled={(c) => {
            setPanel("none")
            setCodes(c)
          }}
        />
      )}
      {!codes && panel === "manage" && me.totpEnabled && (
        <ManageAuthenticator
          close={() => setPanel("none")}
          newCodes={(c) => {
            setPanel("none")
            setCodes(c)
          }}
        />
      )}
    </div>
  )
}

function AuthenticatorSetup({
  cancel,
  enabled,
}: {
  cancel: () => void
  enabled: (codes: string[]) => void
}) {
  const client = useQueryClient()
  const [code, setCode] = useState("")
  const start = useMutation({ mutationFn: () => api("post", "/auth/totp/setup") })
  const confirm = useMutation({
    mutationFn: () => api("post", "/auth/totp/confirm", { body: { code } }),
    onSuccess: async (res) => {
      await client.invalidateQueries({ queryKey: meKey })
      enabled(res.recoveryCodes)
    },
  })
  const error = errorText(confirm.error ?? start.error)

  if (!start.data)
    return (
      <Box>
        <p className="m-0 leading-relaxed">
          Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone, then
          show the QR code to scan.
        </p>
        {error && <p className="m-0 text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={start.isPending}
            onClick={() => start.mutate()}
            className={btn.navy}
          >
            {start.isPending ? "Generating…" : "Show QR code"}
          </button>
          <button type="button" onClick={cancel} className={btn.plain}>
            Cancel
          </button>
        </div>
      </Box>
    )

  return (
    <form
      method="post"
      className="flex flex-col gap-4 rounded-card border border-gold/40 bg-gold-soft/60 p-4 text-sm sm:flex-row sm:items-start"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.length === 6) confirm.mutate()
      }}
    >
      <div className="flex flex-none flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the API */}
        <img
          src={start.data.qrDataUrl}
          alt="QR code to add GoKart Admin to your authenticator app"
          width={176}
          height={176}
          className="size-44 rounded-lg border border-line bg-white p-1"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <ol className="m-0 flex flex-col gap-1 pl-4 leading-relaxed">
          <li>Open your authenticator app and scan this QR code.</li>
          <li>Enter the 6-digit code it shows for GoKart Admin.</li>
        </ol>
        <details className="rounded-lg border border-line bg-white px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-navy">
            Can't scan? Enter a setup key instead
          </summary>
          <p className="m-0 mt-2 text-xs text-muted">
            In the app, choose “Enter a setup key”, use <b>GoKart Admin</b> as the name and this key
            (time-based):
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-slate-100 px-2 py-1 font-mono text-[13px] tracking-wider break-all text-ink">
              {start.data.manualKey}
            </code>
            <CopyButton text={start.data.manualKey.replace(/\s/g, "")} label="Copy key" />
          </div>
        </details>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          6-digit code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="h-11 rounded-lg border border-line bg-white px-3 text-lg font-bold tracking-[0.3em] text-ink outline-none focus:border-gold focus:ring-3 focus:ring-gold/15"
          />
        </label>
        {error && <p className="m-0 text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={code.length !== 6 || confirm.isPending}
            className={btn.gold}
          >
            {confirm.isPending ? "Checking…" : "Turn on"}
          </button>
          <button type="button" onClick={cancel} className={btn.plain}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}

/** The 10 backup codes, shown once. The member confirms they've saved them. */
function RecoveryCodesSheet({ codes, done }: { codes: string[]; done: () => void }) {
  const [saved, setSaved] = useState(false)
  const text = `GoKart Admin backup codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "gokart-backup-codes.txt"
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Box>
      <div className="flex items-start gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-lg bg-white text-gold">
          <KeyRound size={19} />
        </span>
        <div>
          <b className="block">Save your backup codes</b>
          <p className="m-0 mt-1 leading-relaxed text-muted">
            If you lose your phone, sign in with one of these instead of the app. Each code works
            once, and they won't be shown again.
          </p>
        </div>
      </div>
      <ol
        aria-label="Backup codes"
        className="m-0 grid list-none grid-cols-2 gap-2 rounded-lg border border-line bg-white p-3 font-mono text-[15px] tracking-wider sm:grid-cols-5"
      >
        {codes.map((c) => (
          <li key={c} className="text-center text-ink">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={codes.join("\n")} label="Copy all" />
        <button
          type="button"
          onClick={download}
          className={`${btn.plain} inline-flex items-center gap-2`}
        >
          <Download size={15} /> Download .txt
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-[#cb9015]"
        />
        I've saved these codes somewhere safe
      </label>
      <div>
        <button type="button" disabled={!saved} onClick={done} className={btn.navy}>
          Done
        </button>
      </div>
    </Box>
  )
}

function ManageAuthenticator({
  close,
  newCodes,
}: {
  close: () => void
  newCodes: (codes: string[]) => void
}) {
  const client = useQueryClient()
  const [action, setAction] = useState<"codes" | "off" | null>(null)
  const [password, setPassword] = useState("")
  const regenerate = useMutation({
    mutationFn: () => api("post", "/auth/totp/recovery-codes", { body: { password } }),
    onSuccess: async (res) => {
      await client.invalidateQueries({ queryKey: meKey })
      newCodes(res.recoveryCodes)
    },
  })
  const disable = useMutation({
    mutationFn: () => api("post", "/auth/totp/disable", { body: { password } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: meKey })
      close()
    },
  })
  const run = action === "off" ? disable : regenerate
  const error = errorText(run.error)

  return (
    <Box tone="slate">
      {!action ? (
        <>
          <p className="m-0 leading-relaxed text-muted">
            Lost or changed your phone? Turn the app off, then set it up again on the new phone.
            Running low on backup codes? Make a new set; the old ones stop working.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAction("codes")} className={btn.plain}>
              Get new backup codes
            </button>
            <button type="button" onClick={() => setAction("off")} className={btn.danger}>
              Turn off authenticator app
            </button>
            <button type="button" onClick={close} className={btn.plain}>
              Close
            </button>
          </div>
        </>
      ) : (
        <form
          method="post"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (password) run.mutate()
          }}
        >
          <b>{action === "off" ? "Turn off the authenticator app" : "Get new backup codes"}</b>
          <p className="m-0 leading-relaxed text-muted">
            {action === "off"
              ? "You'll still be able to sign in with an email or SMS code. Your backup codes will stop working."
              : "Your current backup codes will stop working."}{" "}
            Enter your password to continue.
          </p>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-gold focus:ring-3 focus:ring-gold/15"
            />
          </label>
          {error && <p className="m-0 text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!password || run.isPending}
              className={action === "off" ? btn.danger : btn.navy}
            >
              {run.isPending ? "Checking…" : action === "off" ? "Turn off" : "Create new codes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAction(null)
                setPassword("")
                run.reset()
              }}
              className={btn.plain}
            >
              Back
            </button>
          </div>
        </form>
      )}
    </Box>
  )
}
