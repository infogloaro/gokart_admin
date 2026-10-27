import createClient from "openapi-fetch"

import type { paths } from "./schema.js"

export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl })
}

export type { paths } from "./schema.js"
