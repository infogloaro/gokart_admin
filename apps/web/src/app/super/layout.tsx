import { Suspense, type ReactNode } from "react"
import { SuperShell } from "@/components/super/shell"

export default function SuperLayout({ children }: { children: ReactNode }) {
  return (
    <div className="super-ui">
      <Suspense>
        <SuperShell>{children}</SuperShell>
      </Suspense>
    </div>
  )
}
