# SeoVista — AI Developer Implementation Brief v1.0

<aside>
🤖

**Mission:** Build SeoVista as a production-grade, English-first GEO & Search Visibility platform. The implementation must be technically excellent at launch, use NextG CMS, reuse selected OpenSEO engine components responsibly and never ship fabricated data or unsupported AI visibility claims.

</aside>

## 0. Source of truth

- Product, brand, content, routes and acceptance criteria: [SeoVista PRD v1.0](https://app.notion.com/p/SeoVista-Global-GEO-Search-Visibility-Website-PRD-v1-0-d77aecaf860f44f3aed30eb9c0a82c65?pvs=21)
- This document controls implementation sequencing and engineering constraints.
- If code, mockups or generated copy conflict with the PRD, the PRD wins.
- Do not reinterpret `premium` as neon SaaS, glassmorphism or a dashboard-heavy template.

## 1. Product objective

Build a global English-first website and initial tool platform that positions SeoVista around:

> **Be found. Be understood. Be cited.**
> 

Primary conversion: `Get a GEO Audit`.

Initial tool conversion: `Check your AI readiness`.

The MVP must launch with working public pages, a truthful GEO Readiness Checker, compliant lead capture and technically valid SEO/GEO foundations.

## 2. Binding stack

- Next.js App Router
- React Server Components by default
- TypeScript with `strict: true`; no untyped business logic
- Tailwind CSS v4 with project `@theme` tokens
- GMedya proprietary **NextG CMS**; do not install Payload
- PostgreSQL
- Redis + BullMQ worker for audits and reports
- S3-compatible storage or Cloudflare R2
- Cloudflare DNS/CDN/WAF
- pnpm monorepo
- Vitest + Playwright + Lighthouse CI + axe

Do not replace Next.js with Vite/TanStack. OpenSEO is not the application shell.

## 3. Repository bootstrap

```
apps/
  web/
  nextg/
  worker/

packages/
  ui/
  seo-core/
  schema/
  content-models/
  audit-core/
  open-seo-adapter/
  dataforseo/
  geo-engine/
  reports/
  analytics/
```

### Required root files

- `AGENTS.md` — engineering rules and source-of-truth links
- `README.md` — local setup, architecture and commands
- `.env.example` — variable names only; never secrets
- `THIRD_PARTY_NOTICES.md` — OpenSEO MIT attribution and other reused licenses
- `SECURITY.md` — vulnerability and secret-handling policy
- `pnpm-workspace.yaml`
- shared TypeScript, formatting, lint and test configurations

### Standard commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:a11y
pnpm test:seo
```

No branch is release-ready unless `build`, typecheck, lint, unit, smoke, accessibility and SEO validation pass.

## 4. Environment contract

Document and validate environment variables at boot with Zod. Expected categories:

```
NEXT_PUBLIC_SITE_URL
DATABASE_URL
REDIS_URL
NEXTG_API_URL
NEXTG_API_TOKEN
DATAFORSEO_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
EMAIL_PROVIDER_API_KEY
EMAIL_FROM
SENTRY_DSN
NEXT_PUBLIC_ANALYTICS_ID
AUDIT_DAILY_COST_LIMIT
AUDIT_PER_IP_RATE_LIMIT
REPORT_SIGNING_SECRET
```

Separate server-only and public variables. A secret referenced by client code is a release blocker.

## 5. Public route contract

Build these routes first:

```
/
/geo/
/seo/
/digital-authority/
/tools/
/tools/geo-readiness-checker/
/about/
/contact/
/insights/
/privacy/
/cookies/
/terms/
```

Phase 1.1:

```
/tools/ai-crawler-checker/
/tools/schema-checker/
/tools/serp-preview/
```

System routes:

```
/robots.txt
/sitemap.xml
/llms.txt
/feed.xml
/manifest.webmanifest
```

Use `trailingSlash: true`. Do not publish empty Platform, Pricing, Case Studies or Tools cards. An absent route is better than a placeholder route.

## 6. Render and component rules

- Main content, headings, links, tables and citations must be present in the first HTML response.
- Use Server Components unless browser state or interaction is required.
- Do not fetch essential page copy in `useEffect`.
- Do not apply `use client` to complete layouts or route trees.
- Use semantic elements: `main`, `article`, `section`, `nav`, `aside`, `figure`, `figcaption`, `time`.
- One descriptive H1 per page.
- Heading levels must not be selected for visual size.
- Links must remain crawlable `<a href>` links.
- All tool states must be keyboard operable and announced correctly to assistive technology.

## 7. NextG CMS integration

Create typed contracts for:

- Pages
- Services
- Tools
- Articles
- Authors
- Organizations
- Research Reports
- Definitions
- FAQs
- Sources
- Redirects
- Locales
- Audit Leads

Do not let frontend components depend directly on raw CMS responses. Add a mapping layer in `content-models`.

Each editorial item needs:

- title and slug
- short direct answer
- description/body
- author and optional reviewer
- publish and modified timestamps
- sources/citations
- main entity and related entities
- locale and translated counterpart
- canonical override with validation
- social image
- index/noindex control

Preview and draft content must never leak into production, sitemap, feed or JSON-LD.

## 8. Metadata and canonical engine

Implement one typed metadata builder in `packages/seo-core`.

For every indexable route generate:

- unique title
- unique description
- absolute canonical
- Open Graph
- social card metadata
- robots policy
- locale metadata
- publish/modified dates where relevant

Rules:

- canonical uses the final trailing-slash URL
- query/filter/tool-state URLs default to canonical base URL or `noindex` as defined
- no hreflang until a true translated equivalent exists
- redirect chains are forbidden
- production hostname must never be inferred from an untrusted request header

## 9. JSON-LD graph engine

Create centralized graph builders in `packages/schema` with stable entity IDs:

```
https://seovista.com/#organization
https://seovista.com/#website
https://seovista.com/about/#brand
```

Required builders:

- Organization
- WebSite
- WebPage
- Service
- Person
- Article/BlogPosting
- BreadcrumbList
- WebApplication/SoftwareApplication
- FAQPage
- DefinedTerm where justified

JSON-LD must be server-rendered and derived from validated CMS/domain models.

Never generate:

- fake AggregateRating
- invisible FAQ content
- fabricated reviews
- invented customers or usage numbers
- Dataset without accessible data and methodology
- SoftwareApplication for a non-working tool

Add snapshot and parser tests for every schema template.

## 10. OpenSEO integration strategy

Upstream: [every-app/open-seo](https://github.com/every-app/open-seo), MIT licensed.

### Initial repository procedure

1. Record the reviewed upstream commit hash.
2. Create `docs/open-seo-adoption.md` listing every adapted file/module.
3. Copy or port only approved modules into `packages/open-seo-adapter`.
4. Preserve required MIT notices.
5. Wrap upstream-specific types behind SeoVista-owned interfaces.
6. Add tests before changing behavior.
7. Do not configure automatic upstream merges.

### Approved reuse scope

- DataForSEO integration and normalization patterns
- technical audit checks
- robots and XML parsing
- indexability, redirect, head-tag and structure checks
- `badseo` fixtures for audit regression tests
- GSC OAuth/data flow as a reviewed reference
- MCP design patterns and selected workflow logic for later phases

### Explicitly excluded

- OpenSEO Vite/TanStack shell
- DaisyUI and OpenSEO visual components
- Cloudflare D1/Durable Objects as mandatory core architecture
- OpenSEO brand, copy and routes
- “AI Visibility” calculations without independent validation

### Dependency policy

Do not add an upstream dependency merely because OpenSEO uses it. Every dependency requires an owner, purpose, license check, bundle/runtime impact assessment and update strategy.

## 11. GEO Readiness Checker v1

### Inputs

- normalized public website URL
- brand name
- primary market
- work email only when detailed report is requested
- explicit marketing consent as a separate unchecked field

### Credible v1 checks

**Access**

- robots.txt availability and syntax
- Google and approved AI crawler directives
- sitemap discovery
- HTTP status, redirect and canonical health
- indexability/meta robots

**Understanding**

- Organization/Person/Article schema presence and validity
- entity identifier consistency
- `sameAs` completeness indicators
- heading and semantic structure
- About, author and editorial-policy discoverability

**Evidence**

- visible authorship and modified date
- source/citation patterns
- first-party statistics and methodology indicators
- answer-first summaries, definitions and structured tables

**Authority readiness**

- evidence of credible external references only where licensed data is available
- no assertion that a backlink metric directly predicts AI citation

### Scoring

Implement an explicit versioned scoring contract:

```tsx
type GeoReadinessResult = {
  methodologyVersion: string
  auditedAt: string
  target: string
  scores: {
    access: number
    understanding: number
    evidence: number
    authorityReadiness: number | null
    overall: number
  }
  checks: AuditCheckResult[]
  priorities: Recommendation[]
  limitations: string[]
}
```

Weights and pass/fail rules must live in version-controlled configuration, not UI components. Every result must show limitations and methodology version.

Do not query ChatGPT/Gemini/Perplexity and label the result “AI visibility” in v1 unless a separately approved measurement specification exists.

## 12. Audit security and job flow

```
request
→ input validation
→ SSRF-safe URL normalization
→ rate/cost check
→ audit record
→ BullMQ job
→ worker crawl
→ normalized findings
→ PostgreSQL result
→ summary UI
→ optional signed detailed report
```

Required protections:

- block [localhost](http://localhost), private networks, metadata IPs and non-HTTP protocols
- resolve and re-check DNS before requests and redirects
- maximum redirects, pages, response size and execution time
- content-type validation
- robots-aware crawling policy
- per-IP and per-account rate limits
- CAPTCHA after abuse threshold
- DataForSEO cost ledger and daily hard ceiling
- encryption for OAuth tokens
- signed, expiring private report links
- audit logs without storing unnecessary page content

## 13. Design implementation

Implement the PRD’s **Editorial Intelligence Lab** direction.

Design tokens:

```css
--ink: #0A1017;
--graphite: #121B24;
--mineral: #F3F1EB;
--paper: #FCFBF7;
--signal-green: #66E3B4;
--spectral-blue: #6C8CFF;
--muted: #697684;
--border-light: #D8DDD9;
```

- 1320px maximum content container
- premium editorial spacing
- deep-ink data sections alternating with mineral surfaces
- Citation Graph as the signature visual system
- no stock 3D characters
- no random gradients/blobs
- no infinite logo marquee
- no fake dashboard screenshots
- motion restricted to opacity/transform with reduced-motion support

Build real UI states for tools: empty, validating, queued, running, partial result, complete, rate-limited and error.

## 14. Analytics and lead handling

Typed events:

- `tool_start`
- `tool_complete`
- `audit_request`
- `report_request`
- `qualified_lead`
- `audit_error`
- `api_cost_recorded`

Do not send emails, full URLs with sensitive query parameters, report contents or audit page HTML to analytics.

Lead requirements:

- immediate value before gating detailed output
- separate marketing consent
- visible privacy purpose
- deduplication
- source/UTM preservation
- CRM/email delivery retry and monitoring

## 15. Automated SEO/GEO quality gate

CI must validate representative route fixtures for:

- HTTP 200
- one H1
- title and description presence/uniqueness
- absolute canonical
- valid robots directive
- parseable JSON-LD
- breadcrumb accuracy
- sitemap inclusion/exclusion
- hreflang reciprocity when introduced
- no broken internal links
- image dimensions and alt policy
- no client-only essential content
- Lighthouse budgets
- axe violations

Create a production smoke test that checks robots, sitemap, canonical hostname and a sample JSON-LD graph after deployment.

## 16. Delivery phases

### Sprint 0 — Foundation

- [ ]  monorepo and CI
- [ ]  NextG typed adapter
- [ ]  Tailwind v4 token system
- [ ]  route and layout skeleton
- [ ]  metadata/canonical engine
- [ ]  JSON-LD graph engine
- [ ]  PostgreSQL/Redis/worker connectivity
- [ ]  OpenSEO adoption record and commit pin
- [ ]  security baseline

### Sprint 1 — Credible public site

- [ ]  homepage
- [ ]  GEO page
- [ ]  SEO page
- [ ]  Digital Authority page
- [ ]  About and Contact
- [ ]  legal pages and consent
- [ ]  insights index and one complete article template
- [ ]  robots, sitemap, llms.txt and feed

### Sprint 2 — GEO Readiness Checker

- [ ]  request and job flow
- [ ]  SSRF-safe fetcher
- [ ]  access/understanding/evidence checks
- [ ]  scoring v1
- [ ]  summary results
- [ ]  detailed report generation
- [ ]  rate limits, cache and cost controls
- [ ]  lead delivery and analytics

### Sprint 3 — Launch hardening

- [ ]  mobile and accessibility audit
- [ ]  Core Web Vitals optimization
- [ ]  structured-data validation
- [ ]  security review
- [ ]  error monitoring and alerting
- [ ]  production smoke tests
- [ ]  verified proof/claims review
- [ ]  GMedya link readiness

### Phase 1.1

- [ ]  AI Crawler Checker
- [ ]  Schema & Entity Checker
- [ ]  SERP Preview
- [ ]  three expert English insights
- [ ]  SeoVista-aware handoff to BasınOdam infrastructure

## 17. Non-negotiable prohibitions

- Do not fabricate customers, reviews, citations, rankings, datasets or results.
- Do not claim guaranteed AI citations or Google rankings.
- Do not represent `llms.txt` as a ranking factor.
- Do not expose DataForSEO or OAuth credentials to the browser.
- Do not index private reports, account pages or audit states.
- Do not copy Semrush, Semust, Zeo, Dopinger or OpenSEO visuals/copy.
- Do not introduce [Backlinkler.com](http://Backlinkler.com) or [BacklinkWire.com](http://BacklinkWire.com) as launch brands.
- Do not publish demo publisher inventory.
- Do not replace working server-rendered content with client-only effects.

## 18. Definition of done for launch

Launch is complete only when:

1. All required routes contain final English content.
2. The GEO Readiness Checker produces real, reproducible findings.
3. Methodology version and limitations appear in results.
4. NextG drafts are excluded from production.
5. Canonicals, robots, sitemap, feed and JSON-LD pass automated validation.
6. Representative mobile templates meet performance budgets.
7. Forms, consent, notifications and analytics are tested end to end.
8. Secrets, SSRF, abuse and API cost controls pass review.
9. No placeholder proof or unsupported GEO claim remains.
10. GMedya can link to SeoVista as a complete live company—not a coming-soon project.

---

## First action for the AI developer

Start with **Sprint 0 only**. Produce the repository skeleton, architecture decision records, NextG adapter contract, metadata/schema test fixtures, OpenSEO adoption inventory and CI pipeline before generating final marketing pages. Do not build the dashboard or add additional tools until the foundation tests pass.