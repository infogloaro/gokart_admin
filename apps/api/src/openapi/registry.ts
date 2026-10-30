import "./zod-extend"
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi"
import { ApiError } from "@zoauro/shared"
import type { z } from "zod"

export const registry = new OpenAPIRegistry()
const ApiErrorRef = registry.register("ApiError", ApiError)

export const json = (schema: z.ZodType, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
})
export const noContent = { description: "No content" }

const errorText: Record<number, string> = {
  400: "Invalid input",
  401: "Not signed in",
  403: "Not allowed",
  404: "Not found",
  409: "Changed by someone else; reload and retry",
  410: "Expired",
  503: "Service temporarily unavailable",
  429: "Too many attempts",
}
export const errors = (...codes: number[]) =>
  Object.fromEntries(codes.map((c) => [c, json(ApiErrorRef, errorText[c])]))

export function buildDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "GoKart Admin API", version: "1.0.0" },
    servers: [{ url: "/api/v1" }],
  })
}
