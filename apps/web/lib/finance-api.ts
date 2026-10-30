const API_URL = process.env.NEXT_PUBLIC_API_URL

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.")
  }
  const response = await fetch(`${API_URL.replace(/\/+$/, "")}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(
      payload?.error?.message ?? payload?.message ?? `Request failed (${response.status})`,
    )
  }
  const payload = (await response.json()) as { data: T }
  return payload.data
}

function base(workspaceId: string) {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/finance`
}

function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const text = search.toString()
  return text ? `?${text}` : ""
}

export function financeGet<T>(
  workspaceId: string,
  resource: string,
  params: Record<string, string | undefined> = {},
) {
  return call<T>("GET", `${base(workspaceId)}/${resource}${query(params)}`)
}

export function financePost<T = { ok: true }>(
  workspaceId: string,
  resource: string,
  body?: unknown,
) {
  return call<T>("POST", `${base(workspaceId)}/${resource}`, body ?? {})
}

export function financePut<T = { ok: true }>(workspaceId: string, resource: string, body: unknown) {
  return call<T>("PUT", `${base(workspaceId)}/${resource}`, body)
}
