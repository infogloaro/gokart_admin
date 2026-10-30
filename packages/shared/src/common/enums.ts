// Cross-module enums. Changes here need a review from all three module owners.
import { z } from "zod"

export const BUSINESSES = ["food", "mart"] as const
export const Business = z.enum(BUSINESSES)
export type Business = z.infer<typeof Business>

export const businessName: Record<Business, string> = {
  food: "ZOAURO FOOD",
  mart: "GLOARO MART",
}

export const ROLES = ["super_admin", "admin"] as const
export const Role = z.enum(ROLES)
export type Role = z.infer<typeof Role>

export const roleName: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Operations Admin",
}
