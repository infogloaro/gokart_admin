# GoKart Admin

Admin portals for ZOAURO FOOD and GLOARO MART, built on the GloAro stack:
TypeScript, Next.js, Express, PostgreSQL (Prisma), Redis, in a pnpm monorepo.

## Requirements

- Node.js 22 or newer
- pnpm 10 (`corepack enable` gives you the pinned version)
- Docker Desktop

## Setup

```bash
pnpm install
cp .env.example apps/api/.env
pnpm services:up      # PostgreSQL (host port 5434), Redis (host port 6380) and Mailpit in Docker
pnpm db:migrate
pnpm db:seed
pnpm dev              # API on :4000, web app on :3000
```

Sign-in codes are delivered to the local Mailpit inbox at http://localhost:8025.

## Everyday commands

```bash
pnpm dev                    # run the apps
pnpm test                   # tests
pnpm lint                   # ESLint
pnpm typecheck              # TypeScript
pnpm format                 # Prettier
pnpm services:down          # stop Docker services
```

## Conventions

- Commit messages follow Conventional Commits (checked by commitlint).
- The pre-commit hook runs Prettier, ESLint and the type-checker.
- Secrets live only in local `.env` files, never in git.
