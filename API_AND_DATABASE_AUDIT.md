# API and Database Audit

## API Endpoint Summary

### Order Routes (requireAuth + requirePermission)

| Endpoint               | Permission      | Description                                                      |
| ---------------------- | --------------- | ---------------------------------------------------------------- |
| `GET /`                | `orders.view`   | List orders with filtering (business, status, zone, date range)  |
| `GET /summary`         | `orders.view`   | Summary counts by business/zone/status                           |
| `GET /:id`             | `orders.view`   | Full order detail with assignment history and events             |
| `POST /:id/status`     | `orders.manage` | Change order status (with version check + transition validation) |
| `GET /:id/partners`    | `orders.manage` | View eligible partners for order                                 |
| `POST /:id/assign`     | `orders.manage` | Assign partner to ready/assigned order                           |
| `POST /:id/assign-boy` | `orders.manage` | Assign delivery boy to ready/assigned order                      |

### Delivery Routes

| Endpoint                                    | Permission                | Description                                  |
| ------------------------------------------- | ------------------------- | -------------------------------------------- |
| `GET /fleets`                               | (varies)                  | List delivery fleets (scoped to admin zones) |
| `POST /fleets`                              | `settings.manage` (super) | Create new delivery fleet                    |
| `PUT /fleets/:id`                           | `settings.manage`         | Update fleet details                         |
| `POST /fleets/:fleetId/zones`               | `settings.manage`         | Assign zone to fleet                         |
| `GET /boys`                                 | (scoped)                  | List delivery boys                           |
| `POST /boys/submit`                         | (partner admin)           | Submit boy application                       |
| `POST /boys/:id/review`                     | (zone admin)              | Review and decide on boy application         |
| `POST /boys/:id/verify-documents`           | (assigned admin)          | Verify document verification status          |
| `POST /orders/:fleetId/:orderId/assign-boy` | (partner)                 | Assign boy from partner fleet to order       |

### Auth Routes

| Endpoint            | Permission | Description                                             |
| ------------------- | ---------- | ------------------------------------------------------- |
| `POST /auth/login`  | —          | Authenticate with email/phone + OTP, set session cookie |
| `POST /auth/logout` | —          | Clear session cookie                                    |
| `GET /auth/me`      | —          | Get current member context                              |

### Notification Routes

| Endpoint             | Permission | Description                             |
| -------------------- | ---------- | --------------------------------------- |
| `GET /`              | —          | List notifications for signed-in member |
| `POST /read-all`     | —          | Mark all notifications as read          |
| `POST /:id/read`     | —          | Mark single notification as read        |
| `GET /activity-read` | —          | Get read activity list                  |

### Database Model Summary

#### Order Model

- **Fields**: id, code (unique), business, status, version, customerName, customerPhone, vendorId, partnerId?, deliveryFleetId?, deliveryBoyId?, zoneId, paymentMethod, paymentStatus, itemsTotalPaise, deliveryFeePaise, totalPaise, placedAt, updatedAt
- **Relations**: vendor, partner, deliveryFleet, deliveryBoy, zone, items, events, deliveryAssignments
- **Indexes**: `@@index([business, status])`, `@@index([zoneId, placedAt])`
- **Statuses**: placed, accepted, preparing, packed, ready, assigned, picked_up, out_for_delivery, delivered, cancelled, refund_requested, refunded

#### Partner Model

- **Fields**: id, code (unique), name, phone (unique), zoneId, vehicleType, vehicleNumber, vehicleModel?, drivingLicence, licenceValidUntil, email?, dateOfBirth?, gender?, address?, pinCode?, status, availability, kycVerified, bankVerified, ratingTenths, deliveriesCompleted, managedByAdminId, submittedById, decisionReason, decidedById, businesses (PartnerBusiness[]), documents, orders
- **Relations**: zone, manager (Member), businesses, documents, orders
- **Statuses**: pending_approval, active, rejected, suspended
- **Availability**: available, on_delivery, offline

#### DeliveryBoy Model

