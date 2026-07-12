# Dependency Policy

This inventory records every direct dependency used in the SeoVista monorepo, its owner workspace, purpose, runtime/bundle/build impact, resolved version, SPDX license, and update strategy. It is reconciled with the pnpm lockfile.

> This is a living document. Add a row before introducing any new direct dependency and update the lockfile digest after any dependency change.

## Inventory

| Package | Workspace Owner | Purpose | Impact | Resolved Version | License | Update Strategy |
|---------|-----------------|---------|--------|------------------|---------|-----------------|
| Next.js | apps/web | App Router, React framework | browser, build | 15.2.0 | MIT | Follow stable releases; pin patch if build tooling requires it |
| React | apps/web, packages/ui | UI library | browser | ^19.0.0 | MIT | Follow stable releases |
| React DOM | apps/web, packages/ui | UI renderer | browser | ^19.0.0 | MIT | Follow stable releases |
| TypeScript | root | Type system | build | ^5.8.2 | Apache-2.0 | Follow stable releases |
| Tailwind CSS | apps/web, packages/ui | Utility-first styling | browser, build | ^4.0.0 | MIT | Follow v4 stable releases |
| Zod | multiple packages | Schema validation | server, build | ^3.24.2 | MIT | Follow stable releases |
| PostgreSQL (pg) | apps/worker | Database driver | server | ^8.14.0 | MIT | Follow stable releases |
| ioredis | apps/worker | Redis client | server | ^5.6.0 | MIT | Follow stable releases |
| BullMQ | apps/worker | Background job queue | server | ^5.43.1 | MIT | Follow stable releases |
| Vitest | root | Test runner | build | ^3.0.8 | MIT | Follow stable releases |
| Playwright | apps/web | Browser testing | build | ^1.51.0 | Apache-2.0 | Follow stable releases |
| @axe-core/playwright | apps/web | Accessibility testing | build | ^4.10.1 | MIT | Follow stable releases |
| Lighthouse CI | apps/web | Performance/SEO auditing | build | ^0.15.1 | Apache-2.0 | Pin to compatible version |
| ESLint | root | Linting | build | ^9.22.0 | MIT | Follow stable releases |
| Prettier | root | Formatting | build | ^3.5.3 | MIT | Follow stable releases |
| server-only | packages/seo-core | Server-only client import guard | build | ^0.0.1 | MIT | Follow stable releases |
| ipaddr.js | packages/audit-core | IPv4/IPv6 parsing for SSRF validation | server | ^2.4.0 | MIT | Follow stable releases |

## License exception policy

No unreviewed custom licenses are allowed in the production closure. Exceptions require an owner, rationale, scope, and expiry recorded in this file and approved by the engineering team.

## Lockfile reconciliation

Run `pnpm install --frozen-lockfile` in CI. Any drift between this inventory and the lockfile must be resolved before merging.
