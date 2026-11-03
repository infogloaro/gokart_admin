# Role Permission Matrix

## Role Definitions

| Role          | Description                                     | Default Permissions     |
| ------------- | ----------------------------------------------- | ----------------------- |
| `super_admin` | Platform-level administrator with global access | ALL 30 permissions      |
| `admin`       | Operations administrator with scoped access     | 15 specific permissions |

## Permission Details

### Super Admin Permissions (all 30)

```
dashboard.view, vendors.view, vendors.manage, vendors.approve,
partners.view, partners.manage, partners.approve,
orders.view, orders.manage,
inventory.view, inventory.manage,
complaints.view, complaints.manage,
tracking.view, ledger.view, finance.view, finance.approve,
finance.manage_plans,
reports.view, reports.export,
members.manage, settings.manage,
audit.view
```

### Admin Permissions (15 restricted)

```
dashboard.view,
vendors.view, vendors.manage,
partners.view, partners.manage,
orders.view, orders.manage,
inventory.view, inventory.manage,
complaints.view, complaints.manage,
tracking.view,
finance.view,
reports.view, reports.export
```

## Permission-by-Module Matrix

| Module         | Super Admin                 | Admin                 |
| -------------- | --------------------------- | --------------------- |
| **Dashboard**  | view                        | view                  |
| **Vendors**    | view, manage, approve       | view, manage          |
| **Partners**   | view, manage, approve       | view, manage          |
| **Orders**     | view, manage                | view, manage          |
| **Inventory**  | view, manage                | view, manage          |
| **Complaints** | view, manage                | view, manage          |
| **Tracking**   | view                        | view                  |
| **Finance**    | view, approve, manage_plans | view                  |
| **Reports**    | view, export                | view, export          |
| **Members**    | manage                      | — (not in admin list) |
| **Settings**   | manage                      | — (not in admin list) |
| **Audit**      | view                        | — (not in admin list) |

## Cross-Role Access Check

| Action                  | Super Admin | Admin                    | Allowed?                           |
| ----------------------- | ----------- | ------------------------ | ---------------------------------- |
| View any order          | ✅          | ✅ (scoped)              | Yes, admin sees only assigned      |
| Manage any order        | ✅          | ✅ (scoped)              | Yes, within assigned zone/business |
| View any partner        | ✅          | ✅ (scoped)              | Yes, within assigned zone          |
| Approve partner         | ✅          | ⚠️ (requires zone admin) | Admin needs zone's reviewAdmin     |
| View any vendor         | ✅          | ✅ (scoped)              | Yes, within assigned business      |
| View any report         | ✅          | ✅ (scoped)              | Admin can export within scope      |
| Audit log view          | ✅          | ❌                       | Super only                         |
| Member management       | ✅          | ❌                       | Super only                         |
| Settings management     | ✅          | ❌                       | Super only                         |
| Finance plan management | ✅          | ❌                       | Super only                         |

## Authorization Enforcement

### Backend (Always Enforced)

- `requireAuth` → reads session cookie, validates member from DB
- `requirePermission(permission)` → checks `req.member.permissions.includes(permission)`
- `scope(req, business)` → returns `{ businesses, zoneIds }` used in all order queries
- `loadInScope(id, scope)` → throws `notFound("Order")` if out of scope (404, not 403)
- All order routes: `.use(requireAuth)` then `.use(requirePermission("orders.X"))`

### Frontend (UI-Helper Only)

- Permission checks used to conditionally render buttons/links
- **Never trusted** - backend `loadInScope()` is the source of truth
- Example: Admin sees "Assign partner" only if `hasPermission("orders.manage")` AND order is in scope

### Critical Security Property

> **No trust in frontend-supplied IDs or zone/business filters.**
> The backend always validates via `loadInScope()` before any data operation.

### Permission Gap Analysis

1. **Admin cannot manage members or settings** - intentional, Super Admin only
2. **Admin cannot view audit logs** - intentional for operational roles
3. **Admin cannot manage finances/plans** - Super Admin only
4. **Partner approval requires zone admin** - verified in `delivery.service.ts:434` (`assignedReviewAdmins()`)
5. **Reports export is permitted for admin** but data is still scope-filtered

### Permission Verification Code

```typescript
// From middleware/auth.ts
export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.member?.permissions.includes(permission)) throw forbidden()
    next()
  }

export function scope(req: Request, business?: Business) {
  const m = currentMember(req)
  if (business && !m.businesses.includes(business))
    throw forbidden("You don't have access to that business.")
  return {
    businesses: business ? [business] : m.businesses,
    zoneIds: m.role === "super_admin" ? null : m.zoneIds,
  }
}
```
