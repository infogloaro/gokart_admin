// Upload checks shared by vendor and partner documents.
import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPES, type StoredDocument } from "@zoauro/shared"
import { badRequest } from "./errors"

type DocumentType = (typeof DOCUMENT_TYPES)[number]

const extension: Record<DocumentType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
}

/** The first bytes each type must start with, so a renamed file can't pass as a PDF. */
const signature: Record<DocumentType, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
}

export type CheckedFile = {
  buffer: Buffer
  contentType: DocumentType
  fileName: string
  ext: string
}

/** Validates a raw upload body and returns it with a safe file name. */
export function checkUpload(
  body: unknown,
  contentType: string | undefined,
  rawName: string | undefined,
  fallbackName: string,
): CheckedFile {
  const type = (contentType ?? "").split(";")[0]!.trim().toLowerCase() as DocumentType
  if (!DOCUMENT_TYPES.includes(type))
    throw badRequest("Upload a PDF, JPG or PNG file.", { file: ["Unsupported file type"] })
  if (!Buffer.isBuffer(body) || body.length === 0)
    throw badRequest("The file is empty.", { file: ["Empty file"] })
  if (body.length > DOCUMENT_MAX_BYTES)
    throw badRequest("Files can be at most 10 MB.", { file: ["Too large"] })
  if (!signature[type].every((b, i) => body[i] === b))
    throw badRequest("The file doesn't match its type. Upload the original PDF, JPG or PNG.", {
      file: ["Content doesn't match type"],
    })

  let name = ""
  try {
    name = decodeURIComponent(rawName ?? "")
  } catch {
    name = ""
  }
  // Keep only the base name, without control characters or path separators.
  name = name
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f"<>|:*?]/g, "")
    .trim()
    .slice(0, 120)
  const ext = extension[type]
  if (!name) name = `${fallbackName}.${ext}`
  return { buffer: body, contentType: type, fileName: name, ext }
}

export function toStoredDocument(d: {
  id: string
  kind: string
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  uploadedAt: Date
  verifiedAt: Date | null
}): StoredDocument {
  return {
    id: d.id,
    kind: d.kind,
    fileName: d.fileName,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    uploadedAt: d.uploadedAt.toISOString(),
    verified: Boolean(d.verifiedAt),
  }
}
