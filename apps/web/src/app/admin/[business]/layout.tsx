import { Business } from "@zoauro/shared"
import { notFound } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { AdminShell } from "@/components/admin/shell"

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ business: string }>
}) {
  const parsed = Business.safeParse((await params).business)
  if (!parsed.success) notFound()
  return (
    <div className="admin-ui">
      <Suspense>
        <AdminShell business={parsed.data}>{children}</AdminShell>
      </Suspense>
    </div>
  )
}
