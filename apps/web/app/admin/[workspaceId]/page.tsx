import AdministrationView, { FOOD, MART } from "@/components/admin/AdministrationView"

export default async function AdministrationPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  return (
    <AdministrationView
      workspaceId={workspaceId}
      data={workspaceId === "gloaro-mart" ? MART : FOOD}
    />
  )
}
