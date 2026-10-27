import { Business } from "@zoauro/shared"
import { notFound } from "next/navigation"
import { AdminOrders } from "@/components/admin/orders"
import { AdminPartners } from "@/components/admin/partners"
import { AdminVendors } from "@/components/admin/vendors"
import { PageHeader } from "@/components/admin/ui"
import { ScreenPlaceholder } from "@/components/placeholder"
import { TwoStepSettings } from "@/components/two-step-settings"
import { adminScreens } from "@/lib/navigation"

export default async function AdminPage({
  params,
}: {
  params: Promise<{ business: string; page: string }>
}) {
  const { business, page } = await params
  const b = Business.parse(business)
  const screen = adminScreens.find((s) => s.key === page)
  if (!screen) notFound()
  if (page === "orders") return <AdminOrders business={b} />
  if (page === "vendors") return <AdminVendors business={b} />
  if (page === "partners") return <AdminPartners business={b} />
  if (page === "profile")
    return (
      <>
        <PageHeader title={screen.title} subtitle={screen.subtitle} />
        <section className="panel" style={{ padding: 22, maxWidth: 760 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 17 }}>Two-step verification</h2>
          <TwoStepSettings />
        </section>
      </>
    )
  return (
    <>
      <PageHeader title={screen.title} subtitle={screen.subtitle} />
      <ScreenPlaceholder screen={screen} />
    </>
  )
}
