import { notFound } from "next/navigation"
import { ScreenPlaceholder } from "@/components/placeholder"
import { SuperOrders } from "@/components/super/orders"
import { SuperPartners } from "@/components/super/partners"
import { SuperVendors } from "@/components/super/vendors"
import { superScreens } from "@/lib/navigation"

export function generateStaticParams() {
  return superScreens.map((s) => ({ page: s.key }))
}

export default async function SuperPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params
  const screen = superScreens.find((s) => s.key === page)
  if (!screen) notFound()
  if (page === "orders") return <SuperOrders />
  if (page === "vendors") return <SuperVendors />
  if (page === "partners") return <SuperPartners />
  return <ScreenPlaceholder screen={screen} />
}
