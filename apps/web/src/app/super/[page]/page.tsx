import type { ReactElement } from "react"
import { notFound } from "next/navigation"
import { ScreenPlaceholder } from "@/components/placeholder"
import { superScreens } from "@/lib/navigation"

export function generateStaticParams() {
  return superScreens.map((s) => ({ page: s.key }))
}

// Each screen is imported only when its page is opened, so the dev server compiles (and the
// production build splits) one screen at a time instead of every Super Admin screen at once.
const screens: Record<string, () => Promise<ReactElement>> = {
  dashboard: async () => {
    const { CommandCenter } = await import("@/components/super/overview")
    return <CommandCenter />
  },
  overview: async () => {
    const { BusinessOverview } = await import("@/components/super/overview")
    return <BusinessOverview />
  },
  foodRevenue: async () => {
    const { RevenueScreen } = await import("@/components/super/overview")
    return <RevenueScreen business="food" key="food" />
  },
  martRevenue: async () => {
    const { RevenueScreen } = await import("@/components/super/overview")
    return <RevenueScreen business="mart" key="mart" />
  },
  ledger: async () => {
    const { TransactionLedger } = await import("@/components/super/ledger")
    return <TransactionLedger />
  },
  finance: async () => {
    const { FinancePayouts } = await import("@/components/super/finance")
    return <FinancePayouts />
  },
  reports: async () => {
    const { ReportsAnalytics } = await import("@/components/super/reports")
    return <ReportsAnalytics />
  },
  orders: async () => {
    const { SuperOrders } = await import("@/components/super/orders")
    return <SuperOrders />
  },
  complaints: async () => {
    const { SuperComplaints } = await import("@/components/super/complaints")
    return <SuperComplaints />
  },
  vendors: async () => {
    const { SuperVendors } = await import("@/components/super/vendors")
    return <SuperVendors />
  },
  partners: async () => {
    const { SuperPartners } = await import("@/components/super/partners")
    return <SuperPartners />
  },
  tracking: async () => {
    const { SuperTracking } = await import("@/components/super/tracking")
    return <SuperTracking />
  },
  admins: async () => {
    const { AdminPermissions } = await import("@/components/super/admin-permissions")
    return <AdminPermissions />
  },
  settings: async () => {
    const { AreasFees } = await import("@/components/super/areas-fees")
    return <AreasFees />
  },
  audit: async () => {
    const { AuditLogs } = await import("@/components/super/audit-logs")
    return <AuditLogs />
  },
  alerts: async () => {
    const { AlertsPage } = await import("@/components/alerts-page")
    return <AlertsPage portal="super" />
  },
  notifications: async () => {
    const { NotificationsInbox } = await import("@/components/notifications-inbox")
    return (
      <NotificationsInbox
        business="all"
        portal="super"
        title="Notifications"
        subtitle="Approvals, new orders and updates for you."
      />
    )
  },
}

export default async function SuperPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params
  const screen = superScreens.find((s) => s.key === page)
  if (!screen) notFound()
  const load = screens[page]
  return load ? await load() : <ScreenPlaceholder screen={screen} />
}
