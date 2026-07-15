# SeoVista Sprint 0 — Agent Guidelines

## Source-of-Truth Hierarchy

1. **SeoVista PRD** (`SeoVista — Global GEO & Search Visibility Website.md`) is the authoritative source for product behavior, brand, content, public routes, and acceptance criteria.
2. **SeoVista Implementation Brief** (`SeoVista — AI Developer Implementation Brief v1.md`) is the authoritative source for engineering sequence, architecture, constraints, and non-functional requirements.
3. When the PRD and the Brief conflict, **the PRD wins**.
4. This `AGENTS.md`, generated code, fixtures, and third-party dependencies (including OpenSEO) are **not** independent product authorities. They must conform to the PRD and Brief.

## Engineering Rules

- TypeScript strict mode everywhere (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`). No untyped business logic.
- Use pnpm exclusively; never npm or yarn. Project pins Node 24 LTS and `pnpm@10.30.1`.
- Server Components by default; Client Components only for genuine browser interaction.
- Every page must have exactly one descriptive `<h1>` inside exactly one `<main>` landmark.
- Public canonical URLs must be generated from the trusted `NEXT_PUBLIC_SITE_URL` only, never from request headers.
- Server-only environment variables must not be importable by client code.
- Draft, preview, and private content must never enter HTML, metadata, JSON-LD, sitemap, feed, or `llms.txt`.
- Never fabricate customers, reviews, citations, rankings, datasets, metrics, or results.
- Never represent `llms.txt` as a ranking factor or promise inclusion in AI models.
- Do not add live credentials, provider keys, or production secrets to any tracked file.
- Do not read or modify the two source Markdown documents in the project root except as references.

## Mission Boundaries

- **Ports:** web `3200`, NextG mock `3101`, PostgreSQL `55432`, Redis `56379`.
- **Off-limits:** ports `5433`, `5434`, `6379` (other projects), and ports `3000-3199` (user dev servers) except the assigned `3101`.
- Sprint 0 uses deterministic mocks for NextG, DataForSEO, Google OAuth, object storage, email, and analytics. No live provider traffic or credentials.
- Do not contact private, metadata, or loopback addresses through audit fixtures.
- Stop every process, container, and listener you start; verify cleanup before handoff.

## Architecture Decisions

See `docs/adr/` for the three required Sprint 0 decisions:

- `0001-contract-first-provider-mock-boundary.md`
- `0002-trusted-canonical-server-rendering-boundary.md`
- `0003-openseo-engine-donor-adaptation-boundary.md`

## Tooling

- Node 24 LTS, pnpm 10.30.1 via Corepack.
- Docker / Docker Compose for PostgreSQL and Redis.
- Vitest, Playwright, `@axe-core/playwright`, Lighthouse CI.
- Next.js App Router (RSC by default), React 19, Tailwind CSS v4, Zod.
- PostgreSQL driver `pg`, Redis client `ioredis`, BullMQ for background jobs.

## Commands

See `README.md` for the canonical command surface and `services.yaml` for the single source of truth on service lifecycle commands.
