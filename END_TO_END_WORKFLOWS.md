# End-to-End Workflows

## A. Admin Onboarding

### Workflow

1. **Super Admin** navigates to `/admin/super/manage-admins`
2. Creates new admin account → sends invitation email with OTP
3. Assigns business (`food` or `mart`) and one or more zones
4. Admin receives invitation, completes OTP verification at `/login`
5. Admin logs in → redirected to `/admin/orders`

### Verification Points

- ✅ Super Admin can assign businesses and zones to admin
- ✅ Admin login creates session cookie
- ✅ `scope()` returns admin's assigned businesses and zones
- ✅ Admin sees only orders in assigned scope (verified via `loadInScope()`)
- ✅ Admin cannot access `/admin/super/*` routes (forbidden via `requirePermission`)

### API Endpoints

- `POST /auth/login` - authenticate, set session cookie
- `POST /auth/logout` - clear cookie
- `GET /members` - list members (super_admin only)
- `POST /admin/fleets` - create delivery fleet (super_admin)
- `POST /admin/zones` - assign zone to fleet (super_admin/admin)

---

## B. Zone Management

### Workflow

1. **Super Admin** creates a District (or it's pre-seeded)
2. Creates Zones within the district via `/admin/zones`
3. Assigns the zone to a Delivery Fleet via `assignZone()`
4. Fleet becomes eligible for partner onboarding in that zone

### Verification Points

- ✅ `assignZone()` enforces zone belongs to partner's district
- ✅ Zone can only have one primary partner (unless `replaceCurrent: true`)
- ✅ Fleet can be assigned to multiple zones
- ✅ Zone assignment visible in fleet details
- ✅ Zone reassignment audit logged

### API Endpoints

- `POST /fleets` - create fleet with zone assignments
- `POST /fleets/:fleetId/zones` - assign zone to fleet
- `GET /fleets/:fleetId/zones` - list fleet's zones

---

## C. Delivery Partner Onboarding

### Workflow

1. **Super Admin** or **Admin** (with `partners.manage`) creates delivery fleet
2. Fleet assigned to zones via `assignZone()`
3. Partner application submitted via `submitBoy()` (partner registers)
4. Application reviewed by Admin → `reviewBoy()` with decision `approved`/`rejected`
5. If approved → Partner status changes to `active`, can accept orders

### Verification Points

- ✅ `submitBoy()` validates zone belongs to partner's district
- ✅ At least one active Admin must be assigned to zone (via `assignedReviewAdmins()`)
- ✅ Review process: submitted → `pending_admin` → `active`/`rejected`
- ✅ Document verification required before activation
- ✅ Notification sent to Super Admin and zone's reviewAdmin
- ✅ Outbox event `delivery_boy.submitted` published

### API Endpoints

- `POST /delivery-boys/submit` - submit application
- `POST /delivery-boys/:id/review` - review application (admin)
- `GET /delivery-boys` - list boys (scoped to admin's zones)
- `POST /delivery-boys/:id/verify-documents` - verify documents

---

## D. Delivery Boy Onboarding

### Workflow

1. Partner fleet selects "Add Delivery Boy"
2. Fills application form (name, phone, zone, documents)
3. Submits → `submitBoy()` creates boy with `pending_admin` status
4. Review Admin reviews → `reviewBoy()` decides
   - `approved` → status `active`, availability `offline`
   - `rejected` → status updated with reason
   - `corrections_requested` → boy resubmits corrected data
5. Verified documents → boy becomes eligible for order assignment

### Verification Points

- ✅ Boy created under partner fleet
- ✅ Boy assigned to zone matching fleet's zone
- ✅ Review Admin must be active and in same zone
- ✅ `maxActiveOrders` default = 1, configurable
- ✅ Documents: `photo_id`, `driving_licence`, `vehicle_registration` must be verified
- ✅ Availability logic: `available` → `on_delivery` when at limit
- ✅ `on_break` enum value added to `DeliveryBoyAvailability` (Phase 2 work)

### API Endpoints

- `POST /delivery-boys/submit` - submit application
- `POST /delivery-boys/:id/review` - review (admin)
- `POST /delivery-boys/:id/verify-documents` - verify document
- `GET /delivery-boys/list` - list boys (scoped)
- `POST /delivery-boys/:id/upload-document` - upload document

---

## E. Order Lifecycle

### Workflow (Happy Path)

1. Order created → status `placed`
2. Admin/vendor reviews → status `accepted` (or `cancelled`)
3. Food: `preparing` → `ready`; Mart: `packed` → `ready`
4. Order becomes `ready` → assigned to partner via `POST /orders/:id/assign`
5. Partner assigns delivery boy via `POST /orders/:id/assign-boy`
6. Status → `assigned` → `picked_up` → `out_for_delivery` → `delivered`

### Status Transitions (Business-Dependent)

```typescript
// Food: placed→accepted→preparing→ready→assigned→picked_up→out_for_delivery→delivered
// Mart: placed→accepted→packed→ready→assigned→picked_up→out_for_delivery→delivered
// Both: assigned→ready, assigned→cancelled, picked_up→out_for_delivery,
//       out_for_delivery→delivered, delivered→refund_requested, refund_requested→refunded|delivered
```

### Verification Points

- ✅ `canTransition(business, from, to)` validates every change
- ✅ Version check on every update prevents conflicts
- ✅ `changeStatus()` requires reason for `cancelled`
- ✅ `assign()` only allows `ready` or `assigned` orders
- ✅ `assignBoy()` only allows `ready` or `assigned` orders, no existing boy
- ✅ Terminal statuses: `delivered`, `cancelled`, `refunded`
- ✅ `refund_requested` → can go to `refunded` or `delivered` (refund declined)

### Exceptional Cases

- **Failed delivery**: Boy marks `picked_up` → status changed to `out_for_delivery` → if not picked up within SLA, marked `delayed`
- **Reassignment**: New boy can be assigned if current boy's `endedAt` is set
- **Cancellation**: Only from `placed`, `accepted`, `preparing`, `ready`, `assigned` states
- **Refund**: `delivered` → `refund_requested` → `refunded` or back to `delivered`

### API Endpoints

- `POST /orders` - create order (client/partner)
- `GET /orders` - list (scoped to admin's business/zones)
- `GET /orders/:id` - get detail with assignment history
- `POST /orders/:id/status` - change status (manage permission)
- `POST /orders/:id/assign` - assign partner (manage permission)
- `POST /orders/:id/assign-boy` - assign delivery boy (manage permission)
- `GET /orders/:id/partners` - view eligible partners (manage permission)

---

## F. Smart Assignment

### Workflow

1. Order is `ready` or `assigned` with no delivery boy
2. Admin/candidate calls `candidates(id, scope)` → returns eligible partners
3. Partner selected → `assign()` or `assignBoy()`

### Assignment Validation (assignBoy service)

Zone match ✅, Partner business match ✅, Boy active ✅, Boy available ✅,
Workload limit ✅, Documents verified ✅, No duplicate assignment ✅

### Assignment History

- Every assignment creates `DeliveryAssignment` record
- `endedAt` set when reassigned/cancelled
- History viewable in order detail

### API Endpoints

- `GET /orders/:id/candidates` - view eligible partners/boys
- `POST /orders/:id/assign` - assign partner
- `POST /orders/:id/assign-boy` - assign delivery boy

---

## G. Live Tracking

### Workflow

1. Delivery boy has active assignment → GPS location updates via Socket.IO
2. Fleet/dashboard shows real-time location on map
3. Stale locations (>2min old) marked as offline/warning

### Technical Details

- Socket.IO middleware attaches `boyId` to rooms
- Location endpoint: `GET /tracking/boy/:boyId` (scoped via `loadBoy()`)
- Location persists in `tracking` module with `createdAt` timestamp
- Frontend shows "Live" if last update < 2min ago, otherwise "Stale"

### API Endpoints

- `GET /tracking/boy/:boyId` - get current location (scoped)
- `GET /tracking/orders/:orderId` - track order progress

---

## H. Notifications

### Workflow

1. Events published to `outbox_events` table
2. `relayOutbox()` polls every N seconds → queries `publishedAt IS NULL`
3. `dispatch(topic, payload)` → routes to appropriate handler
4. Notifications sent via `notify()` → member IDs
5. Read state tracked in `notifications` table + `readAt`

### Event Topics and Routing

| Topic                            | Trigger                                        | Recipients                    |
| -------------------------------- | ---------------------------------------------- | ----------------------------- |
| `order.delivery_boy_assigned`    | `assignBoy()` success                          | Assigned boy, partner, admins |
| `delivery_boy.submitted`         | `submitBoy()` success                          | Super Admin, zone reviewAdmin |
| `delivery_boy.approved`          | `reviewBoy()` approved                         | Boy, Super Admin              |
| `delivery_boy.rejected`          | `reviewBoy()` rejected                         | Boy, Super Admin              |
| `order.status_changed`           | `changeStatus()` or `changeFleetOrderStatus()` | Order's partner, admins       |
| `delivery_boy.document_verified` | `verifyBoyDocument()`                          | Boy, reviewing admin          |

### Verification Points

- ✅ `relayOutbox()` safe for timer-based polling (returns early if `running`)
- ✅ Failed dispatches caught and logged, `publishedAt` still set (avoid retry loops)
- ✅ Outbox events marked `publishedAt` after dispatch attempt (not before)
- ✅ Duplicate prevention: upsert on `notificationActivityRead`
- ✅ Notifications scoped via `member.zoneIds` and `member.businesses`

### API Endpoints

- `GET /notifications` - list for signed-in member (auth required)
- `POST /notifications/read-all` - mark all read
- `POST /notifications/:id/read` - mark single notification read
- `GET /notifications/activity-read` - read activity list

---

## I. Reports and Financial Workflows

### Financial Calculations (source → calculation → report)

1. **Order total** → `totalPaise` (sum of items + delivery fee)
2. **Delivery fee** → per `FeeRule` for zone/business, calculated as `baseFeePaise + (perKmPaise × distance)`
3. **Commission** → configured percentage of total, stored in ledger
4. **Settlement** → partner/payout bank account, last 4 digits stored in `BankAccount.last4`

### Verification Points

- ✅ `FeeRule` has `business`, `zoneId` (optional), `effectiveFrom` for history
- ✅ `ledger_entries` tracks all financial transactions
- ✅ `payout_lines` tracks individual payouts
- ✅ `finance.view` permission required for reports
- ✅ `finance.approve` for plan changes
- ✅ Reports scoped to admin's business/zones

### Reports Available

- Order revenue by zone/business/time period
- Delivery partner earnings and commissions
- Refund and settlement summaries
- Audit logs export (super_admin only)

### API Endpoints

- `GET /reports/financial` - financial reports (finance.view permission)
- `GET /reports/orders` - order metrics (orders.view permission)
- `GET /reports/audit` - audit trail (audit.view permission - super_admin)

---

## J. Support and Audit

### Ticket/Audit Workflow

1. Sensitive operation performed (assign boy, change status, verify document)
2. `audit()` called with: actor, action type, target, details
3. Audit record stored with: `id`, `type`, `action`, `at`, `details`, `actorId`, `actorName`, `actorRole`
4. Super Admin can export audit logs via `/reports/audit`

### Audit Fields (from `audit.ts` lib)

- `id`: UUID
- `type`: "order", "delivery_boy", "delivery_fleet", etc.
- `action`: "order.delivery_boy_assigned", etc.
- `at`: timestamp
- `details`: JSON with operation-specific data
- `actorId`: member ID who performed action
- `actorName`: member name
- `actorRole`: super_admin / admin

### Verification Points

- ✅ Every critical operation in `orders.service.ts`, `delivery.service.ts` calls `audit()`
- ✅ Audit includes code, fleetId, boyId, reason where applicable
- ✅ No sensitive data (passwords, full bank numbers) in audit details
- ✅ Super Admin can view all audit logs
- ✅ Admin sees only audits within their scope

### API Endpoints

- `GET /audit/logs` - audit logs (audit.view - super_admin only)
