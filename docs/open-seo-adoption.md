# OpenSEO Adoption Record

## Provenance

| Field | Value |
|-------|-------|
| **Upstream Repository** | `https://github.com/every-app/open-seo` |
| **Version** | v0.0.25 |
| **Pinned Commit** | `3f2b4872caef809f0280a765f9eb469e8a6b523a` |
| **License** | MIT |
| **License SHA-256** | `62DE25B254287E61E6026AC04A629FBFA88332D14E4175D408092229D80E0D3C` |
| **Adoption Date** | 2026-07-13 |
| **Adoption Owner** | SeoVista Foundation Team |
| **Adoption Boundary** | `packages/open-seo-adapter` |

## Adoption Policy

- **Adapt only**: Reviewed normalization/cost patterns, robots helpers, structured-data reference types, technical-check issue registries, and audit fixtures.
- **Reject**: Vite/TanStack application shell, DaisyUI, upstream branding ("OpenSEO", "openseo.so", pine-tree logo), upstream routes (`src/routes/`, `src/client/`), Cloudflare D1/Durable Objects architecture (`src/db/`), AI Visibility/share-of-model calculations (`src/shared/targetDetection.ts`).
- **Export**: Only SeoVista-owned interfaces from `packages/open-seo-adapter`. Apps must never import upstream types or paths directly.
- **No runtime dependency**: No `npm`/`pnpm` dependency on `every-app/open-seo`. No automatic merge, rebase, or version bump. All adaptations are manual, reviewed, and committed as SeoVista-owned source.

## Adaptation Inventory

Each row records the immutable upstream identity, SeoVista destination, purpose, modification summary, owner, test coverage, and review status.

### 1. Audit Issue Type Registry

| Field | Value |
|-------|-------|
| **Upstream Repo** | `every-app/open-seo` |
| **Upstream Path** | `src/shared/audit-issues.ts` |
| **Upstream Blob** | `https://github.com/every-app/open-seo/blob/3f2b4872caef809f0280a765f9eb469e8a6b523a/src/shared/audit-issues.ts` |
| **SeoVista Destination** | `packages/open-seo-adapter/src/audit-issue-types.ts` |
| **Purpose** | Typed registry of technical SEO issue descriptors (severity, title, explanation, howToFix) for use by the audit-core package and future site-audit engine. Provides a reference catalog of 27 standard issue types. |
| **Modification** | Converted from `const` assertion registry to a Zod-validated `z.record()` schema with SeoVista-owned `AuditIssueType` enum. Removed `satisfies` keyword (not supported in our TS target). Wrapped in a SeoVista-owned `SeovistaAuditIssueRegistry` class. Added explicit `readonly` immutability guarantees. |
| **Owner** | SeoVista Foundation Team |
| **Test** | `packages/open-seo-adapter/src/__tests__/index.test.ts` (describe: `audit issue types`; test: `has 27 issue types`) — validates the issue registry, severity ordering, descriptor lookup, and immutability |
| **Review** | Accepted — Sprint 0 adaptation boundary |

### 2. Audit Limits

| Field | Value |
|-------|-------|
| **Upstream Repo** | `every-app/open-seo` |
| **Upstream Path** | `src/shared/audit-limits.ts` |
| **Upstream Blob** | `https://github.com/every-app/open-seo/blob/3f2b4872caef809f0280a765f9eb469e8a6b523a/src/shared/audit-limits.ts` |
| **SeoVista Destination** | `packages/open-seo-adapter/src/audit-limits.ts` |
| **Purpose** | Named constants for per-audit page bounds (min, default, free-tier max, paid-tier max). Shared between launch form, input schema, and server-side tier gate. |
| **Modification** | Re-exported as a SeoVista-owned `SeovistaAuditLimits` const object with JSDoc. Values preserved. Added Zod schema for runtime validation. |
| **Owner** | SeoVista Foundation Team |
| **Test** | `packages/open-seo-adapter/src/__tests__/index.test.ts` (describe: `audit limits`; test: `limit consistency invariant holds`) — validates constant values and the min <= default <= free <= paid invariant |
| **Review** | Accepted — Sprint 0 adaptation boundary |

### 3. Error Codes

