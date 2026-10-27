"use client"

import { useEffect, useState } from "react"

type Health = { status: string; postgres: string; redis: string }
type State = { kind: "loading" } | { kind: "error" } | { kind: "ok"; health: Health }

export function HealthStatus() {
  const [state, setState] = useState<State>({ kind: "loading" })

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

    fetch(`${apiUrl}/health`)
      .then((response) => response.json() as Promise<Health>)
      .then((health) => setState({ kind: "ok", health }))
      .catch(() => setState({ kind: "error" }))
  }, [])

  if (state.kind === "loading") return <p>Checking the API…</p>
  if (state.kind === "error") return <p>API unreachable at the configured URL.</p>

  const { health } = state
  return (
    <p>
      API status: <strong>{health.status}</strong> (postgres {health.postgres}, redis {health.redis}
      )
    </p>
  )
}
