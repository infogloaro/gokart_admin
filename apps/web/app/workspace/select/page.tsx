import { WorkspaceProvider } from "@/providers/WorkspaceProvider"
import WorkspaceSelector from "@/components/workspace/WorkspaceSelector"

export default function WorkspaceSelectionPage() {
  return (
    <WorkspaceProvider>
      <WorkspaceSelector />
    </WorkspaceProvider>
  )
}
