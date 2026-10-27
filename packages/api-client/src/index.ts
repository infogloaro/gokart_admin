// Typed client for the GoKart API. Types come from src/schema.d.ts, which is
// generated from apps/api/openapi/openapi.json — run `pnpm openapi`, never edit it.
import type { components, paths } from "./schema"

type Method = "get" | "post" | "put" | "patch" | "delete"
type MethodsOf<P extends keyof paths> = {
  [M in Method]: [NonNullable<paths[P][M]>] extends [never] ? never : M
}[Method]
type Op<P extends keyof paths, M extends Method> = NonNullable<paths[P][M]>

type JsonOf<T> = T extends { content: { "application/json": infer J } } ? J : never
type Body<O> = O extends { requestBody?: infer B } ? JsonOf<NonNullable<B>> : never
type Query<O> = O extends { parameters: { query?: infer Q } } ? Q : never
type Params<O> = O extends { parameters: { path: infer P } } ? P : never
type Ok<O> = O extends { responses: infer R }
  ? 200 extends keyof R
    ? JsonOf<R[200]>
    : 201 extends keyof R
      ? JsonOf<R[201]>
      : void
  : never

type Options<O> = ([Body<O>] extends [never] ? { body?: undefined } : { body: Body<O> }) &
  ([Params<O>] extends [never] | [undefined] ? { params?: undefined } : { params: Params<O> }) & {
    query?: [Query<O>] extends [never] ? undefined : Partial<NonNullable<Query<O>>>
    signal?: AbortSignal
  }

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message)
  }
}

let baseUrl = "/api/v1"
export const setBaseUrl = (url: string) => {
  baseUrl = url
}

export async function api<P extends keyof paths, M extends MethodsOf<P>>(
  method: M,
  path: P,
  // Options are optional only when every field in them is.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  ...[opts]: {} extends Options<Op<P, M>> ? [Options<Op<P, M>>?] : [Options<Op<P, M>>]
): Promise<Ok<Op<P, M>>> {
  const o = (opts ?? {}) as {
    body?: unknown
    params?: Record<string, string>
    query?: Record<string, unknown>
    signal?: AbortSignal
  }
  let url =
    baseUrl +
    String(path).replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(o.params?.[k] ?? ""))
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(o.query ?? {}))
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v))
  if (qs.size) url += `?${qs}`

  const res = await fetch(url, {
    method: method.toUpperCase(),
    credentials: "include",
    headers: o.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
    signal: o.signal,
  })
  if (res.status === 204) return undefined as Ok<Op<P, M>>
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(
      res.status,
      e?.code ?? "http_error",
      e?.message ??
        (res.status >= 500
          ? "The server isn't responding. Try again in a moment."
          : `Request failed (${res.status})`),
      e?.fields,
    )
  }
  return data as Ok<Op<P, M>>
}

export type { paths, components }
export type Schemas = components["schemas"]