| Field | Value |
|-------|-------|
| **Upstream Repo** | `every-app/open-seo` |
| **Upstream Path** | `src/shared/error-codes.ts` |
| **Upstream Blob** | `https://github.com/every-app/open-seo/blob/3f2b4872caef809f0280a765f9eb469e8a6b523a/src/shared/error-codes.ts` |
| **SeoVista Destination** | `packages/open-seo-adapter/src/error-codes.ts` |
| **Purpose** | Canonical error code enum and classification helpers shared between server and client for consistent error handling and observability filtering. |
| **Modification** | Re-exported as SeoVista-owned `SeovistaErrorCode` enum and `SeovistaErrorCodes` namespace. `shouldCaptureAppErrorCode` renamed to `shouldReportError`. Removed upstream-specific codes not applicable to SeoVista (BACKLINKS_BILLING_ISSUE, AI_SEARCH_BILLING_ISSUE). Added SeoVista-specific codes: `NEXTG_UNAVAILABLE`, `WORKER_HEALTH_FAILED`. |
| **Owner** | SeoVista Foundation Team |
| **Test** | `packages/open-seo-adapter/src/__tests__/index.test.ts` (describe: `error codes`; test: `isSeovistaErrorCode recognizes valid codes`) — validates error-code recognition and reporting classification |
| **Review** | Accepted — Sprint 0 adaptation boundary |

### 4. JSON Codec

| Field | Value |
|-------|-------|
| **Upstream Repo** | `every-app/open-seo` |
| **Upstream Path** | `src/shared/json.ts` |
| **Upstream Blob** | `https://github.com/every-app/open-seo/blob/3f2b4872caef809f0280a765f9eb469e8a6b523a/src/shared/json.ts` |
| **SeoVista Destination** | `packages/open-seo-adapter/src/json-codec.ts` |
| **Purpose** | Zod codec for safe JSON serialization/deserialization with schema validation at parse boundaries. Used by content-models and DataForSEO normalization layers. |
| **Modification** | Renamed from `jsonCodec` to `createSeovistaJsonCodec`. Added explicit `JsonCodec` branded type for type-safe codec passing. Added error message customization parameters. |
| **Owner** | SeoVista Foundation Team |
| **Test** | `packages/open-seo-adapter/src/__tests__/index.test.ts` (describe: `json codec`; test: `round-trips through encode/decode`) — validates parse success, parse failure, schema mismatch handling, and JSON round trips |
| **Review** | Accepted — Sprint 0 adaptation boundary |

### 5. DataForSEO Normalization Patterns (Reference)

| Field | Value |
|-------|-------|
| **Upstream Repo** | `every-app/open-seo` |
| **Upstream Path** | `src/shared/dataforseo.ts` (cost tracking/normalization), `src/server/features/dataforseo/` (client implementation) |
| **Upstream Blob** | Subdirectory at commit `3f2b4872caef809f0280a765f9eb469e8a6b523a` |
| **SeoVista Destination** | `packages/open-seo-adapter/src/normalization.ts` (cost ledger contracts), `packages/dataforseo/` (provider interface) |
| **Purpose** | Reference patterns for DataForSEO API response normalization, cost-per-operation tracking, and credit/budget enforcement. Informs SeoVista's `packages/dataforseo` provider contract. |
| **Modification** | Not copied verbatim. Upstream normalization logic (Zod-based response parsing, cost-feature mapping, credit deduction) informed the design of `packages/dataforseo/src/normalizer.ts` and `cost-ledger.ts`. SeoVista ownership: typed provider port with deterministic mock in Sprint 0. |
| **Owner** | SeoVista Foundation Team |
| **Test** | `packages/dataforseo/src/__tests__/` — validates normalization, cost ledger, credit enforcement |
| **Review** | Accepted — pattern only; no code copy |

### 6. Structured Data Reference Types (Informational)

| Field | Value |
|-------|-------|
| **Upstream Repo** | `every-app/open-seo` |
| **Upstream Path** | `src/server/features/schema/` (JSON-LD builders), `src/shared/lighthouse.ts` (structured data checks) |
| **Upstream Blob** | Subdirectory at commit `3f2b4872caef809f0280a765f9eb469e8a6b523a` |
| **SeoVista Destination** | `packages/schema/` (JSON-LD graph builders) |
| **Purpose** | Reference patterns for schema.org type validation, stable `@id` conventions, and structured-data completeness checks. Informs SeoVista's `packages/schema` builders. |
| **Modification** | Not copied verbatim. Upstream approach of using stable organization/website `@id` values and typed graph builders informed SeoVista's `@seovista/schema` package design. SeoVista uses different entity IDs (`seovista.com`, not `openseo.so`) and enforces PRD-mandated fabrication prohibitions. |
| **Owner** | SeoVista Foundation Team |
| **Test** | `packages/schema/src/__tests__/` — validates graph builders, stable IDs, prohibited claims |
| **Review** | Accepted — pattern only; no code copy |

### 7. Robots and Technical Check Fixtures (Reference)

