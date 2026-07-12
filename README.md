# SeoVista

AI visibility and GEO readiness platform — Sprint 0 foundation.

## Architecture

This repository is a **Git-backed pnpm monorepo** using **Node 24 LTS** and **pnpm 10.30.1**.

```text
apps/
  web/                 Next.js App Router browser and HTTP surface
  nextg/               deterministic NextG mock service and fixtures
  worker/              BullMQ processors and worker lifecycle
packages/
  ui/                  design tokens and accessible primitives
  seo-core/            metadata, canonical, robots, sitemap policies
  schema/              validated JSON-LD graph builders
  content-models/      NextG domain contracts and raw-response mappers
  audit-core/          framework-independent audit and safe URL contracts
  open-seo-adapter/    reviewed third-party adaptations behind owned ports
  dataforseo/          typed provider port and cost-control contracts
  geo-engine/          versioned readiness-result and scoring contracts
  reports/             private report/storage/email ports
  analytics/           typed analytics event contracts
```

Source-of-truth hierarchy:

1. `SeoVista — Global GEO & Search Visibility Website.md` (PRD) controls product behavior, brand, content, routes, and acceptance criteria.
2. `SeoVista — AI Developer Implementation Brief v1.md` (Implementation Brief) controls engineering sequence and constraints.
3. When the PRD and Brief conflict, the PRD wins.

See `docs/adr/` for architecture decision records.

## Prerequisites

- Node.js 24 LTS (project pin; the host may have a newer version)
- pnpm 10.30.1 via Corepack (`corepack prepare pnpm@10.30.1 --activate`)
- Docker 29.2.1+ and Docker Compose v5.0.2+
- Git

## Assigned Ports

| Service            | Port      | Notes                                          |
|--------------------|-----------|------------------------------------------------|
| Web app            | 3100      | Next.js App Router, trailing-slash URLs        |
| NextG mock         | 3101      | Deterministic mock CMS service                 |
| PostgreSQL         | 55432     | Docker host mapping, not 5433/5434             |
| Redis              | 56379     | Docker host mapping, not 6379                  |
| Worker             | none      | Background process, no public listener           |

Off-limits ports: `5433`, `5434`, `6379` (other projects), `3000-3099` (user dev servers) except the assigned `3100/3101`.

## Setup

```bash
# 1. Ensure Node 24 LTS and Corepack are available, then activate the pnpm pin
corepack prepare pnpm@10.30.1 --activate

# 2. Install dependencies (frozen lockfile)
corepack pnpm install --frozen-lockfile

# 3. Copy environment placeholders (variable names only; never commit secrets)
cp .env.example .env

# 4. Start local infrastructure (PostgreSQL + Redis)
docker compose up -d postgres redis
```

## Commands

| Command            | Purpose                                                  |
|--------------------|----------------------------------------------------------|
| `pnpm install`     | Install dependencies with frozen lockfile                |
| `pnpm dev`         | Start web (3100) and NextG mock (3101) in parallel        |
| `pnpm build`       | Build all workspaces                                     |
| `pnpm typecheck`   | Strict TypeScript check across all workspaces            |
| `pnpm lint`        | ESLint flat-config check with zero warnings              |
| `pnpm test`        | Run all Vitest unit and integration tests                |
| `pnpm test:e2e`    | Playwright browser smoke tests (2 workers max)           |
| `pnpm test:a11y`   | axe accessibility checks via `@axe-core/playwright`      |
| `pnpm test:seo`    | HTTP-based SEO/metadata/system-route validation          |
| `pnpm lighthouse`  | Lighthouse CI in Linux Chromium via Docker               |

pnpm's built-in `install` command is used directly; it is not duplicated as a root package script to avoid recursion.

All commands are non-stub, terminate without watch mode, and preserve the first failing exit code.

## Teardown

```bash
# Stop web and NextG mock dev servers
# (Ctrl+C in the `pnpm dev` terminal, or stop the relevant node processes)

# Stop local infrastructure and remove project containers/volumes
docker compose down -v
```

Workers must stop every process, container, and listener they start and verify cleanup before handoff.

## Provider-Mock Limitations (Sprint 0)

- NextG CMS is a deterministic mock service on `localhost:3101`.
- DataForSEO, Google OAuth, object storage, email delivery, and analytics are represented by typed contracts and deterministic mocks only.
- No live provider credentials, traffic, or production success claims are used in Sprint 0.
- The GEO Readiness Checker is a non-operational foundation page; no audit, score, report, or live provider call is performed.

## License

MIT. See `THIRD_PARTY_NOTICES.md` for third-party attribution.
