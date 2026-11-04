import type { ReactElement } from "react"
import { Business } from "@zoauro/shared"
import { notFound } from "next/navigation"
import { ScreenPlaceholder } from "@/components/placeholder"
import { adminScreens } from "@/lib/navigation"

// Each screen is imported only when its page is opened, so the dev server compiles (and the
// production build splits) one screen at a time instead of every Admin screen at once.
const screens: Record<string, (b: Business) => Promise<ReactElement>> = {
  dashboard: async (b) => {
    const { AdminDashboard } = await import("@/components/admin/dashboard")
    return <AdminDashboard business={b} key={b} />
  },
  overview: async (b) => {
    const { AdminOverview } = await import("@/components/admin/dashboard")
    return <AdminOverview business={b} key={b} />
  },
  finance: async (b) => {
    const { AdminFinance } = await import("@/components/admin/dashboard")
    return <AdminFinance business={b} key={b} />
  },
  reports: async (b) => {
    const { AdminReports } = await import("@/components/admin/dashboard")
    return <AdminReports business={b} key={b} />
  },
  notifications: async (b) => {
    const { AdminNotifications } = await import("@/components/admin/dashboard")
    return <AdminNotifications business={b} key={b} />
  },
  alerts: async (b) => {
    const { AlertsPage } = await import("@/components/alerts-page")
    return <AlertsPage business={b} portal="admin" key={b} />
  },
  inventory: async (b) => {
    if (b !== "mart") notFound()
    const { AdminInventory } = await import("@/components/admin/inventory")
    return <AdminInventory />
  },
  orders: async (b) => {
    const { AdminOrders } = await import("@/components/admin/orders")
    return <AdminOrders business={b} />
  },
  complaints: async (b) => {
    const { AdminComplaints } = await import("@/components/admin/complaints")
    return <AdminComplaints business={b} />
  },
  vendors: async (b) => {
    const { AdminVendors } = await import("@/components/admin/vendors")
    return <AdminVendors business={b} />
  },
  partners: async (b) => {
    const { AdminPartners } = await import("@/components/admin/partners")
    return <AdminPartners business={b} />
  },
  tracking: async (b) => {
    const { AdminTracking } = await import("@/components/admin/tracking")
    return <AdminTracking business={b} />
  },
  profile: async () => {
    const { AdminProfile } = await import("@/components/admin/profile")
    return <AdminProfile />
  },
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ business: string; page: string }>
}) {
  const { business, page } = await params
  const b = Business.parse(business)
  const screen = adminScreens.find((s) => s.key === page)
  if (!screen) notFound()
  const load = screens[page]
  if (load) return await load(b)
  const { PageHeader } = await import("@/components/admin/ui")
  return (
    <>
      <PageHeader title={screen.title} subtitle={screen.subtitle} />
      <ScreenPlaceholder screen={screen} />
    </>
  )
}
