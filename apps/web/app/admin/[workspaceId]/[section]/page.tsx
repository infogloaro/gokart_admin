import AdministrationView, { FOOD, MART } from "@/components/admin/AdministrationView"

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
      data={workspaceId === "gloaro-mart" ? MART : FOOD}
    />
  )
}
