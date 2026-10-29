"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { fetchActiveWorkspace, fetchWorkspaces, updateActiveWorkspace } from "@/lib/workspace-api"
import type { Workspace, WorkspaceContextValue } from "@/types/workspace"

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshWorkspaces = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [available, active] = await Promise.all([fetchWorkspaces(), fetchActiveWorkspace()])

      setWorkspaces(available)
      setActiveWorkspace(
        active && available.some((workspace) => workspace.id === active.id) ? active : null,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load workspace context.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshWorkspaces()
  }, [refreshWorkspaces])

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!workspaces.some((workspace) => workspace.id === workspaceId)) {
        throw new Error("This workspace is not in your available list.")
      }

      const workspace = await updateActiveWorkspace(workspaceId)
      setActiveWorkspace(workspace)
      setError(null)
      return workspace
    },
    [workspaces],
  )

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspace,
      loading,
      error,
      refreshWorkspaces,
      switchWorkspace,
    }),
    [workspaces, activeWorkspace, loading, error, refreshWorkspaces, switchWorkspace],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext)

  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.")
  }

  return context
}
