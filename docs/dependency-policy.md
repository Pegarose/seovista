# Dependency Policy

This inventory records every direct dependency used in the SeoVista monorepo, its owner workspace, purpose, production/dev class, runtime/bundle/build impact, resolved version, SPDX license, and update strategy. It is version-controlled and reconciled with the pnpm lockfile.

> This is a living document. Add a row before introducing any new direct dependency and update the lockfile digest after any dependency change.

## Inventory

### Root Monorepo (seovista-monorepo) — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @eslint/js | root | ESLint recommended rules | dev | build | 9.39.5 | MIT | Follow stable releases |
| @types/js-yaml | root | TypeScript types for js-yaml | dev | build | 4.0.9 | MIT | Follow stable releases |
| eslint | root | JavaScript/TypeScript linting | dev | build | 9.39.5 | MIT | Follow stable releases |
| eslint-config-prettier | root | Disables ESLint rules conflicting with Prettier | dev | build | 10.1.8 | MIT | Follow stable releases |
| eslint-import-resolver-typescript | root | TypeScript resolver for eslint-plugin-import | dev | build | 4.4.5 | ISC | Follow stable releases |
| eslint-plugin-import | root | ESLint import order and resolution rules | dev | build | 2.32.0 | MIT | Follow stable releases |
| js-yaml | root | YAML parser for ESLint config processor | dev | build | 4.3.0 | MIT | Follow stable releases |
| prettier | root | Code formatting | dev | build | 3.9.5 | MIT | Follow stable releases |
| typescript | root | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| typescript-eslint | root | TypeScript ESLint integration | dev | build | 8.63.0 | MIT | Follow stable releases |
| vitest | root | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/web — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @seovista/content-models | apps/web | Domain entity contracts and anti-corruption layer | prod | server, build | workspace:* | MIT | Follow workspace releases |
| @seovista/schema | apps/web | JSON-LD structured data graph builders | prod | server, build | workspace:* | MIT | Follow workspace releases |
| @seovista/seo-core | apps/web | Metadata, canonical, robots, sitemap policies | prod | server, build | workspace:* | MIT | Follow workspace releases |
| next | apps/web | Next.js App Router framework | prod | browser, server, build | 15.2.0 | MIT | Follow stable releases; pin patch if build tooling requires |
| react | apps/web | UI component library | prod | browser | 19.2.7 | MIT | Follow stable releases |
| react-dom | apps/web | React DOM renderer | prod | browser | 19.2.7 | MIT | Follow stable releases |