- **Fields**: id, code (unique), fleetId, zoneId, name, phone (unique), email, address, vehicleType, vehicleNumber, status, availability, maxActiveOrders, reviewAdminId, version, submittedAt, createdAt, updatedAt
- **Relations**: fleet (DeliveryFleet), zone (Zone), reviewAdmin (Member), documents, notifications, reviews, assignments, orders
- **Statuses**: pending_admin, pending_super, corrections_requested, rejected, active, suspended
- **Availability**: available, on_delivery, on_break, offline, suspended (enhanced with `on_break` in Phase 2)
- **Max active orders**: default 1, configurable

#### Zone Model

- **Fields**: id, district, districtId, city, location, lat?, lng?, active, createdAt
- **Relations**: members (MemberZone), districtRecord (District), vendors, partners, fleetAssignments, deliveryBoys, orders, feeRules
- **Unique**: `@@unique([district, city, location])`
- **Indexes**: `@@index([districtId])`

#### DeliveryFleet Model

- **Fields**: id, code (unique), name, companyName, contactPerson, phone (unique), email, address, districtId, credentialHash?, credentialIssuedAt, status, createdAt, updatedAt
- **Relations**: district (District), zones (DeliveryFleetZone), boys (DeliveryBoy), boyReviews, assignments, orders, complaints
- **Statuses**: active, suspended

### Prisma Migration Status

- **20 migrations applied** from `20261026000000_init` through `20261031140000_delivery_fleet_driver_workflow`
- All migrations successfully applied to PostgreSQL `gokart` database
- Migration `20261102000000_delivery_boy_on_break` added `on_break` enum value (Phase 2 work)
- Shadow database creation resolved by granting `CREATEDB` to `gokart` role

### Database Integrity Checks

1. **Foreign key consistency**: All `@relation` fields validated in Prisma schema
2. **Unique constraint compliance**: Partner.code, DeliveryBoy.code, Order.code all unique
3. **Index coverage**: Key query patterns indexed (business+status, zone+placedAt, status+availability)
4. **Referential integrity**: OnDelete behaviors configured (Restrict, Cascade, SetNull)
5. **No orphaned records**: Verified via Prisma Studio and direct SQL queries

### Database Connection Configuration

- **`.env`**: `DATABASE_URL=postgresql://gokart:gokart@localhost:5432/gokart`
- **Port**: 5432 (native Windows PostgreSQL), previously 5433 (Docker, not running)
- **Role**: `gokart` with `CREATEDB` permission granted
- **Connection pool**: Prisma Client with `PrismaPg` adapter
- **Connection safety**: `$transaction` used for all critical operations (assignment, status change)

### API Client (Frontend Integration)

- **Base URL**: `http://localhost:4000/api/v1` (configured in `next.config.ts` rewrites)
- **Authentication**: Session cookie (`SESSION_COOKIE`) set on login, sent automatically by browsers
- **Error handling**: All errors return JSON with `{ code, message }` format
- **Pagination**: `page` and `pageSize` query params (default 1, 20)
- **Filtering**: `business`, `status`, `delayed`, `fromDate`, `toDate`, `zoneId`, `adminId`, `deliveryFleetId`, `deliveryBoyId`
- **Search**: `search` param queries order code, customer name, vendor name

### API Integrity Checks

1. **No hardcoded production data**: All responses derived from database queries
2. **Input validation**: Zod schemas on all route handlers (`orders.schemas.ts`, `delivery.service.ts`)
3. **Safe error responses**: No stack traces exposed, user-friendly messages via `lib/errors.ts`
4. **Idempotency**: Version checks prevent duplicate updates (`input.version` mismatch → 409)
5. **Transaction safety**: All order assignment and status changes use `$transaction` with serializable isolation
6. **No unauthorized data leakage**: `loadInScope()` ensures zone/business filtering at query level

### Known API Issues (Documented)

1. **Outbox relay dependency on DB**: `relayOutbox()` will error if DB connection lost - handled by `running` guard but not reconnection
2. **Redis required for real-time notifications**: `REDIS_URL` in `.env`, but `lazyConnect: true` allows API startup without Redis
3. **DATABASE_URL port correction needed**: Was `5433` (Docker), now `5432` (native PostgreSQL) - verified fixed
4. **Zone assignment uniqueness**: `deliveryFleetZone` has partial unique index but gap in enforcement when replacing current
