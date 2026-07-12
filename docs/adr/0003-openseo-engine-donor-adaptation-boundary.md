# ADR 0003: OpenSEO engine-donor/adaptation boundary

## Status

Accepted

## Context

The OpenSEO project (`https://github.com/every-app/open-seo`, v0.0.25, MIT) contains useful patterns for DataForSEO normalization, cost tracking, robots/structured-data helpers, and technical-check fixtures. However, OpenSEO also ships a full application shell built on Vite/TanStack, DaisyUI branding, Cloudflare D1/Durable Objects architecture, routes, and unsupported AI Visibility/share-of-model calculations. None of those are appropriate for SeoVista's architecture, brand, or Sprint 0 scope.

We need a boundary that:

- records OpenSEO provenance and preserves the MIT license;
- allows selective reuse of only reviewed, source-attributed patterns;
- prevents the upstream shell, routes, brand, storage architecture, and unsupported claims from entering SeoVista.

## Decision

Create a dedicated **OpenSEO adaptation boundary** in `packages/open-seo-adapter`.

- Pin the upstream commit `3f2b4872caef809f0280a765f9eb469e8a6b523a` (v0.0.25, MIT) and record the full provenance in `docs/open-seo-adoption.md` and `THIRD_PARTY_NOTICES.md`.
- Adapt only reviewed patterns: DataForSEO normalized result/cost structures, robots/structured-data/technical-check helpers, and a small set of audit fixtures that map cleanly to SeoVista-owned interfaces.
- Reject: Vite/TanStack shell, DaisyUI, upstream branding, upstream routes, Cloudflare D1/Durable Objects architecture, AI Visibility calculations, share-of-model claims, and any methodology not supported by the PRD.
- `packages/open-seo-adapter` exports only SeoVista-owned interfaces. Apps and other packages must not import upstream types or paths directly.
- Static and render tests prove that no OpenSEO branding, routes, visual system, or unsupported claims appear in public HTML, metadata, JSON-LD, or discovery files.

## Consequences

- Positive: Sprint 0 can reuse proven, reviewed SEO-engineering patterns without building them from scratch.
- Positive: OpenSEO provenance and licensing are auditable and compliant with MIT terms.
- Positive: SeoVista architecture remains controlled: Next.js App Router, Tailwind v4, PostgreSQL/Redis, and SeoVista-owned domain models.
- Negative: Every upstream pattern must be reviewed before adaptation; automatic merges or version bumps are forbidden.
- Risk: Undesired upstream code or claims could leak. Mitigation: strict package export boundary, import-lint rules, and render/scan tests.

## Supersedes

None.

## Superseded by

None yet. A future ADR may expand or retire the adapter once live provider integrations replace the reviewed fixtures.
