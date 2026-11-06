"use client"

import { Check, FileText, Upload } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/** Numbered progress for the delivery boy onboarding steps. Finished steps can be revisited. */
export function RiderStepper({
  steps,
  step,
  onSelect,
}: {
  steps: readonly string[]
  step: number
  onSelect: (index: number) => void
}) {
  return (
    <ol className="rf-stepper" aria-label="Delivery boy onboarding steps">
      {steps.map((label, index) => {
        const state = index < step ? "done" : index === step ? "current" : "todo"
        return (
          <li key={label} className={`rf-step ${state}`}>
            <button
              type="button"
              disabled={index >= step}
              aria-current={index === step ? "step" : undefined}
              onClick={() => onSelect(index)}
            >
              <b>{state === "done" ? <Check size={14} /> : index + 1}</b>
              <span>{label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** A titled card that groups related fields, with a one-line hint under the title. */
export function RiderSection({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="rf-section">
      <header>
        <i>
          <Icon size={18} />
        </i>
        <div>
          <h3>{title}</h3>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

/** A document upload tile: shows what is needed, then the chosen file. */
export function RiderFileTile({
  label,
  required,
  file,
  error,
  onFile,
}: {
  label: string
  required?: boolean
  file?: File | undefined
  error?: string | undefined
  onFile: (file: File) => void
}) {
  return (
    <label className={`rf-file${file ? " chosen" : ""}${error ? " invalid" : ""}`}>
      <i>{file ? <FileText size={18} /> : <Upload size={18} />}</i>
      <span>
        <b>
          {label}
          {required ? " *" : ""}
        </b>
        <small>{file ? file.name : "PDF, JPG or PNG"}</small>
        {error && <em>{error}</em>}
      </span>
      <u>{file ? "Replace" : "Choose file"}</u>
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={(event) => {
          const picked = event.target.files?.[0]
          if (picked) onFile(picked)
        }}
      />
    </label>
  )
}

export type ReviewCard = {
  icon: LucideIcon
  title: string
  rows: [label: string, value: string | undefined][]
  /** Step to jump back to when the person wants to change this part. */
  step?: number
}

/** The last step: what will be submitted, grouped in cards, each with a way back to fix it. */
export function RiderReviewCards({
  cards,
  onEdit,
}: {
  cards: ReviewCard[]
  onEdit?: (step: number) => void
}) {
  return (
    <div className="rf-review">
      {cards.map(({ icon: Icon, title, rows, step }) => (
        <article key={title}>
          <header>
            <i>
              <Icon size={16} />
            </i>
            <strong>{title}</strong>
            {onEdit && step !== undefined && (
              <button type="button" onClick={() => onEdit(step)}>
                Edit
              </button>
            )}
          </header>
          <dl>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={value ? undefined : "empty"}>{value || "Not given"}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  )
}
