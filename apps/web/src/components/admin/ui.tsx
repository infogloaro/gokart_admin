// Admin portal design components, using the prototype's class names (admin.css).
import type { LucideIcon } from "lucide-react"
import type { ButtonHTMLAttributes, ReactNode } from "react"

export function AdminBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <span>G</span>
      </div>
      {!compact && (
        <div>
          <strong>GOKART</strong>
          <small>OPERATIONS HUB</small>
        </div>
      )}
    </div>
  )
}

export function AdminButton({
  children,
  kind = "primary",
  icon: Icon,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "secondary" | "ghost" | "danger"
  icon?: LucideIcon
}) {
  return (
    <button className={`btn btn-${kind}`} type={type} {...rest}>
      {Icon && <Icon className="icon" size={17} />}
      <span>{children}</span>
    </button>
  )
}

export function AdminBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`badge badge-${tone}`}>
      <i />
      {children}
    </span>
  )
}

export function PageHeader({
  title,
  subtitle,
  note,
  children,
}: {
  title: string
  subtitle: string
  note?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        {note && <div className="demo-line">{note}</div>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  )
}
