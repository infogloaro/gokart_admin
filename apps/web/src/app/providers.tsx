"use client"

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ApiError } from "@zoauro/api-client"
import { useState, type ReactNode } from "react"

// Any 401 means the session ended: send the member back to sign in. A full page
// load (not router.push) so no cached data from the old session survives.
function onError(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && window.location.pathname !== "/login")
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login")
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) =>
              !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
