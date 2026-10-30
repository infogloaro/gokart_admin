// Permission keys checked on the server for every request, and used by the web
// app only to hide what a member cannot do.
import { z } from "zod"
import type { Role } from "./enums"

export const PERMISSIONS = [
  "dashboard.view",
  "vendors.view",
  "vendors.manage",
  "vendors.approve",
  "partners.view",
  "partners.manage",
  "partners.approve",
  "orders.view",
  "orders.manage",
  "inventory.view",
  "inventory.manage",
  "complaints.view",
  "complaints.manage",
  "tracking.view",
  "ledger.view",
  "finance.view",
  "finance.approve",
  "finance.manage_plans",
  "reports.view",
  "reports.export",
  "members.manage",
  "settings.manage",
  "audit.view",
] as const
export const Permission = z.enum(PERMISSIONS)
export type Permission = z.infer<typeof Permission>

// Defaults for each role. A member's own grants come from the database; these
// seed new members and document the intent.
export const rolePermissions: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: [
    "dashboard.view",
    "vendors.view",
    "vendors.manage",
    "partners.view",
    "partners.manage",
    "orders.view",
    "orders.manage",
    "inventory.view",
    "inventory.manage",
    "complaints.view",
    "complaints.manage",
    "tracking.view",
    "finance.view",
    "reports.view",
    "reports.export",
  ],
}

export const hasPermission = (granted: readonly string[], needed: Permission) =>
  granted.includes(needed)
