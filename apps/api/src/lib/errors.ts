import type { ErrorRequestHandler } from "express"
import type { z } from "zod"

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message)
  }
}

export const badRequest = (message: string, fields?: Record<string, string[]>) =>
  new HttpError(400, "bad_request", message, fields)
export const unauthorized = (message = "Sign in to continue.") =>
  new HttpError(401, "unauthorized", message)
export const forbidden = (message = "You don't have access to this.") =>
  new HttpError(403, "forbidden", message)
export const notFound = (what = "Record") => new HttpError(404, "not_found", `${what} not found.`)
export const conflict = (message: string) => new HttpError(409, "conflict", message)
export const tooMany = (message: string) => new HttpError(429, "too_many_requests", message)

/** Parses input with a shared Zod schema, turning failures into a 400 with per-field messages. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const fields: Record<string, string[]> = {}
  for (const issue of result.error.issues)
    (fields[issue.path.join(".") || "_"] ??= []).push(issue.message)
  throw badRequest("Some fields need attention.", fields)
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Body parser limits (e.g. a document over 10 MB).
  if ((err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ error: { code: "too_large", message: "That file is too large." } })
    return
  }
  if (err instanceof HttpError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, fields: err.fields } })
    return
  }
  console.error(err)
  res
    .status(500)
    .json({ error: { code: "internal", message: "Something went wrong on our side." } })
}
