# SeoVista

AI visibility and GEO readiness platform — Phase 1+ "Agentic B2B SEO Machine".

Sprint 0 established the contract-first monorepo foundation with deterministic provider mocks. Phase 1+ promotes the platform to a self-hosted scoring engine with real HTML crawling, SPA rendering, NLP semantic enrichment, and an autonomous sales webhook that turns low-scoring audits into qualified lead opportunities.

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
  geo-engine/          full self-hosted ScoringEngine with scoring modules
                       (Indexability, Technical, Content, Semantic, Experience,
                       Linking, AiVisibility) and real provider integrations
                       (NeuronWriter). Produces overall and platform readiness
                       scores (ChatGPT, Perplexity, Google AI Overviews, Bing
                       Copilot), issues, quick wins, and recommendations.
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
| Web app            | 3200      | Next.js App Router, trailing-slash URLs        |
| NextG mock         | 3101      | Deterministic mock CMS service                 |
| PostgreSQL         | 55432     | Docker host mapping, not 5433/5434             |
| Redis              | 56379     | Docker host mapping, not 6379                  |
| Worker             | none      | Background process, no public listener           |

Off-limits ports: `5433`, `5434`, `6379` (other projects), and `3000-3199` (user dev servers) except the assigned `3101`.

## Setup

```bash
# 1. Ensure Node 24 LTS and Corepack are available, then activate the pnpm pin
corepack prepare pnpm@10.30.1 --activate

# 2. Install dependencies (frozen lockfile)
corepack pnpm install --frozen-lockfile

# 3. Copy environment placeholders (variable names only; never commit secrets)
cp .env.example .env

# 4. Populate Phase 1+ provider credentials in .env
#    (see "Environment Variables" below; dummy values are acceptable during
#     development, real provider traffic requires valid credentials)

# 5. Start local infrastructure (PostgreSQL + Redis)
corepack pnpm infrastructure:start
```

## Environment Variables

Sprint 0 infrastructure variables (PostgreSQL, Redis, `NEXT_PUBLIC_SITE_URL`, etc.) are defined in `.env.example`. Phase 1+ adds the following provider integration keys:

| Variable                  | Purpose                                                                  |
|---------------------------|--------------------------------------------------------------------------|
| `BROWSERACT_API_KEY`      | Browseract.com API key for headless SPA rendering of JS-heavy sites      |
| `NEURONWRITER_API_KEY`    | NeuronWriter API key for NLP semantic enrichment (LSI terms, entities)   |
| `NEURONWRITER_PROJECT_ID` | NeuronWriter project ID used by `POST /new-query` and `/get-query` polls |
| `CREW_AGENCY_API_URL`     | Crew Agency API base URL (default: `http://crew.tr4.net/api`)            |
| `CREW_AGENCY_API_KEY`     | Crew Agency API key for autonomous sales webhook authentication         |

Server-only provider keys must never be importable by client code or committed to tracked files.

## Commands

| Command            | Purpose                                                  |
|--------------------|----------------------------------------------------------|
| `pnpm install`     | Install dependencies with frozen lockfile                |
| `pnpm dev`         | Start web (3200) and NextG mock (3101) in parallel        |
| `pnpm build`       | Build all workspaces                                     |
| `pnpm typecheck`   | Strict TypeScript check across all workspaces            |
| `pnpm lint`        | ESLint flat-config check with zero warnings              |
| `pnpm test`        | Run root contracts, infrastructure contracts, and workspace tests |
| `pnpm test:e2e`    | Playwright browser smoke tests (2 workers max)           |
| `pnpm test:a11y`   | axe accessibility checks via `@axe-core/playwright`      |
| `pnpm test:seo`    | HTTP-based SEO/metadata/system-route validation          |
| `pnpm lighthouse`  | Lighthouse CI in Linux Chromium via Docker               |
| `pnpm verify:production-sentinels` | Verify production artifacts contain no secret sentinels |
| `pnpm verify-package-boundaries` | Verify browser/server package dependency boundaries      |

