"use client"
// Vendor and partner documents: upload (raw file body), view and verify.
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@zoauro/api-client"
import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPES, type StoredDocument } from "@zoauro/shared"
import { useState } from "react"

export type DocumentOwner = "vendors" | "partners"

export const ACCEPT = DOCUMENT_TYPES.join(",")

/** Checks a picked file before sending it; returns an error message or null. */
export function fileProblem(file: File): string | null {
  if (!(DOCUMENT_TYPES as readonly string[]).includes(file.type))
    return "Choose a PDF, JPG or PNG file."
  if (file.size > DOCUMENT_MAX_BYTES) return "Files can be at most 10 MB."
  if (file.size === 0) return "That file is empty."
  return null
}

/** The typed client only sends JSON, so uploads use fetch with the file as the body. */
export async function uploadDocument(
  owner: DocumentOwner,
  id: string,
  kind: string,
  file: File,
): Promise<StoredDocument> {
  const problem = fileProblem(file)
  if (problem) throw new ApiError(400, "bad_request", problem)
  const res = await fetch(`/api/v1/${owner}/${encodeURIComponent(id)}/documents/${kind}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": file.type, "x-file-name": encodeURIComponent(file.name) },
    body: file,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(
      res.status,
      e?.code ?? "http_error",
      e?.message ??
        (res.status === 413 ? "That file is too large." : `Upload failed (${res.status})`),
      e?.fields,
    )
  }
  return data as StoredDocument
}

export const documentUrl = (owner: DocumentOwner, id: string, docId: string) =>
  `/api/v1/${owner}/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/file`

export function useUploadDocument(owner: DocumentOwner, id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { kind: string; file: File }) => uploadDocument(owner, id, v.kind, v.file),
    onSettled: () => client.invalidateQueries({ queryKey: [owner, "detail", id] }),
  })
}

export function useVerifyDocument(owner: DocumentOwner, id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { docId: string; verified: boolean }) =>
      owner === "vendors"
        ? api("post", "/vendors/{id}/documents/{docId}/verify", {
            params: { id, docId: v.docId },
            body: { verified: v.verified },
          })
        : api("post", "/partners/{id}/documents/{docId}/verify", {
            params: { id, docId: v.docId },
            body: { verified: v.verified },
          }),
    onSettled: () => client.invalidateQueries({ queryKey: [owner, "detail", id] }),
  })
}

export const sizeLabel = (bytes: number | null) =>
  bytes === null
    ? ""
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export type UploadResult = { uploaded: number; failed: { kind: string; message: string }[] }

/**
 * Files picked in an onboarding wizard. The record doesn't exist until the wizard is
 * submitted, so the files upload right after it's created.
 */
export function useWizardUploads(owner: DocumentOwner) {
  const [files, setFiles] = useState<Record<string, File>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle")
  const [result, setResult] = useState<UploadResult | null>(null)

  function choose(kind: string, file: File | undefined) {
    if (!file) return
    const problem = fileProblem(file)
    setErrors((e) => {
      const next = { ...e }
      if (problem) next[kind] = problem
      else delete next[kind]
      return next
    })
    if (!problem) setFiles((f) => ({ ...f, [kind]: file }))
  }

  function remove(kind: string) {
    setFiles((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== kind)))
  }

  async function uploadAll(id: string) {
    const entries = Object.entries(files)
    if (!entries.length) return setStatus("done")
    setStatus("uploading")
    const failed: UploadResult["failed"] = []
    let uploaded = 0
    for (const [kind, file] of entries)
      try {
        await uploadDocument(owner, id, kind, file)
        uploaded++
      } catch (e) {
        failed.push({ kind, message: e instanceof ApiError ? e.message : "Upload failed" })
      }
    setResult({ uploaded, failed })
    setStatus("done")
  }

  return {
    files,
    errors,
    status,
    result,
    choose,
    remove,
    uploadAll,
    count: Object.keys(files).length,
  }
}
