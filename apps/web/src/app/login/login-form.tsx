"use client"
// Sign-in in three steps:
// 1. Email or mobile number + password (tabs).
// 2. Choose how to verify: email code, SMS code or authenticator app.
// 3. Enter the 6-digit code (or, with an authenticator app, a one-time backup code).

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@zoauro/api-client"
import {
  EmailLogin,
  mfaMethodName,
  OTP_LENGTH,
  PhoneLogin,
  RecoveryCode,
  type CodeSent,
  type LoginChallenge,
  type Me,
  type MfaMethod,
} from "@zoauro/shared"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  Mail,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { useForm, type UseFormRegisterReturn } from "react-hook-form"
import type { z } from "zod"
import { LoginBento } from "@/components/login-bento"
import { Badge, Button, ErrorBox, Input, Modal } from "@/components/super/ui"
import { meKey } from "@/lib/session"

const message = (e: unknown) =>
  e instanceof ApiError
    ? e.message
    : "We couldn't reach the server. Check your connection and try again."

const methodIcon: Record<MfaMethod, LucideIcon> = {
  email: Mail,
  sms: MessageSquareText,
  totp: Smartphone,
}

function DevNote({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") return null
  return (
    <div className="prototype">
      <ShieldCheck size={17} />
      <span>
        <b>Development environment</b>
        {children}
      </span>
    </div>
  )
}

/** Bento brand tiles on the left; the current step on the right over drifting light. */
function LoginShell({ children }: { children: ReactNode }) {
  // Forms post, so credentials never go into the address bar; if an older link or a submit
  // before the page loaded put them there, take them out of the URL and history.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has("password") || url.searchParams.has("email")) {
      url.searchParams.delete("password")
      url.searchParams.delete("email")
      window.history.replaceState(null, "", url.pathname + url.search)
    }
  }, [])
  return (
    <main className="login login-bento">
      <LoginBento />
      <section className="login-panel">
        <div className="login-ambient" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        {children}
      </section>
    </main>
  )
}

type Step =
  | { name: "credentials" }
  | { name: "method"; challenge: LoginChallenge }
  | { name: "code"; challenge: LoginChallenge; sent: CodeSent }

export function LoginForm() {
  const [step, setStep] = useState<Step>({ name: "credentials" })
  if (step.name === "method")
    return (
      <MethodStep
        challenge={step.challenge}
        back={() => setStep({ name: "credentials" })}
        onSent={(sent) => setStep({ name: "code", challenge: step.challenge, sent })}
      />
    )
  if (step.name === "code")
    return (
      <CodeStep
        challenge={step.challenge}
        sent={step.sent}
        back={() => setStep({ name: "credentials" })}
        otherMethod={() => setStep({ name: "method", challenge: step.challenge })}
      />
    )
  return <CredentialsStep onChallenge={(challenge) => setStep({ name: "method", challenge })} />
}

// ---------- step 1: email or mobile number + password ----------

type Via = "email" | "phone"

