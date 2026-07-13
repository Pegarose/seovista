# Third-Party Notices

This document lists the third-party software used in SeoVista and preserves required attribution and license notices.

## MIT License Notices

### OpenSEO

- Repository: https://github.com/every-app/open-seo
- Version: v0.0.25
- Commit: `3f2b4872caef809f0280a765f9eb469e8a6b523a`
- License: MIT
- License SHA-256: `62DE25B254287E61E6026AC04A629FBFA88332D14E4175D408092229D80E0D3C`
- Purpose: Reviewed source for selective adaptation of normalization, cost, robots, structured-data, and technical-check patterns.
- Usage: Adapted only behind `packages/open-seo-adapter` into SeoVista-owned interfaces; no upstream shell, routes, branding, or AI Visibility claims are adopted.

```text
MIT License

Copyright (c) 2026 Ben Senescu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Other Licenses

| Package / Work | License | Purpose | Owner | Update Strategy |
|-----------------|---------|---------|-------|-----------------|
| Next.js | MIT | App Router, React framework | apps/web | Follow stable releases |
| React | MIT | UI library | apps/web | Follow stable releases |
| TypeScript | Apache-2.0 | Type system | root | Follow stable releases |
| Tailwind CSS | MIT | Utility-first styling | apps/web, packages/ui | Follow v4 stable releases |
| Zod | MIT | Schema validation | multiple packages | Follow stable releases |
| PostgreSQL (pg) | MIT | Database driver | apps/worker, packages | Follow stable releases |
| ioredis | MIT | Redis client | apps/worker | Follow stable releases |
| BullMQ | MIT | Background job queue | apps/worker | Follow stable releases |
| Vitest | MIT | Test runner | root | Follow stable releases |
| Playwright | Apache-2.0 | Browser testing | apps/web | Follow stable releases |
| @axe-core/playwright | MIT | Accessibility testing | apps/web | Follow stable releases |
| Lighthouse CI | Apache-2.0 | Performance/SEO auditing | root | Pin to compatible version |
| ESLint | MIT | Linting | root | Follow stable releases |
| Prettier | MIT | Formatting | root | Follow stable releases |
| server-only | MIT | Server-only client import guard | packages/seo-core | Follow stable releases |
| ipaddr.js | MIT | IPv4/IPv6 parsing for SSRF validation | packages/audit-core | Follow stable releases |

A full dependency-policy inventory is maintained in `docs/dependency-policy.md` and reconciled with the lockfile.

## Updates

Before introducing or updating any dependency, the team must record its owner, purpose, license, runtime/bundle impact, and update strategy in the dependency-policy inventory.
