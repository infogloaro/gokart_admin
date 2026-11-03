# System Architecture Audit

## Overview

GoKart Admin is a monorepo-based Next.js (web) + Express (API) application with PostgreSQL/Prisma, Zod validation, and Redis for notifications. The architecture follows a clear separation of concerns between the API (business logic, database) and the web app (UI, client-side state).

### Key Components

- **API (`apps/api`)**: Express.js server with tspx/tsup, Prisma ORM, ioredis, express, socket.io
- **Web (`apps/web`)**: Next.js 15 App Router, React 19, Radix UI, Zod validation, custom UI components
- **Shared (`packages/shared`)**: Zod schemas, order status flow, permissions, enums used by both apps
- **Database**: PostgreSQL 16 (port 5432 native, 5433 Docker-mapped), managed by Prisma 7.10.1 with Postgres adapter

### Data Flow

1. Frontend request → Next.js rewrites `/api/*` → `http://localhost:4000/api/*`
2. Express → `requireAuth` (cookie session) → `requirePermission` (role-based)
3. Service layer → `loadInScope()` (zone/business filtering via `scope()`)
4. Prisma → PostgreSQL with full relationship enforcement
5. Response → DTO serialization → frontend rendering

### Critical Observations

- **Scope function** (`middleware/auth.ts:70-77`): `zoneIds: null` for super_admin (all zones), `m.zoneIds` for admin (restricted)
- **Order status flow** (`packages/shared/src/orders/status.ts`): Business-dependent transitions via `canTransition()`
- **Assignment validation** (`orders.service.ts:158-267`): Full validation of zone, partner business, workload, documents in transaction
- **Outbox relay** (`notifications.ts:216-236`: `relayOutbox()` queries pending events, safe for timer-based polling

### Architecture Gaps Identified

1. Redis not running in current environment - API starts gracefully due to `lazyConnect: true` in `redis.ts`
2. Outbox relay will fail if DB connection drops - needs idempotent error handling
3. No active Docker services - DATABASE_URL was corrected from port 5433 to 5432
4. Zone/business scoping enforced at service layer, not just UI (good - `loadInScope()` in orders.service.ts)

### Files Inspected

- `apps/api/src/modules/orders/orders.service.ts` - Core order logic with assignment, status, candidates
- `apps/api/src/modules/orders/orders.routes.ts` - Route definitions with `requirePermission`
- `packages/shared/src/orders/status.ts` - State machine with business-dependent transitions
- `packages/shared/src/common/permissions.ts` - Role-based permission matrix
- `apps/api/src/middleware/auth.ts` - Auth + scope middleware
- `apps/api/prisma/schema/orders.prisma` - Order model with relations
- `apps/api/prisma/schema/partners.prisma` - Partner/DeliveryBoy model with availability
- `apps/api/src/modules/delivery/delivery.service.ts` - Fleet/boy management with policies
