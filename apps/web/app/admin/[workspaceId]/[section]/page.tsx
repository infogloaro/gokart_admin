import AdministrationView, { ALL, FOOD, MART } from "@/components/admin/AdministrationView"

function resolveWorkspace(workspaceId: string) {
  if (workspaceId === "all") return ALL
  if (workspaceId === "gloaro-mart") return MART
  return FOOD
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; section: string }>
}) {
  const { workspaceId, section } = await params
  return (
    <AdministrationView
      workspaceId={workspaceId}
      section={section}
      data={resolveWorkspace(workspaceId)}
    />
  )
}
