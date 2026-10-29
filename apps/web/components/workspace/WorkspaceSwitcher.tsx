"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useWorkspace } from "@/providers/WorkspaceProvider"

export default function WorkspaceSwitcher() {
  const router = useRouter()
  const { workspaces, activeWorkspace, loading, switchWorkspace } = useWorkspace()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleChange(workspaceId: string) {
    if (!workspaceId || workspaceId === activeWorkspace?.id) return

    setSaving(true)
    setError("")

    try {
      await switchWorkspace(workspaceId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to switch workspace.")
    } finally {
      setSaving(false)
    }
  }

  if (loading || workspaces.length === 0) return null

  return (
    <div className="min-w-0">
      <label htmlFor="workspace-switcher" className="mb-1 block text-xs text-gray-500">
        Active workspace
      </label>

      <select
        id="workspace-switcher"
        value={activeWorkspace?.id ?? ""}
        disabled={saving}
        onChange={(event) => void handleChange(event.target.value)}
        className="max-w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 disabled:opacity-60"
      >
        {!activeWorkspace && (
          <option value="" disabled>
            Select a workspace
          </option>
        )}
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>

      {saving && <p className="mt-1 text-xs text-gray-500">Switching workspace...</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
