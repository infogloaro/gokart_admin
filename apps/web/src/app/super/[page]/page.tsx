import { AlertsPage } from "@/components/alerts-page"
import { notFound } from "next/navigation"
import { AdminPermissions } from "@/components/super/admin-permissions"
import { AreasFees } from "@/components/super/areas-fees"
import { AuditLogs } from "@/components/super/audit-logs"
import { ScreenPlaceholder } from "@/components/placeholder"
import { SuperComplaints } from "@/components/super/complaints"
import { FinancePayouts } from "@/components/super/finance"
import { TransactionLedger } from "@/components/super/ledger"
import { SuperOrders } from "@/components/super/orders"
import { BusinessOverview, CommandCenter, RevenueScreen } from "@/components/super/overview"
import { SuperPartners } from "@/components/super/partners"
import { ReportsAnalytics } from "@/components/super/reports"
import { SuperTracking } from "@/components/super/tracking"
import { SuperVendors } from "@/components/super/vendors"
import { superScreens } from "@/lib/navigation"

export function generateStaticParams() {
  return superScreens.map((s) => ({ page: s.key }))
}

export default async function SuperPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params
  const screen = superScreens.find((s) => s.key === page)
  if (!screen) notFound()
  if (page === "dashboard") return <CommandCenter />
  if (page === "overview") return <BusinessOverview />
  if (page === "foodRevenue") return <RevenueScreen business="food" key="food" />
  if (page === "martRevenue") return <RevenueScreen business="mart" key="mart" />
  if (page === "ledger") return <TransactionLedger />
  if (page === "finance") return <FinancePayouts />
  if (page === "reports") return <ReportsAnalytics />
  if (page === "orders") return <SuperOrders />
  if (page === "complaints") return <SuperComplaints />
  if (page === "vendors") return <SuperVendors />
  if (page === "partners") return <SuperPartners />
  if (page === "tracking") return <SuperTracking />
  if (page === "admins") return <AdminPermissions />
  if (page === "settings") return <AreasFees />
  if (page === "audit") return <AuditLogs />
  if (page === "alerts") return <AlertsPage />
  return <ScreenPlaceholder screen={screen} />
}
