# ADR 0001: Contract-first provider/mock boundary

## Status

Accepted

## Context

SeoVista depends on external providers: NextG CMS, DataForSEO, Google OAuth, object storage, email delivery, and analytics. During Sprint 0 the live API contracts for these providers are not yet integrated, and real credentials are not available. At the same time, the product surface (routes, content, metadata, JSON-LD, worker jobs, analytics events) must be typed and testable so that later live adapters can be swapped in without rewrites.

We need a boundary that lets us:

- build the real web shell, content models, and metadata/schema engines now;
- exercise real PostgreSQL, Redis, and BullMQ for the infrastructure walking skeleton;
- keep every external provider behind a typed, deterministic, mockable contract;
- make it impossible to mistake a mock for a live integration in public output, analytics, or health signals.

## Decision

Use a **contract-first provider/mock boundary** for Sprint 0.

For every external provider we define a SeoVista-owned TypeScript port/interface in a dedicated package (or app for NextG). The concrete implementation for Sprint 0 is a deterministic mock that returns typed fixtures, reports `mock` or `unconfigured` capability state, and never makes outbound network calls. Live adapters will implement the same port in later sprints.

Specifically:

- `apps/nextg` implements the NextG mock service on `localhost:3101` with stable, byte-reproducible fixtures over HTTP.
- `packages/content-models` defines the anti-corruption layer: raw NextG responses are mapped into SeoVista-owned domain entities, and web consumers never import raw NextG payload types.
- `packages/dataforseo`, `packages/reports`, and `packages/analytics` expose provider ports and deterministic mock implementations, cost/event contracts, and prohibited-payload rules.
- `apps/worker` uses only SeoVista-owned interfaces; provider SDKs are not loaded into browser-facing code.
- Every mock implementation exposes a typed `capability` field (`mock` or `unconfigured`) so health, startup output, and tests cannot claim `live`/`connected`/`sent`/`uploaded`/`authorized` status.

## Consequences

- Positive: The web shell, SEO engine, schema builders, and worker infrastructure can be built and tested now without live provider credentials or network access.
- Positive: The boundary between SeoVista domain logic and provider-specific envelopes is explicit and testable.
- Positive: Future live adapters can be dropped in by implementing the same port without touching consumers.
- Negative: Sprint 0 cannot demonstrate real GEO audits, live CMS content, sent emails, uploaded reports, or OAuth authorization. Public copy and health signals must be truthful about this limitation.
- Risk: A mock must not leak into production as if it were real. Mitigation: capability states, tests, and copy checks enforce the distinction.

## Supersedes

None.

## Superseded by

None yet. A future ADR will define the live-provider migration order and production credential handling once real API contracts are supplied.