### @seovista/web — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @axe-core/playwright | apps/web | Accessibility testing via axe-core in Playwright | dev | build | 4.12.1 | MPL-2.0 | Follow stable releases |
| @lhci/cli | apps/web | Lighthouse CI CLI for performance/SEO audits | dev | build | 0.15.1 | Apache-2.0 | Pin to compatible version |
| @playwright/test | apps/web | Browser automation testing framework | dev | build | 1.61.1 | Apache-2.0 | Follow stable releases |
| @types/node | apps/web | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| @types/react | apps/web | TypeScript types for React | dev | build | 19.2.17 | MIT | Follow stable releases |
| @types/react-dom | apps/web | TypeScript types for React DOM | dev | build | 19.2.3 | MIT | Follow stable releases |
| fast-xml-parser | apps/web | XML parsing for sitemap/feed validation | dev | build | 5.10.0 | MIT | Follow stable releases |
| lighthouse | apps/web | Lighthouse auditing library (used by LHCI) | dev | build | 12.8.2 | Apache-2.0 | Pin to LHCI-compatible version |
| tailwindcss | apps/web | Utility-first CSS framework | dev | build | 4.3.2 | MIT | Follow v4 stable releases |
| typescript | apps/web | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | apps/web | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/nextg — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @seovista/content-models | apps/nextg | Domain entity contracts for mock content | prod | server, build | workspace:* | MIT | Follow workspace releases |
| zod | apps/nextg | Schema validation for mock fixtures | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/nextg — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | apps/nextg | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | apps/nextg | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | apps/nextg | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/worker — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @seovista/audit-core | apps/worker | Safe URL audit primitives | prod | server, build | workspace:* | MIT | Follow workspace releases |
| bullmq | apps/worker | Background job queue on Redis | prod | server | 5.43.1 | MIT | Follow stable releases |
| ioredis | apps/worker | Redis client | prod | server | 5.6.0 | MIT | Follow stable releases |
| pg | apps/worker | PostgreSQL client | prod | server | 8.14.0 | MIT | Follow stable releases |
| zod | apps/worker | Schema validation | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/worker — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | apps/worker | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| @types/pg | apps/worker | TypeScript types for pg | dev | build | 8.11.11 | MIT | Follow stable releases |
| typescript | apps/worker | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | apps/worker | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/ui — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/ui | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| @types/react | packages/ui | TypeScript types for React | dev | build | 19.2.17 | MIT | Follow stable releases |
| @types/react-dom | packages/ui | TypeScript types for React DOM | dev | build | 19.2.3 | MIT | Follow stable releases |
| typescript | packages/ui | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/ui | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/seo-core — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| server-only | packages/seo-core | Build-time guard preventing client import of server modules | prod | build | 0.0.1 | MIT | Follow stable releases |
| zod | packages/seo-core | Schema validation for env and metadata | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/seo-core — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/seo-core | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | packages/seo-core | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/seo-core | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/schema — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @seovista/content-models | packages/schema | Domain entity input for JSON-LD graph building | prod | server, build | workspace:* | MIT | Follow workspace releases |
| @seovista/seo-core | packages/schema | Shared trusted-origin and canonical-path validation policy | prod | server, build | workspace:* | MIT | Follow workspace releases |
| zod | packages/schema | Schema validation for graph builders | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/schema — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/schema | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | packages/schema | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/schema | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/content-models — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @seovista/seo-core | packages/content-models | Shared trusted-origin and canonical-path validation policy | prod | server, build | workspace:* | MIT | Follow workspace releases |
| zod | packages/content-models | Schema validation for domain entities | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/content-models — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/content-models | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | packages/content-models | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/content-models | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/audit-core — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| ipaddr.js | packages/audit-core | IPv4/IPv6 CIDR parsing for SSRF-safe URL validation | prod | server | 2.4.0 | MIT | Follow stable releases |
| zod | packages/audit-core | Schema validation for audit policies | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/audit-core — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/audit-core | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | packages/audit-core | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/audit-core | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/open-seo-adapter — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| zod | packages/open-seo-adapter | Schema validation for adapted data | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/open-seo-adapter — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/open-seo-adapter | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | packages/open-seo-adapter | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/open-seo-adapter | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/dataforseo — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| zod | packages/dataforseo | Schema validation for DataForSEO contracts | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/dataforseo — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/dataforseo | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | packages/dataforseo | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/dataforseo | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/geo-engine — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| zod | packages/geo-engine | Schema validation for GeoReadinessResult contracts | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/geo-engine — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/geo-engine | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | packages/geo-engine | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/geo-engine | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/reports — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| zod | packages/reports | Schema validation for report/storage/email contracts | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/reports — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/reports | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | packages/reports | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/reports | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

### @seovista/analytics — dependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| zod | packages/analytics | Schema validation for analytics event contracts | prod | server, build | 3.24.4 | MIT | Follow stable releases |

### @seovista/analytics — devDependencies

| Package | Workspace Owner | Purpose | Class | Impact | Resolved Version | SPDX License | Update Strategy |
|---------|-----------------|---------|-------|--------|------------------|--------------|-----------------|
| @types/node | packages/analytics | TypeScript types for Node.js | dev | build | 22.20.1 | MIT | Follow stable releases |
| typescript | packages/analytics | Type system and compiler | dev | build | 5.9.3 | Apache-2.0 | Follow stable releases |
| vitest | packages/analytics | Test runner and assertions | dev | build | 3.2.7 | MIT | Follow stable releases |

## License Exception Policy

No unreviewed custom licenses are allowed in the production closure. Exceptions require an owner, rationale, scope, and expiry recorded in this file and approved by the engineering team.

All production dependencies (non-dev) in this inventory use MIT, Apache-2.0, or BSD licenses. The frozen-lockfile production closure contains no unknown, missing, denied, or unreviewed custom licenses.

## Package-Boundary Rules

The following package-boundary checks are enforced:

1. **No browser-side database drivers**: `pg`, `ioredis`, and other database/Redis clients must only appear in server-side packages (`apps/worker`) and must not be imported by browser-facing packages (`apps/web`, `packages/ui`).
2. **No browser-side BullMQ**: `bullmq` must only appear in `apps/worker` and must not be importable from browser bundles.
3. **No browser-side provider SDKs**: DataForSEO, OAuth, storage, email, and analytics provider SDKs must remain server-only.
4. **No duplicate-purpose dependencies**: Only one package per purpose category (e.g., one Redis client, one queue library, one CSS framework) across the production closure.

## Lockfile Reconciliation

Run `pnpm install --frozen-lockfile` in CI. Any drift between this inventory and the lockfile must be resolved before merging.

Verifier checks:
- Every direct dependency and devDependency in every workspace has exactly one row in this inventory.
- No stale, duplicate, missing, wildcard, URL, alias, local-path, or floating-git rows exist.
- Two clean installs produce the same verifier result (digest match).
- Frozen-lockfile production closure contains no unknown, missing, denied, or unreviewed custom licenses.
