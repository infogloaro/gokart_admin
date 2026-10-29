export interface Workspace {
  id: string
  name: string
  slug: string
  status?: string
}

export interface WorkspaceListResponse {
  data: Workspace[]
}

export interface ActiveWorkspaceResponse {
  data: {
    workspace: Workspace | null
  }
}

export interface WorkspaceContextValue {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  loading: boolean
  error: string | null
  refreshWorkspaces: () => Promise<void>
  switchWorkspace: (workspaceId: string) => Promise<Workspace>
}