| Field | Value |
|-------|-------|
| **Upstream Repo** | `every-app/open-seo` |
| **Upstream Path** | `src/server/workflows/audit/` (crawler, robots.txt parsing, X-Robots-Tag handling), `src/shared/audit-issues.ts` (check catalog) |
| **Upstream Blob** | Subdirectory at commit `3f2b4872caef809f0280a765f9eb469e8a6b523a` |
| **SeoVista Destination** | `packages/audit-core/` (crawl-policy contracts, SSRF-safe URL validation, check contracts), `packages/open-seo-adapter/src/audit-issue-types.ts` (issue registry) |
| **Purpose** | Reference patterns for robots.txt parsing, X-Robots-Tag header detection, canonical-link extraction, and technical-SEO check classification. Informs SeoVista's audit-core contracts. |
| **Modification** | Not copied verbatim. The upstream approach to deterministic robots parsing, redirect-loop detection, and SSRF-safe crawling informs SeoVista's audit-core design. SeoVista implements its own with framework-independent primitives and PRD-mandated safety constraints. |
| **Owner** | SeoVista Foundation Team |
| **Test** | `packages/audit-core/src/__tests__/` — validates SSRF rejection, crawl-policy limits, check contracts |
| **Review** | Accepted — pattern only; no code copy |

## Excluded Upstream Areas

The following upstream directories and patterns are **explicitly rejected** and must never appear in SeoVista:

| Upstream Area | Reason for Rejection |
|---------------|---------------------|
| `src/client/` | Vite/TanStack Start application shell — incompatible with Next.js App Router |
| `src/routes/` | TanStack Router route definitions — incompatible with Next.js file-based routing |
| `src/router.tsx`, `src/routeTree.gen.ts` | TanStack-specific generated files |
| `src/db/` | Cloudflare D1/Durable Objects schemas — incompatible with PostgreSQL |
| `src/middleware/` | Cloudflare Workers middleware — incompatible with Next.js |
| `src/lib/auth*.ts` | better-auth/Cloudflare OAuth — incompatible with SeoVista's mock OAuth in Sprint 0 |
| `src/server/billing/` | Autumn billing integration — out of scope for Sprint 0 |
| `src/server/email/` | Loops email integration — out of scope for Sprint 0 |
| `src/server/mcp/` | MCP server implementation — out of scope for Sprint 0 |
| `src/shared/targetDetection.ts` | AI Visibility / competitor share-of-voice calculations — unsupported by PRD |
| `src/shared/subscription.ts` | Billing/subscription management — out of scope for Sprint 0 |
| `src/shared/billing*.ts` | Billing plan definitions — out of scope for Sprint 0 |
| `src/shared/reddit-attribution.ts` | Reddit conversion tracking — not applicable |
| `src/shared/gsc.ts` | Google Search Console integration — Sprint 0 uses mock |
| `src/shared/keyword-locations.ts` | Keyword location data — not applicable to Sprint 0 |
| `src/shared/rank-tracking.ts` | Rank tracking configuration — not applicable to Sprint 0 |
| `src/shared/saved-keyword-tags.ts` | Keyword tags — not applicable to Sprint 0 |
| `src/shared/tag-colors.ts` | UI color definitions — visual system |
| `src/shared/lighthouse.ts` | Lighthouse audit config — handled by SeoVista's LHCI |
| `src/server.ts`, `src/start.ts` | Vite/TanStack server entry points |
| `src/types/` | Upstream type definitions — SeoVista uses its own domain types |
| All branding assets | OpenSEO logo, "openseo.so", pine-tree icon, "OpenSEO" name |
| DaisyUI / Tailwind v3 | Upstream visual system — SeoVista uses Tailwind v4 with own tokens |

## Verifier Compliance

A verifier reconciling this adoption record must confirm:

1. **Pin match**: Commit `3f2b4872caef809f0280a765f9eb469e8a6b523a` matches `every-app/open-seo` v0.0.25 tag.
2. **License digest**: SHA-256 of the MIT license text in `THIRD_PARTY_NOTICES.md` matches `62DE25B254287E61E6026AC04A629FBFA88332D14E4175D408092229D80E0D3C`.
3. **Row completeness**: Each of the seven inventory rows has upstream identity, destination path, purpose, modification, owner, test evidence path, and review status. Rows 1 through 4 use the consolidated adapter test file with explicit `describe` and `test` identifiers.
4. **Evidence resolution**: Every recorded destination and test evidence path resolves to an existing repository file or directory. The focused adoption-record test reconciles these paths and the notice-derived license digest.
5. **No runtime dependency**: `packages/open-seo-adapter/package.json` has no dependency on `every-app/open-seo` or any Git-based dependency pointing to the upstream.
6. **Export boundary**: `packages/open-seo-adapter/src/index.ts` exports only SeoVista-owned identifiers (prefixed or namespaced with `Seovista`).
7. **Import boundary**: No file in `apps/` or other `packages/` imports from paths containing `open-seo` upstream references. Import-boundary test proves this at compile time.
8. **Render boundary**: No public HTML, metadata, JSON-LD, or discovery file contains OpenSEO branding, route paths from the upstream shell, or unsupported AI Visibility claims. Render-boundary test proves this.
