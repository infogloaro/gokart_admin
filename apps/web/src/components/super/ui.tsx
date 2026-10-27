"use client"
// Super Admin design components, using the prototype's class names (super.css).
import * as Dialog from "@radix-ui/react-dialog"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon
  primary?: boolean
  danger?: boolean
  success?: boolean
}

export function Button({
  children,
  icon: Icon,
  primary,
  danger,
  success,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = ["btn", primary && "primary", danger && "danger", success && "success", className]
    .filter(Boolean)
    .join(" ")
  return (
    <button type={type} className={cls} {...rest}>
      {Icon && <Icon size={16} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  badgeCount,
  dot,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
  badgeCount?: number
  dot?: boolean
}) {
  return (
    <button type="button" className="icon-btn" title={label} aria-label={label} {...rest}>
      <Icon size={18} />
      {(dot || Boolean(badgeCount)) && (
        <i className={badgeCount ? "count" : ""}>{badgeCount || ""}</i>
      )}
    </button>
  )
}

export function Input({
  label,
  icon: Icon,
  error,
  trailing,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  icon?: LucideIcon
  error?: string | undefined
  trailing?: ReactNode
}) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <div className={error ? "control invalid" : "control"}>
        {Icon && <Icon size={16} />}
        <input aria-invalid={Boolean(error)} {...rest} />
        {trailing}
      </div>
      {error && <em>{error}</em>}
    </label>
  )
}

export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <div className="control">
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {children}
        </select>
        <ChevronDown size={15} />
      </div>
    </label>
  )
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="logo">
      <b>G</b>
      {!compact && (
        <strong>
          GO<span>KART</span>
        </strong>
      )}
    </div>
  )
}

/** Radix Dialog with the prototype's markup. Rendered in place (no portal) so the
 *  portal's scoped styles (.super-ui …) still apply. */
export function Modal({
  title,
  subtitle,
  children,
  close,
  wide,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  close: () => void
  wide?: boolean
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Overlay className="overlay">
        <Dialog.Content className={`modal ${wide ? "wide" : ""}`} aria-describedby={undefined}>
          <header>
            <div>
              <Dialog.Title asChild>
                <strong>{title}</strong>
              </Dialog.Title>
              {subtitle && <span>{subtitle}</span>}
            </div>
            <Dialog.Close asChild>
              <IconButton icon={X} label="Close" />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  )
}

export function ErrorBox({ children, icon: Icon }: { children: ReactNode; icon: LucideIcon }) {
  return (
    <div className="error" role="alert">
      <Icon size={17} />
      {children}
    </div>
  )
}

export function Panel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="panel">
      <header>
        <div>
          <b>{title}</b>
          {subtitle && <small>{subtitle}</small>}
        </div>
      </header>
      {children}
    </section>
  )
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((x) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === x}
          className={value === x ? "active" : ""}
          onClick={() => onChange(x)}
          key={x}
        >
          {x}
        </button>
      ))}
    </div>
  )
}

/** Side drawer with the prototype's markup (.drawer-overlay > .drawer), on Radix Dialog
 *  for Escape, focus trapping and outside-click closing. */
export function Drawer({
  label,
  className = "",
  children,
  close,
}: {
  label: string
  className?: string
  children: ReactNode
  close: () => void
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Overlay className="drawer-overlay">
        <Dialog.Content className={`drawer ${className}`} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  )
}

/** A label and value in the approval drawer's two-column sections. */
export function Value({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="approval-value">
      <small>{label}</small>
      <b>{value || "—"}</b>
    </span>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="approval-section">
      <strong>{title}</strong>
      <div>{children}</div>
    </section>
  )
}

export type ToastTone = "success" | "progress" | "warning" | "error"
export type ToastMessage = { tone: ToastTone; title: string; message: string }

const toastIcon: Record<ToastTone, LucideIcon> = {
  success: CheckCircle2,
  progress: Loader2,
  warning: AlertTriangle,
  error: XCircle,
}

/** The prototype's bottom-right notification ("Done · Your CSV export is being prepared."). */
export function Toast({ toast, close }: { toast: ToastMessage; close: () => void }) {
  const Icon = toastIcon[toast.tone]
  return (
    <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
      <Icon size={22} />
      <span>
        <b>{toast.title}</b>
        {toast.message}
      </span>
      <IconButton icon={X} label="Dismiss" onClick={close} />
    </div>
  )
}
