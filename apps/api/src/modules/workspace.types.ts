export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  status: string
}

export interface ActiveWorkspaceResponse {
  workspace: WorkspaceSummary | null
}

export interface SetActiveWorkspaceInput {
  workspaceId: string
}

/**
 * Provided by the M03 authentication integration.
 */
export interface WorkspacePrincipal {
  userId: string
}

/**
 * Provided by M04.
 * Only return workspace IDs the principal is allowed to access.
 */
export type ResolveAccessibleWorkspaceIds = (principal: WorkspacePrincipal) => Promise<string[]>
