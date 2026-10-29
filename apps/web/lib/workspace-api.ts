import type { ActiveWorkspaceResponse, Workspace, WorkspaceListResponse } from "@/types/workspace"

const API_URL = process.env.NEXT_PUBLIC_API_URL

export const DEMO_WORKSPACES: Workspace[] = [
  { id: "zoauro-food", name: "ZOAURO FOOD", slug: "zoauro-food", status: "ACTIVE" },
  { id: "gloaro-mart", name: "GLOARO MART", slug: "gloaro-mart", status: "ACTIVE" },
]

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.")
  }

  const response = await fetch(`${API_URL.replace(/\/+$/, "")}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? body?.message ?? `Request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  try {
    const result = await request<WorkspaceListResponse>("/api/workspaces")
    return result.data.length ? result.data : DEMO_WORKSPACES
  } catch {
    return DEMO_WORKSPACES
  }
}

export async function fetchActiveWorkspace(): Promise<Workspace | null> {
  try {
    const result = await request<ActiveWorkspaceResponse>("/api/workspaces/active")
    return result.data.workspace
  } catch {
    return null
  }
}

export async function updateActiveWorkspace(workspaceId: string): Promise<Workspace> {
  try {
    const result = await request<ActiveWorkspaceResponse>("/api/workspaces/active", {
      method: "PUT",
      body: JSON.stringify({ workspaceId }),
    })

    if (result.data.workspace) return result.data.workspace
  } catch {
    const fallback = DEMO_WORKSPACES.find((workspace) => workspace.id === workspaceId)
    if (fallback) return fallback
  }

  throw new Error("The selected workspace could not be opened.")
}
