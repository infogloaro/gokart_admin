import AdministrationView, { ALL, FOOD, MART } from "@/components/admin/AdministrationView"

function resolveWorkspace(workspaceId: string) {
  if (workspaceId === "all") return ALL
  if (workspaceId === "gloaro-mart") return MART
  return FOOD
}

export default async function AdministrationPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  return <AdministrationView workspaceId={workspaceId} data={resolveWorkspace(workspaceId)} />
}
