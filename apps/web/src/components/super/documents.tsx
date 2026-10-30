"use client"
// Documents panel for the Super Admin vendor and partner drawers: one row per expected
// document, with view, upload / replace and verify.
import { ApiError } from "@zoauro/api-client"
import { documentKindLabel, type StoredDocument } from "@zoauro/shared"
import { Eye, FileText, ShieldCheck, UploadCloud } from "lucide-react"
import { useRef, useState } from "react"
import {
  ACCEPT,
  documentUrl,
  fileProblem,
  sizeLabel,
  useUploadDocument,
  useVerifyDocument,
  type DocumentOwner,
  type useWizardUploads,
} from "@/lib/documents"
import { dateTimeLabel } from "@/lib/vendors"
import { Badge, Button, Panel } from "./ui"

export function DocumentsPanel({
  owner,
  id,
  kinds,
  documents,
  canUpload,
  canVerify,
  onChanged,
}: {
  owner: DocumentOwner
  id: string
  /** The documents this record should have, in display order. */
  kinds: readonly string[]
  documents: StoredDocument[]
  canUpload: boolean
  canVerify: boolean
  onChanged?: (message: string) => void
}) {
  const upload = useUploadDocument(owner, id)
  const verify = useVerifyDocument(owner, id)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ kind: string; message: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<string>("")
  // Anything stored under a kind this screen doesn't list still shows, at the end.
  const rows = [...kinds, ...documents.map((d) => d.kind).filter((k) => !kinds.includes(k))]
  const label = (k: string) => documentKindLabel[k as keyof typeof documentKindLabel] ?? k

  function pick(kind: string) {
    target.current = kind
    setError(null)
    input.current?.click()
  }

  function picked(file: File | undefined) {
    if (input.current) input.current.value = ""
    const kind = target.current
    if (!file || !kind) return
    const problem = fileProblem(file)
    if (problem) return setError({ kind, message: problem })
    setBusy(kind)
    upload.mutate(
      { kind, file },
      {
        onSuccess: () => onChanged?.(`${label(kind)} uploaded`),
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
    <Panel title="Documents" subtitle="PDF, JPG or PNG up to 10 MB. Each file is verified by hand.">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => picked(e.target.files?.[0])}
      />
      <div className="doc-list">
        {rows.map((kind) => {
          const d = documents.find((x) => x.kind === kind)
          return (
            <div className="doc-row" key={kind}>
              <FileText size={18} />
              <span>
                <b>{label(kind)}</b>
                <small>
                  {d
                    ? [d.fileName, sizeLabel(d.sizeBytes), dateTimeLabel(d.uploadedAt)]
                        .filter(Boolean)
                        .join(" · ")
                    : "Not uploaded"}
                </small>
                {error?.kind === kind && (
                  <em className="rejection-error" role="alert">
                    {error.message}
                  </em>
                )}
              </span>
              <Badge tone={!d ? "neutral" : d.verified ? "success" : "warning"}>
                {!d ? "Missing" : d.verified ? "Verified" : "Pending verification"}
              </Badge>
              <div className="doc-actions">
                {d && (
                  <a
                    className="btn"
                    href={documentUrl(owner, id, d.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Eye size={15} /> View
                  </a>
                )}
                {canUpload && (
                  <Button icon={UploadCloud} disabled={busy === kind} onClick={() => pick(kind)}>
                    {busy === kind ? "Uploading…" : d ? "Replace" : "Upload"}
                  </Button>
                )}
                {canVerify && d && (
                  <Button
                    icon={ShieldCheck}
                    success={!d.verified}
                    disabled={verify.isPending}
                    onClick={() =>
                      verify.mutate(
                        { docId: d.id, verified: !d.verified },
                        {
                          onSuccess: () =>
                            onChanged?.(
                              d.verified
                                ? `${label(kind)} marked unverified`
                                : `${label(kind)} verified`,
                            ),
                        },
                      )
                    }
                  >
                    {d.verified ? "Unverify" : "Verify"}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/** A document card in an onboarding wizard: pick a file now, uploaded on submit. */
export function UploadCard({
  title,
  hint,
  file,
  error,
  onPick,
  onRemove,
}: {
  title: string
  hint: string
  file: File | undefined
  error: string | undefined
  onPick: (file: File | undefined) => void
  onRemove: () => void
}) {
  return (
    <div className={`upload-card${file ? " picked" : ""}`}>
      <UploadCloud />
      <b>{title}</b>
      <small>
        {file ? `${file.name} · ${sizeLabel(file.size)}` : `${hint} · PDF, JPG or PNG · Max 10MB`}
      </small>
      {error && (
        <em className="rejection-error" role="alert">
          {error}
        </em>
      )}
      <div className="doc-actions">
        <label className="btn">
          <input
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => (onPick(e.target.files?.[0]), (e.target.value = ""))}
          />
          {file ? "Change file" : "Choose file"}
        </label>
        {file && <Button onClick={onRemove}>Remove</Button>}
      </div>
      <Badge tone={file ? "warning" : "neutral"}>
        {file ? "Uploads on submit" : "Not uploaded"}
      </Badge>
    </div>
  )
}

/** After a wizard submits: what happened to the files it picked. */
export function UploadSummary({
  uploads,
  owner,
}: {
  uploads: ReturnType<typeof useWizardUploads>
  owner: "vendor" | "partner"
}) {
  if (uploads.status === "idle" || (uploads.status === "done" && !uploads.result)) return null
  if (uploads.status === "uploading")
    return <p className="upload-summary">Uploading {uploads.count} documents…</p>
  const { uploaded, failed } = uploads.result!
  return (
    <p className={`upload-summary${failed.length ? " failed" : ""}`} role="status">
      {uploaded > 0 && `${uploaded} ${uploaded === 1 ? "document" : "documents"} uploaded. `}
      {failed.length > 0 &&
        `${failed.map((f) => documentKindLabel[f.kind as keyof typeof documentKindLabel] ?? f.kind).join(", ")} didn't upload (${failed[0]!.message}). Add ${failed.length === 1 ? "it" : "them"} from the ${owner}'s documents.`}
    </p>
  )
}
