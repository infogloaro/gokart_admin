import { z } from "zod"
import { Business, Role } from "../common/enums"
import { Permission } from "../common/permissions"

export const AdminMember = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  status: z.enum(["active", "disabled"]),
  businesses: z.array(Business),
  zones: z.array(
    z.object({
      id: z.string(),
      district: z.string(),
      city: z.string(),
      location: z.string(),
    }),
  ),
  permissions: z.array(Permission),
  createdAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
  authenticatorEnabled: z.boolean(),
})
export type AdminMember = z.infer<typeof AdminMember>

export const AdminMemberListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["active", "disabled"]).optional(),
})

export const CreateAdminRequest = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12).max(128),
  businesses: z
    .array(Business)
    .min(1)
    .refine((items) => new Set(items).size === items.length),
  zoneIds: z
    .array(z.string().min(1))
    .min(1)
    .refine((items) => new Set(items).size === items.length),
  permissions: z.array(Permission).refine((items) => new Set(items).size === items.length),
})
export type CreateAdminRequest = z.infer<typeof CreateAdminRequest>

export const UpdateAdminRequest = z.object({
  name: z.string().trim().min(2).max(120),
  status: z.enum(["active", "disabled"]),
  businesses: z
    .array(Business)
    .min(1)
    .refine((items) => new Set(items).size === items.length),
  zoneIds: z
    .array(z.string().min(1))
    .min(1)
    .refine((items) => new Set(items).size === items.length),
  permissions: z.array(Permission).refine((items) => new Set(items).size === items.length),
})
export type UpdateAdminRequest = z.infer<typeof UpdateAdminRequest>

export const ManagedZone = z.object({
  id: z.string(),
  district: z.string(),
  city: z.string(),
  location: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
})
export type ManagedZone = z.infer<typeof ManagedZone>

const coordinates = z.object({
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
})

export const CreateZoneRequest = z
  .object({
    district: z.string().trim().min(2).max(120),
    city: z.string().trim().min(2).max(120),
    location: z.string().trim().min(2).max(120),
  })
  .extend(coordinates.shape)
  .refine((value) => (value.lat === null) === (value.lng === null), {
    message: "Enter both coordinates or leave both empty.",
    path: ["lat"],
  })
export type CreateZoneRequest = z.infer<typeof CreateZoneRequest>

export const UpdateZoneRequest = CreateZoneRequest.extend({
  active: z.boolean(),
})
export type UpdateZoneRequest = z.infer<typeof UpdateZoneRequest>

export const FeeRule = z.object({
  id: z.string(),
  business: Business,
  zoneId: z.string().nullable(),
  zoneName: z.string().nullable(),
  baseFeePaise: z.number().int().nonnegative(),
  perKmPaise: z.number().int().nonnegative(),
  freeAbovePaise: z.number().int().nonnegative().nullable(),
  effectiveFrom: z.iso.datetime(),
  createdAt: z.iso.datetime(),
})
export type FeeRule = z.infer<typeof FeeRule>

export const CreateFeeRuleRequest = z.object({
  business: Business,
  zoneId: z.string().nullable(),
  baseFeePaise: z.number().int().nonnegative(),
  perKmPaise: z.number().int().nonnegative(),
  freeAbovePaise: z.number().int().nonnegative().nullable(),
  effectiveFrom: z.iso.datetime(),
})
export type CreateFeeRuleRequest = z.infer<typeof CreateFeeRuleRequest>

export const AuditLogEntry = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  actorId: z.string().nullable(),
  actorName: z.string(),
  actorRole: Role.nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  source: z.enum(["web", "mobile_app", "api", "system"]).nullable(),
  userAgent: z.string().nullable(),
  detail: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.record(z.string(), z.unknown()),
      z.array(z.unknown()),
    ])
    .nullable(),
  ip: z.string().nullable(),
})
export type AuditLogEntry = z.infer<typeof AuditLogEntry>

export const AuditSource = z.enum(["web", "mobile_app", "api", "system"])
export type AuditSource = z.infer<typeof AuditSource>

export const AUDIT_MODULES = [
  "auth",
  "order",
  "partner",
  "vendor",
  "member",
  "zone",
  "fee_rule",
  "finance",
] as const
export const AuditModule = z.enum(AUDIT_MODULES)
export type AuditModule = z.infer<typeof AuditModule>

export const AuditLogQuery = z
  .object({
    search: z.string().trim().max(120).optional(),
    module: AuditModule.optional(),
    actor: z.string().trim().max(120).optional(),
    role: Role.optional(),
    action: z.string().trim().max(120).optional(),
    source: AuditSource.optional(),
    ip: z.string().trim().max(64).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must be on or before the end date.",
    path: ["from"],
  })
