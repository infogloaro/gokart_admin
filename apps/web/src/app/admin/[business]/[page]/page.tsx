import { AlertsPage } from "@/components/alerts-page"
import { Business } from "@zoauro/shared"
import { notFound } from "next/navigation"
import { AdminComplaints } from "@/components/admin/complaints"
import {
  AdminDashboard,
  AdminFinance,
  AdminNotifications,
  AdminOverview,
  AdminReports,
} from "@/components/admin/dashboard"
import { AdminInventory } from "@/components/admin/inventory"
import { AdminOrders } from "@/components/admin/orders"
import { AdminProfile } from "@/components/admin/profile"
import { AdminPartners } from "@/components/admin/partners"
import { AdminTracking } from "@/components/admin/tracking"
import { AdminVendors } from "@/components/admin/vendors"
import { PageHeader } from "@/components/admin/ui"
import { ScreenPlaceholder } from "@/components/placeholder"
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
  if (page === "dashboard") return <AdminDashboard business={b} key={b} />
  if (page === "overview") return <AdminOverview business={b} key={b} />
  if (page === "finance") return <AdminFinance business={b} key={b} />
  if (page === "reports") return <AdminReports business={b} key={b} />
  if (page === "notifications") return <AdminNotifications business={b} key={b} />
  if (page === "alerts") return <AlertsPage business={b} portal="admin" key={b} />
  if (page === "inventory") return b === "mart" ? <AdminInventory /> : notFound()
  if (page === "orders") return <AdminOrders business={b} />
  if (page === "complaints") return <AdminComplaints business={b} />
  if (page === "vendors") return <AdminVendors business={b} />
  if (page === "partners") return <AdminPartners business={b} />
  if (page === "tracking") return <AdminTracking business={b} />
  if (page === "profile") return <AdminProfile />
  return (
    <>
      <PageHeader title={screen.title} subtitle={screen.subtitle} />
      <ScreenPlaceholder screen={screen} />
    </>
  )
}
