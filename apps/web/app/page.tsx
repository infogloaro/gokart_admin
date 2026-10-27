import { BUSINESS_LABELS } from "@zoauro/shared"

import { HealthStatus } from "@/components/HealthStatus"

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
      <span className="text-sm font-semibold tracking-wide text-gold uppercase">
        GloAro Pvt Ltd
      </span>
      <h1 className="text-navy text-3xl font-bold">GoKart Admin</h1>
      <p>
        Admin portals for {BUSINESS_LABELS.FOOD} and {BUSINESS_LABELS.MART}.
      </p>
      <HealthStatus />
    </main>
  )
}
