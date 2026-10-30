import type { Screen } from "@/lib/navigation"

/** Stands in for a screen until its owner builds it against the API. */
export function ScreenPlaceholder({ screen }: { screen: Screen }) {
  return (
    <section className="panel placeholder-panel">
      <strong>{screen.title} is being built</strong>
      <p>
        This screen belongs to the {screen.module} module, owned by {screen.owner}. The Figma design
        for it is in design/figma-prototype; it will show live data here once its API endpoints are
        ready.
      </p>
    </section>
  )
}
