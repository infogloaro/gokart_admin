"use client"
// Documents in the Admin portal's vendor and partner drawers. Admins view and upload;
// verifying a document is a Super Admin action.
import { ApiError } from "@zoauro/api-client"
import { documentKindLabel, type StoredDocument } from "@zoauro/shared"
import { Check, Eye, FileText, UploadCloud } from "lucide-react"
import { useRef, useState } from "react"
import {
  ACCEPT,
  documentUrl,
  fileProblem,
  sizeLabel,
  useUploadDocument,
  type DocumentOwner,
  type useWizardUploads,
} from "@/lib/documents"
import { AdminBadge } from "./ui"

export function AdminDocuments({
  owner,
  id,
  kinds,
  documents,
  canUpload,
}: {
  owner: DocumentOwner
  id: string
  kinds: readonly string[]
  documents: StoredDocument[]
  canUpload: boolean
}) {
  const upload = useUploadDocument(owner, id)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ kind: string; message: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const target = useRef("")
  const rows = [...kinds, ...documents.map((d) => d.kind).filter((k) => !kinds.includes(k))]
  const label = (k: string) => documentKindLabel[k as keyof typeof documentKindLabel] ?? k

  function picked(file: File | undefined) {
    if (input.current) input.current.value = ""
    const kind = target.current
    if (!file || !kind) return
    const problem = fileProblem(file)
    if (problem) return setError({ kind, message: problem })
    setError(null)
    setBusy(kind)
    upload.mutate(
      { kind, file },
      {
        onError: (e) =>
          setError({
            kind,
            message: e instanceof ApiError ? e.message : "Couldn't upload the file.",
          }),
        onSettled: () => setBusy(null),
      },
    )
  }

  return (
    <section className="drawer-section">
      <h3>Documents</h3>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => picked(e.target.files?.[0])}
      />
      {rows.map((kind) => {
        const d = documents.find((x) => x.kind === kind)
        return (
          <div className="item-row" key={kind}>
            <span className="item-thumb">
              <FileText className="icon" size={20} />
            </span>
            <div>
              <strong>{label(kind)}</strong>
              <small>
                {d
                  ? [d.fileName, sizeLabel(d.sizeBytes)].filter(Boolean).join(" · ")
                  : "Not uploaded"}
              </small>
              {error?.kind === kind && (
                <small className="doc-error" role="alert">
                  {error.message}
                </small>
              )}
            </div>
            <AdminBadge tone={!d ? "neutral" : d.verified ? "success" : "warning"}>
              {!d ? "Missing" : d.verified ? "Verified" : "Pending"}
            </AdminBadge>
            <div className="doc-actions">
              {d && (
                <a href={documentUrl(owner, id, d.id)} target="_blank" rel="noopener noreferrer">
                  <Eye className="icon" size={14} /> View
                </a>
              )}
              {canUpload && (
                <button
                  type="button"
                  disabled={busy === kind}
                  onClick={() => ((target.current = kind), input.current?.click())}
                >
                  <UploadCloud className="icon" size={14} />
                  {busy === kind ? "Uploading…" : d ? "Replace" : "Upload"}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** The prototype's onboarding upload card: pick a file now, uploaded on submit. */
export function AdminUploadCard({
  title,
  subtitle,
  file,
  error,
  onPick,
}: {
  title: string
  subtitle: string
  file: File | undefined
  error: string | undefined
  onPick: (file: File | undefined) => void
}) {
  return (
    <label className="upload-card">
      <input
        type="file"
        accept={ACCEPT}
        onChange={(e) => (onPick(e.target.files?.[0]), (e.target.value = ""))}
      />
      <span>
        {file ? <Check className="icon" size={18} /> : <UploadCloud className="icon" size={18} />}
      </span>
      <div>
        <strong>{file ? file.name : title}</strong>
        <small className={error ? "doc-error" : undefined}>
          {error ?? (file ? `${sizeLabel(file.size)} · uploads when you submit` : subtitle)}
        </small>
      </div>
      <b>{file ? "Replace" : "Browse"}</b>
    </label>
  )
}

/** After the wizard submits: what happened to the files it picked. */
export function AdminUploadSummary({ uploads }: { uploads: ReturnType<typeof useWizardUploads> }) {
  if (uploads.status === "idle" || (uploads.status === "done" && !uploads.result)) return null
  if (uploads.status === "uploading") return <p>Uploading {uploads.count} documents…</p>
  const { uploaded, failed } = uploads.result!
  return (
    <p role="status" className={failed.length ? "doc-error" : undefined}>
      {uploaded > 0 && `${uploaded} ${uploaded === 1 ? "document" : "documents"} uploaded. `}
      {failed.length > 0 &&
        `${failed.length} didn't upload (${failed[0]!.message}). Add them from the partner's profile.`}
    </p>
  )
}
