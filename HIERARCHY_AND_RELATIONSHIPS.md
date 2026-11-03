# Hierarchy and Relationships

## Organizational Hierarchy (as designed)

```
Super Admin
  └── Business / Platform (food / mart)
       └── Admin (Operations Admin)
            └── Assigned Region / Zone
                 └── Delivery Partner (Delivery Fleet)
                      └── Delivery Boys
                           └── Orders
```

### Role-Based Hierarchy Validation

#### Super Admin

- **Global access**: `rolePermissions.super_admin: PERMISSIONS` (all permissions)
- `scope()` returns `{ businesses: null, zoneIds: null }` — no zone/business restrictions
- Can manage admins, partners, delivery boys globally
- Can access all orders regardless of zone/business
- Creates fleets, assigns zones, reviews boy applications

#### Admin (Operations Admin)

- **Scoped access**: `rolePermissions.admin: [permissions without audit/view/export]`
- `scope()` returns `{ businesses: [assignedBusiness], zoneIds: [assignedZones] }` — restricted
- Can only view/manage orders in assigned businesses and zones
- Can assign partners and delivery boys within authorized scope
- Cannot access another admin's data or global system settings
- Can submit/correct boy applications in assigned zones

### Database Relationships (Prisma Schema)

#### Order ⇄ Zone

- `Order.zoneId` → `Zone.id` (required)
- Zone belongs to District
- Zone has many Partners, DeliveryBoys, Orders

#### Order ⇄ Partner (DeliveryFleet)

- `Order.partnerId` → `Partner.id` (optional)
- `Order.deliveryFleetId` → `DeliveryFleet.id` (optional)
- Partner belongs to Zone via `Partner.zoneId`
- Partner has many `PartnerBusiness` mappings

#### Order ⇄ DeliveryBoy

- `Order.deliveryBoyId` → `DeliveryBoy.id` (optional)
- DeliveryBoy belongs to Fleet and Zone
- `DeliveryAssignment` tracks historical assignments

#### Partner ⇄ Zone

- `Partner.zoneId` → `Zone.id` (required)
- Partner has many `Business` mappings (`PartnerBusiness`)

#### DeliveryBoy ⇄ DeliveryFleet

- `DeliveryBoy.fleetId` → `DeliveryFleet.id` (required)
- Fleet has many DeliveryBoys and DeliveryFleetZones

#### DeliveryBoy ⇄ Zone

- `DeliveryBoy.zoneId` → `Zone.id` (required)
- DeliveryBoy assigned to zone via `DeliveryFleetZone`

### Key Constraints Verified

1. **Unique constraints**: `Partner.code` unique, `DeliveryBoy.code` unique, `Order.code` unique
2. **Foreign keys with Referential Integrity**: All `@relation` fields have proper `references: [id]`
3. **OnDelete behaviors**:
   - `Order.vendor` → `Restrict`
   - `DeliveryAssignment.order` → `Restrict`
   - `DeliveryAssignment.boy` → `Restrict`
   - `BankAccount` → `unique([accountType, accountId])`
4. **Indexes**: `@@index([business, status])`, `@@index([zoneId, placedAt])`, `@@index([status, availability])`

### Hierarchy Gaps Identified

1. **No direct Admin→Partner relationship** in Prisma - Admins manage zones, Partners are assigned to zones via FleetZones
2. **Admin zone filtering** relies on `member.zoneIds` from database + `scope()` middleware - must verify DB data is consistent
3. **Super Admin has unrestricted access** - verified via `rolePermissions.super_admin: PERMISSIONS`, but this is intentional per design
4. **Partner→Business mapping** via `PartnerBusiness` many-to-many - validated in `assignBoy()` service (`orders.service.ts:190`)

### Relationship Safety

- **No circular dependencies** in Prisma schema
- **All optional relations** (`partnerId`, `deliveryFleetId`, `deliveryBoyId`) are properly handled with null checks in services
- **Version checking** on every order status change via `input.version` + Pessimistic locking in `$transaction`
- **Assignment history** preserved via `DeliveryAssignment` model - never deleted, only marked `endedAt`
