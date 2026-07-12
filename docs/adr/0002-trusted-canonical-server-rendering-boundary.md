# ADR 0002: Trusted canonical/server-rendering boundary

## Status

Accepted

## Context

SeoVista must produce canonical URLs, metadata, JSON-LD, sitemaps, feeds, and Open Graph tags that are trustworthy and stable across requests. Using request headers (Host, X-Forwarded-Host, Forwarded) to generate canonicals introduces host-poisoning, cache-poisoning, and open-redirect risks. Client-side rendering of essential content, headings, links, or metadata harms crawlers, accessibility, and performance.

We need a boundary that:

- produces one absolute HTTPS canonical per route from a trusted configuration value;
- enforces trailing-slash canonical URLs globally;
- keeps essential content, headings, metadata, and JSON-LD in the first HTML response;
- prevents server-only environment variables from being imported by client code.

## Decision

Use a **trusted canonical/server-rendering boundary**.

- The only public source of canonical origin is `NEXT_PUBLIC_SITE_URL`, validated at process startup. Canonicals, Open Graph URLs, JSON-LD identifiers, sitemap locs, feed links, and manifest `start_url` all derive from this value and never from request headers.
- `apps/web` uses Next.js App Router with `trailingSlash: true`. Server Components render the layout, navigation, footer, headings, main content, metadata, and JSON-LD in the first HTML response.
- `packages/seo-core` owns metadata, canonical resolution, robots/sitemap/feed/llms policy, and locale rules. It rejects untrusted overrides, credentials, fragments, and non-trailing-slash canonicals.
- `packages/schema` builds JSON-LD `@graph` values server-side from validated domain models and stable IDs defined in code, not derived from request state.
- Client Components are allowed only for genuine browser interaction (forms, filters, charts, interactive tool states). They must not import server-only environment or provider modules.
- The build-time boundary test proves that `NEXT_PUBLIC_*` is the only browser-exposed env namespace and that importing a server-only env module from a Client Component fails.

## Consequences

- Positive: Canonicals and metadata are deterministic and resistant to host-poisoning and query-state forking.
- Positive: First HTML response contains essential content, improving crawlability, accessibility, and Core Web Vitals.
- Positive: Server secrets are physically separated from browser bundles by module-level import rules and static tests.
- Negative: Some interactive features require explicit Client Components and careful serialization of their initial state.
- Negative: Local development must set `NEXT_PUBLIC_SITE_URL` to a trusted value; dynamic multi-tenant hosts are not supported in Sprint 0.

## Supersedes

None.

## Superseded by

None yet. A future ADR may define CDN edge canonical handling if multi-region hosting is required, but the trusted-origin principle remains.