pnpm's built-in `install` command is used directly; it is not duplicated as a root package script to avoid recursion.

All commands are non-stub, terminate without watch mode, and preserve the first failing exit code.

## Phase 1+ Pipeline

The worker (`apps/worker/src/queue/geo-worker.ts`) now executes a real end-to-end audit pipeline instead of proxying to an external scoring service:

1. **Fetch & parse.** `apps/worker/src/utils/fetcher.ts` performs a real HTTP fetch and parses HTML with `cheerio`. SSRF protection via `ipaddr.js` and `dns.lookup()` blocks private, loopback, and cloud metadata IPs before any connection is opened. Fetch errors degrade gracefully.
2. **SPA rendering.** For JavaScript-heavy SPA sites, the fetcher calls the Browseract.com API for headless rendering using `BROWSERACT_API_KEY`. Cheerio remains the fallback when Browseract fails or rate-limits.
3. **Score.** The worker invokes the self-hosted `ScoringEngine` natively via `import { ScoringEngine } from "@seovista/geo-engine"` — no external GSeoSuite proxy. The engine runs seven modules: Indexability, Technical, Content, Semantic, Experience, Linking, and AiVisibility. It emits an overall score, score band, per-platform readiness (ChatGPT, Perplexity, Google AI Overviews, Bing Copilot), issues, quick wins, and recommendations.
4. **Semantic enrichment.** The SemanticModule calls NeuronWriter (`packages/geo-engine/src/providers/neuronwriter.ts`) via `POST /new-query` and polls `/get-query` for up to 120 seconds, comparing page content against NeuronWriter's LSI terms and entities and emitting `SEMANTIC_LSI_GAP` and `SEMANTIC_ENTITY_GAP` issues.
5. **Autonomous sales webhook.** After job completion, the worker sends a POST to `crew.tr4.net/api/teklif-yaz` authenticated with `CREW_AGENCY_API_KEY` and addressed via `CREW_AGENCY_API_URL`. The payload includes the target URL, brand hostname, overall score, score band, a low-scores mapping, top issues, and a `proposalTrigger` flag set to `true` when the score is below 60 or the band is critical/poor. Webhook failures are caught and logged without affecting the geo job status.

## Phase 1+ Integration Status

Sprint 0's mock-only boundary has been superseded by real provider integrations inside the monorepo:

- **ScoringEngine** is self-hosted in `packages/geo-engine` (no external GSeoSuite dependency). The worker calls it directly as a workspace import.
- **HTML crawling** is real, with SSRF protection blocking private/loopback/metadata IPs before connection.
- **Browseract.com** provides headless SPA rendering, with cheerio as fallback.
- **NeuronWriter** provides NLP semantic enrichment (LSI terms and entities) via its async polling API.
- **Crew Agency** receives an autonomous sales webhook on every completed job, with `proposalTrigger` gating proactive proposal generation for low-scoring targets.
- **NextG CMS** remains a deterministic mock service on `localhost:3101`.
- DataForSEO, Google OAuth, object storage, email delivery, and analytics ports remain typed contracts; their mock implementations can still be used for local development and tests.

During development, API keys may be dummy or placeholder values. Real provider traffic — Browseract rendering, NeuronWriter NLP enrichment, and Crew Agency webhook delivery — requires valid credentials in `.env`. Never commit live credentials or production secrets to any tracked file.

## Teardown

```bash
# Stop web and NextG mock dev servers
# (Ctrl+C in the `pnpm dev` terminal, or stop the relevant node processes)

# Stop local infrastructure and remove project containers/volumes
corepack pnpm infrastructure:teardown <context-file>
```

Workers must stop every process, container, and listener they start and verify cleanup before handoff.

## License

MIT. See `THIRD_PARTY_NOTICES.md` for third-party attribution.
