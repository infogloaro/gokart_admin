"use client"

import type { Workspace } from "@/types/workspace"

interface Props {
  workspace: Workspace
  isActive: boolean
  isSelected: boolean
  disabled?: boolean
  onSelect: (workspaceId: string) => void
}

export default function WorkspaceCard({
  workspace,
  isActive,
  isSelected,
  disabled = false,
  onSelect,
}: Props) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      disabled={disabled}
      onClick={() => onSelect(workspace.id)}
      className={`w-full rounded-xl border p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 ${
        isSelected ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">{workspace.name}</h2>
          <p className="mt-1 text-sm text-gray-500">{workspace.slug}</p>
        </div>

        {isActive && (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
            Active
          </span>
        )}
      </div>

      <p className="mt-4 text-sm text-gray-600">
        {isSelected ? "Selected workspace" : "Select this workspace"}
      </p>
    </button>
  )
}