function CredentialsStep({ onChallenge }: { onChallenge: (c: LoginChallenge) => void }) {
  const [via, setVia] = useState<Via>("email")
  const [forgot, setForgot] = useState(false)
  // Reopen the tab used last time (after mount, so server and browser render the same first).
  useEffect(() => {
    try {
      if (localStorage.getItem("gokart-login-via") === "phone") setVia("phone")
    } catch {
      // Storage blocked: start on Email.
    }
  }, [])
  const choose = (v: Via) => {
    setVia(v)
    try {
      localStorage.setItem("gokart-login-via", v)
    } catch {
      // Storage blocked: the tab just isn't remembered.
    }
  }

  return (
    <LoginShell>
      <div className="login-form">
        <Badge tone="gold">
          <ShieldCheck size={14} /> SECURE ADMIN ACCESS
        </Badge>
        <div className="login-title">Sign in</div>
        <p>Welcome back to your Super Admin or Admin workspace.</p>
        <div className="login-tabs" role="tablist" aria-label="Sign in with" data-active={via}>
          {(
            [
              ["email", "Email", Mail],
              ["phone", "Mobile number", Smartphone],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={via === v}
              className={via === v ? "active" : ""}
              onClick={() => choose(v)}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        {via === "email" ? (
          <EmailForm onChallenge={onChallenge} forgot={() => setForgot(true)} />
        ) : (
          <PhoneForm onChallenge={onChallenge} forgot={() => setForgot(true)} />
        )}
        <DevNote>
          Accounts and passwords are in apps/api/prisma/seed.ts. Email and SMS codes both arrive in
          Mailpit at localhost:8025.
        </DevNote>
        <p>
          Delivery partner? <Link href="/delivery-partner">Open the partner portal</Link>
        </p>
      </div>
      {forgot && <ForgotPassword close={() => setForgot(false)} />}
    </LoginShell>
  )
}

function PasswordField(props: {
  error: string | undefined
  field: UseFormRegisterReturn<"password">
}) {
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  return (
    <>
      <Input
        label="Password"
        icon={LockKeyhole}
        type={show ? "text" : "password"}
        autoComplete="current-password"
        error={props.error}
        onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
        {...props.field}
        trailing={
          <button
            type="button"
            className="plain"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        }
      />
      {caps && (
        <small className="caps-warning" role="status">
          <AlertTriangle size={13} /> Caps Lock is on
        </small>
      )}
    </>
  )
}

function useLogin(onChallenge: (c: LoginChallenge) => void) {
  return useMutation({
    mutationFn: (body: z.output<typeof EmailLogin> | z.output<typeof PhoneLogin>) =>
      api("post", "/auth/login", { body }),
    onSuccess: onChallenge,
  })
}

function FormFooter({ pending, forgot }: { pending: boolean; forgot: () => void }) {
  return (
    <>
      <div className="login-options">
        <span />
        <button type="button" className="link" onClick={forgot}>
          Forgot password?
        </button>
      </div>
      <Button type="submit" primary disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
    </>
  )
}

function EmailForm({
  onChallenge,
  forgot,
}: {
  onChallenge: (c: LoginChallenge) => void
  forgot: () => void
}) {
  const form = useForm<z.input<typeof EmailLogin>, unknown, z.output<typeof EmailLogin>>({
    resolver: zodResolver(EmailLogin),
    defaultValues: { email: "", password: "" },
  })
  const login = useLogin(onChallenge)
  const e = form.formState.errors
  return (
    <form method="post" onSubmit={form.handleSubmit((v) => login.mutate(v))} noValidate>
      {login.isError && <ErrorBox icon={AlertTriangle}>{message(login.error)}</ErrorBox>}
      <Input
        label="Email address"
        icon={Users}
        type="email"
        autoComplete="username"
        placeholder="you@gokart.in"
        error={e.email?.message}
        {...form.register("email")}
      />
      <PasswordField error={e.password?.message} field={form.register("password")} />
      <FormFooter pending={login.isPending} forgot={forgot} />
    </form>
  )
}

function PhoneForm({
  onChallenge,
  forgot,
}: {
  onChallenge: (c: LoginChallenge) => void
  forgot: () => void
}) {
  const form = useForm<z.input<typeof PhoneLogin>, unknown, z.output<typeof PhoneLogin>>({
    resolver: zodResolver(PhoneLogin),
    defaultValues: { phone: "", password: "" },
  })
  const login = useLogin(onChallenge)
  const e = form.formState.errors
  return (
    <form method="post" onSubmit={form.handleSubmit((v) => login.mutate(v))} noValidate>
      {login.isError && <ErrorBox icon={AlertTriangle}>{message(login.error)}</ErrorBox>}
      <Input
        label="Mobile number"
        icon={Smartphone}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98400 12345"
        error={e.phone?.message}
        trailing={<span className="phone-prefix">+91</span>}
        {...form.register("phone")}
      />
      <PasswordField error={e.password?.message} field={form.register("password")} />
      <FormFooter pending={login.isPending} forgot={forgot} />
    </form>
  )
}

function ForgotPassword({ close }: { close: () => void }) {
  const [email, setEmail] = useState("")
  const reset = useMutation({
    mutationFn: () => api("post", "/auth/forgot-password", { body: { email } }),
  })
  return (
    <Modal
      title="Reset admin access"
      subtitle="We'll email the administrator address with next steps."
      close={close}
    >
      <div className="modal-body">
        {reset.isSuccess ? (
          <p>If {email} belongs to an active admin, an email is on its way.</p>
        ) : (
          <>
            {reset.isError && <ErrorBox icon={AlertTriangle}>{message(reset.error)}</ErrorBox>}
            <Input
              label="Administrator email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        )}
      </div>
      <footer>
        <Button onClick={close}>{reset.isSuccess ? "Close" : "Cancel"}</Button>
        {!reset.isSuccess && (
          <Button primary disabled={reset.isPending || !email} onClick={() => reset.mutate()}>
            Send reset email
          </Button>
        )}
      </footer>
    </Modal>
  )
}

// ---------- step 2: choose how to verify ----------

function MethodStep({
  challenge,
  back,
  onSent,
}: {
  challenge: LoginChallenge
  back: () => void
  onSent: (sent: CodeSent) => void
}) {
  const [method, setMethod] = useState<MfaMethod>(challenge.preferred)
  const send = useMutation({
    mutationFn: () =>
      api("post", "/auth/send-code", { body: { challengeId: challenge.challengeId, method } }),
    onSuccess: onSent,
  })

  return (
    <LoginShell>
      <form
        method="post"
        onSubmit={(e) => {
          e.preventDefault()
          send.mutate()
        }}
      >
        <Badge tone="gold">
          <KeyRound size={14} /> TWO-STEP VERIFICATION
        </Badge>
        <div className="login-title">Verify it's you</div>
        <p>Choose how you'd like to receive your {OTP_LENGTH}-digit code.</p>
        {send.isError && <ErrorBox icon={AlertTriangle}>{message(send.error)}</ErrorBox>}
        <div className="mfa-options" role="radiogroup" aria-label="Verification method">
          {challenge.options.map((o) => {
            const Icon = methodIcon[o.method]
            const selected = method === o.method
            return (
              <button
                key={o.method}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${mfaMethodName[o.method]}: ${o.available ? o.destination : o.note}`}
                disabled={!o.available}
                className={`mfa-option ${selected ? "selected" : ""}`}
                onClick={() => setMethod(o.method)}
              >
                <i>
                  <Icon size={19} />
                </i>
                <span>
                  <b>
                    {mfaMethodName[o.method]}
                    {o.method === challenge.preferred && o.available && <em>Matches sign-in</em>}
                  </b>
                  <small>{o.available ? o.destination : o.note}</small>
                </span>
                {selected && <CheckCircle2 size={18} className="mfa-check" />}
              </button>
            )
          })}
        </div>
        <Button type="submit" primary disabled={send.isPending}>
          {send.isPending ? "Sending…" : method === "totp" ? "Continue" : "Send code"}
        </Button>
        <div className="login-options">
          <button type="button" className="link" onClick={back}>
            <ArrowLeft size={14} /> Back to sign in
          </button>
          <span />
        </div>
      </form>
    </LoginShell>
  )
}

// ---------- step 3: enter the code ----------

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft] as const
}

/** What happens once the second step passes: remember the member and open the workspace. */
function useSignedIn() {
  const router = useRouter()
  const client = useQueryClient()
  return (me: Me) => {
    client.setQueryData(meKey, me)
    try {
      sessionStorage.setItem("gokart-login-toast", "1")
    } catch {
      // Storage blocked: skip the welcome toast.
    }
    router.replace("/workspace")
  }
}

/** Signing in with one of the 10 one-time backup codes instead of the authenticator app. */
function BackupCodeStep({
  challenge,
  switchToApp,
  back,
}: {
  challenge: LoginChallenge
  switchToApp: () => void
  back: () => void
}) {
  const signedIn = useSignedIn()
  const form = useForm<{ recoveryCode: string }>({ defaultValues: { recoveryCode: "" } })
  const verify = useMutation({
    mutationFn: (recoveryCode: string) =>
      api("post", "/auth/verify-recovery", {
        body: { challengeId: challenge.challengeId, recoveryCode },
      }),
    onSuccess: signedIn,
    onError: () => form.setValue("recoveryCode", ""),
  })
  const expired =
    verify.error instanceof ApiError && (verify.error.status === 410 || verify.error.status === 429)

  return (
    <LoginShell>
      <form
        method="post"
        noValidate
        onSubmit={form.handleSubmit(({ recoveryCode }) => {
          const parsed = RecoveryCode.safeParse(recoveryCode)
          if (!parsed.success)
            return form.setError("recoveryCode", { message: parsed.error.issues[0]!.message })
          verify.mutate(parsed.data)
        })}
      >
        <Badge tone="gold">
          <LifeBuoy size={14} /> BACKUP CODE
        </Badge>
        <div className="login-title">Use a backup code</div>
        <p>
          Enter one of the backup codes you saved when you set up your authenticator app. Each code
          works once.
        </p>
        {verify.isError && <ErrorBox icon={AlertTriangle}>{message(verify.error)}</ErrorBox>}
        <Input
          label="Backup code"
          icon={KeyRound}
          placeholder="ABCD-2345"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          disabled={expired}
          error={form.formState.errors.recoveryCode?.message}
          {...form.register("recoveryCode")}
        />
        <Button type="submit" primary disabled={verify.isPending || expired}>
          {verify.isPending ? "Checking…" : "Verify & sign in"}
        </Button>
        <div className="login-options">
          <button type="button" className="link" onClick={back}>
            <ArrowLeft size={14} /> Back to sign in
          </button>
          <button type="button" className="link" onClick={switchToApp}>
            Use the authenticator app
          </button>
        </div>
      </form>
    </LoginShell>
  )
}

function CodeStep({
  challenge,
  sent: initialSent,
  back,
  otherMethod,
}: {
  challenge: LoginChallenge
  sent: CodeSent
  back: () => void
  otherMethod: () => void
}) {
  const signedIn = useSignedIn()
  const [backup, setBackup] = useState(false)
  const [sent, setSent] = useState(initialSent)
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""))
  const [localError, setLocalError] = useState("")
  const [resendIn, setResendIn] = useCountdown(initialSent.resendInSeconds)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  // The member just asked for a code, so start in the first box.
  useEffect(() => {
    if (!backup) refs.current[0]?.focus()
  }, [backup])

  const verify = useMutation({
    mutationFn: (code: string) =>
      api("post", "/auth/verify", { body: { challengeId: challenge.challengeId, code } }),
    onSuccess: signedIn,
    onError: () => {
      setOtp(Array(OTP_LENGTH).fill(""))
      refs.current[0]?.focus()
    },
  })
  const resend = useMutation({
    mutationFn: () => api("post", "/auth/resend", { body: { challengeId: challenge.challengeId } }),
    onSuccess: (s) => {
      setSent(s)
      setResendIn(s.resendInSeconds)
      verify.reset()
    },
  })

  const submitCode = (code: string) => {
    if (code.length < OTP_LENGTH) return setLocalError(`Enter the ${OTP_LENGTH}-digit code.`)
    setLocalError("")
    verify.mutate(code)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    submitCode(otp.join(""))
  }

  const setDigit = (i: number, value: string) => {
    const digits = value.replace(/\D/g, "")
    const next = [...otp]
    if (digits.length > 1) {
      // Pasting a full code fills the boxes from this one onward.
      digits
        .slice(0, OTP_LENGTH - i)
        .split("")
        .forEach((d, k) => (next[i + k] = d))
      refs.current[Math.min(i + digits.length, OTP_LENGTH - 1)]?.focus()
    } else {
      next[i] = digits
      if (digits && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus()
    }
    setOtp(next)
    // Submit as soon as the last digit is in.
    if (next.every(Boolean) && !verify.isPending) submitCode(next.join(""))
  }

  const error =
    localError ||
    (verify.isError ? message(verify.error) : resend.isError ? message(resend.error) : "")
  const expired =
    verify.error instanceof ApiError && (verify.error.status === 410 || verify.error.status === 429)
  const Icon = methodIcon[sent.method]

  if (backup)
    return <BackupCodeStep challenge={challenge} switchToApp={() => setBackup(false)} back={back} />

  return (
    <LoginShell>
      <form method="post" onSubmit={submit}>
        <Badge tone="gold">
          <KeyRound size={14} /> TWO-STEP VERIFICATION
        </Badge>
        <div className="login-title">Enter verification code</div>
        <p className="code-destination">
          <Icon size={16} />
          <span>
            {sent.method === "totp" ? (
              <>
                Open your authenticator app and enter the current {OTP_LENGTH}-digit code for GoKart
                Admin.
              </>
            ) : (
              <>
                We sent a {OTP_LENGTH}-digit code {sent.method === "sms" ? "by SMS" : "by email"} to{" "}
                <b>{sent.destination}</b>.
              </>
            )}
          </span>
        </p>
        {error && <ErrorBox icon={AlertTriangle}>{error}</ErrorBox>}
        <div className="otp-inputs">
          {otp.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              value={d}
              data-filled={d ? "true" : undefined}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1}`}
              maxLength={OTP_LENGTH}
              disabled={expired}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus()
              }}
            />
          ))}
        </div>
        <div className="login-options">
          <button type="button" className="link" onClick={otherMethod}>
            Use another method
          </button>
          {sent.method !== "totp" &&
            (resendIn > 0 ? (
              <span className="resend-wait">Resend code in {resendIn}s</span>
            ) : (
              <button
                type="button"
                className="link"
                disabled={resend.isPending}
                onClick={() => resend.mutate()}
              >
                Resend code
              </button>
            ))}
        </div>
        <Button type="submit" primary disabled={verify.isPending || expired}>
          {verify.isPending ? "Verifying…" : "Verify & sign in"}
        </Button>
        <div className="login-options">
          <button type="button" className="link" onClick={back}>
            <ArrowLeft size={14} /> Back to sign in
          </button>
          {sent.method === "totp" ? (
            <button type="button" className="link" onClick={() => setBackup(true)}>
              Lost your phone? Use a backup code
            </button>
          ) : (
            <span />
          )}
        </div>
        {sent.method !== "totp" && (
          <DevNote>
            {sent.method === "sms" ? "The SMS" : "The email"} is in Mailpit at localhost:8025, and
            the code is printed in the API terminal.
          </DevNote>
        )}
      </form>
    </LoginShell>
  )
}
