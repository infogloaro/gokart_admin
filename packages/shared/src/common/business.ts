import { z } from "zod"

export const BUSINESS_CODES = ["FOOD", "MART"] as const

export const businessSchema = z.enum(BUSINESS_CODES)

export type Business = z.infer<typeof businessSchema>

export const BUSINESS_LABELS: Record<Business, string> = {
  FOOD: "ZOAURO FOOD",
  MART: "GLOARO MART",
}
