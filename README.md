# GoKart Admin

Super Admin and Admin portals for ZOAURO FOOD and GLOARO MART, built on the GloAro stack
(see `docs/build-plan.html` for the plan and team split).

| Folder                   | What it is                                                          |
| ------------------------ | ------------------------------------------------------------------- |
| `apps/web`               | Next.js 16 web app (both portals)                                   |
| `apps/api`               | Express 5 API, Prisma 7 on PostgreSQL 16, Redis sessions            |
| `packages/shared`        | Zod schemas, enums, permissions, money (paise), order state machine |
| `packages/api-client`    | Typed client generated from the API's OpenAPI document              |
| `design/figma-prototype` | The original Figma Make prototype, kept as the design reference     |

## First-time setup

You need Node.js 22+, Docker Desktop and pnpm 10 (`corepack enable` gives you the pinned version).

```bash
pnpm install
cp .env.example apps/api/.env
pnpm services:up      # PostgreSQL (host port 5433), Redis, Mailpit in Docker; MinIO is opt-in, see docker-compose.dev.yml
pnpm db:migrate       # create the tables
pnpm db:seed          # demo accounts, vendors, partners, orders
pnpm dev              # API on :4000 and web on :3000
```

Open http://localhost:3000 and sign in. Seeded accounts (development only):

| Email                   | Mobile      | Password     | Role                                  |
| ----------------------- | ----------- | ------------ | ------------------------------------- |
| superadmin@gokart.in    | 98400 12345 | Gokart@12345 | Super Admin, both businesses          |
| admin@gokart.in         | 98400 23456 | Admin@123    | Admin, both businesses, Chennai zones |
| priya.shankar@gokart.in | 98400 34567 | Admin@123    | Admin, food, Chennai zones            |
| ravi.chandran@gokart.in | 98400 45678 | Admin@123    | Admin, mart, Madurai zones            |
| fathima.begum@gokart.in | —           | Admin@123    | Admin, food, Coimbatore zones         |

Sign in with the email **or** the mobile number, then choose how to get the 6-digit code:
email, SMS, or an authenticator app (set one up after signing in: Super Admin profile menu →
Two-step verification, or Admin → My profile). Locally, email and SMS codes both land in Mailpit
(http://localhost:8025) and are printed in the API terminal while `NODE_ENV=development`. Real SMS
needs `SMS_PROVIDER=msg91` with a DLT-approved template in `apps/api/.env`.

## Everyday commands

```bash
pnpm dev            # both apps
pnpm test           # unit tests; API integration tests run when services are up and seeded
pnpm lint && pnpm typecheck && pnpm format:check
pnpm openapi        # after changing an API route or schema: regenerates openapi.json and the client
pnpm db:migrate     # after changing a prisma/schema/*.prisma file (name the migration)
```

## How the code is organised

- **One module per business area.** API modules live in `apps/api/src/modules/<module>/` as
  `routes → controller → service → repository`. Only repositories touch Prisma. `orders` is the
  reference module to copy.
- **One Prisma file per module** in `apps/api/prisma/schema/`. Edit only your own; migrations are
  additive.
- **Shared contracts** in `packages/shared/src/<module>/`. Cross-module enums are in `common/` and
  need a review from all three owners.
- **Never edit** `packages/api-client/src/schema.d.ts` or `apps/api/openapi/openapi.json` by hand;
  run `pnpm openapi`.
- **Money** is integer paise everywhere (`formatINR` only at display time).
- **Every write is audited** (`lib/audit.ts`) in the same transaction; order changes go through
  `canTransition` plus a `version` check (409 on conflict).
- **Styling:** the prototype's CSS lives in `apps/web/src/styles/design/` so screens match the
  Figma exactly. New components use Tailwind tokens from `globals.css`. Move a screen to Tailwind
  utilities when you rebuild it.

## What works today (Week 1)

- Sign-in with password + emailed code, Redis sessions, rate limits, optional authenticator app
  (API ready, settings screen still to build), sign-out.
- Workspace picker and both portal shells, with every screen routed. Screens not built yet show
  which module and owner they belong to.
- Orders, live in both portals: filters, search, pagination, order detail, status changes
  through the state machine, scoped to the member's businesses and zones.
- Vendors and delivery partners, live in both portals: lists with order stats, detail drawers,
  vendor onboarding and approval, partner applications from Admins that a Super Admin approves or
  rejects (with reason and audit trail). Document upload waits for file storage.
- Database schema for every module, seed data, and the finance pay rules ported to paise with tests.
