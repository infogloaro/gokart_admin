import type { SetActiveWorkspaceInput } from "./workspace.types.js"

export function parseWorkspaceId(value: unknown): SetActiveWorkspaceInput {
  if (
    typeof value !== "object" ||
    value === null ||
    !("workspaceId" in value) ||
    typeof value.workspaceId !== "string" ||
    value.workspaceId.trim().length === 0
  ) {
    throw Object.assign(new Error("workspaceId is required"), { status: 400 })
  }

  return { workspaceId: value.workspaceId.trim() }
}
