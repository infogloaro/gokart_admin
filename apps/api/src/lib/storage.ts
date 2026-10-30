// Document storage, chosen by STORAGE_DRIVER: "s3" (S3 or MinIO, the default in production)
// or "local" (apps/api/.storage, the default elsewhere, so uploads work without MinIO).
// Production never writes to the local folder.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, resolve, sep } from "node:path"
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { env, isProd } from "../config/env"
import { HttpError } from "./errors"

const useS3 = (env.STORAGE_DRIVER ?? (isProd ? "s3" : "local")) === "s3"
const LOCAL_ROOT = resolve(process.cwd(), ".storage")

const s3 = useS3
  ? new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT, forcePathStyle: true }),
      ...(env.S3_ACCESS_KEY &&
        env.S3_SECRET_KEY && {
          credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
        }),
    })
  : null

function localPath(key: string) {
  const path = resolve(LOCAL_ROOT, key)
  // Keys are built by the API, but never let one escape the storage folder.
  if (!path.startsWith(LOCAL_ROOT + sep)) throw new Error(`Invalid storage key: ${key}`)
  return path
}

function requireStorage() {
  if (!s3 && isProd)
    throw new HttpError(503, "storage_unavailable", "File storage isn't configured.")
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  requireStorage()
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
    return
  }
  const path = localPath(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)
}

/** The stored bytes, or null when the object doesn't exist (e.g. a seeded record). */
export async function getObject(key: string): Promise<Buffer | null> {
  requireStorage()
  try {
    if (s3) {
      const r = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
      return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null
    }
    return await readFile(localPath(key))
  } catch (e) {
    // S3 reports a missing key by error name; the file system by error code.
    const { name, code } = e as { name?: string; code?: string }
    if (name === "NoSuchKey" || name === "NotFound" || code === "ENOENT") return null
    throw e
  }
}

export async function deleteObject(key: string) {
  if (s3) await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
  else await rm(localPath(key), { force: true })
}
