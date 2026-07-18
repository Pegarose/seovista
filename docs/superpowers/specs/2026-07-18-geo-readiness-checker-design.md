# SeoVista GEO Readiness Checker (MVP 1) Design Spec

**Status:** Design approved in conversation, pending written-spec review
**Date:** 2026-07-18
**Scope:** BullMQ/PostgreSQL polling infrastructure, SSRF-safe OpenSEO wrapper, Geo-engine scoring, and Gated Lead Capture UI.

## 1. Purpose and Scope

The GEO Readiness Checker is SeoVista's flagship MVP 1 tool designed to generate qualified leads by providing immediate, credible value. It evaluates a given URL for AI Search readiness (Access, Understanding, Evidence). It enforces a strict timeout, prevents SSRF attacks, leverages existing OpenSEO audit functions (wrapped securely), and stores immutable job lifecycle states in PostgreSQL. The frontend uses a React Client Component polling architecture against Server Actions to decouple the stateless UI edge from the long-running worker.

## 2. Non-Goals

- Providing a raw connection from the Next.js frontend to BullMQ/Redis (Next.js exclusively talks to the Postgres DB as the source of truth).
- Establishing long-lived Websockets or SSE streams that can timeout on Vercel/Cloudflare limits.
- Asking for an email immediately before *any* value is provided.
- Persisting detailed results as public content in the CMS or `sitemap.xml`; tool outputs are strictly `noindex, no-store`.
- Using DataForSEO live credits indiscriminately; checking relies on heavily mocked configurations in Sprint 0/1 until explicit billing constraints are greenlit.

## 3. Architecture and Data Flow

### 3.1 Data Model (PostgreSQL Authority)

PostgreSQL holds the state of the audit, ensuring jobs remain durable across worker restarts.

*   **`audit_leads`:** Stores the user’s submission constraints.
    *   `id`: UUID
    *   `domain`, `brand_name`, `market`
    *   `work_email` (nullable, updated upon capturing the lead gate)
    *   `marketing_consent` (boolean, explicitly opted-in)
*   **`job_records`:** Extended or utilizing the core `job_records` from previous migrations.
    *   `id`: UUID
    *   `lead_id`: References `audit_leads`
    *   `status`: `'queued' | 'running' | 'completed' | 'failed'`
    *   `target_url`: The verified, normalized URL to process
*   **`job_results`:**
    *   `id`: UUID
    *   `job_id`: References `job_records`
    *   `methodology_version`: String (e.g., "v1.0")
    *   `result`: JSONB conforming strictly to `GeoReadinessResult` from `@seovista/geo-engine`.

### 3.2 Request Phase & SSRF Defenses

1. Users submit the URL and base metrics on `/tools/geo-readiness-checker` via a Server Action.
2. The Server Action routes the URL through `packages/audit-core` security primitives.
    *   DNS is resolved; requests mapped to `127.0.0.1`, `10.0.0.0/8`, `169.254.169.254` (cloud metadata), or missing a scheme are rejected immediately.
3. Upon clean validation, rate limiting checks occur securely via Redis.
4. An entry in `audit_leads` and `job_records` is created (`status: 'queued'`).
5. A message containing the `job_id` is pushed to BullMQ.
6. The Server Action `redirect()`s the user to `/tools/geo-readiness-checker/result/[jobId]`.

### 3.3 Background Execution (Worker)

1. The `apps/worker` Node process continuously listens to the queue.
2. It assumes a job. It writes `status = 'running'` to `job_records`.
3. It utilizes the `packages/open-seo-adapter` facade to instantiate the raw check modules. The worker runs an isolated check subject to a strict 10-second `AbortController` timeout network constraint.
    *   **Access:** Robots.txt parsing, AI bot exclusions, canonical setup.
    *   **Understanding:** Checks for `Organization`, `Person`, `Article` JSON-LD graphs, and header structures.
    *   **Evidence:** Source linkages, authorship presence.
4. The raw metrics are piped to `packages/geo-engine/src/scoring.ts` to output a predictable 1-100 `GeoReadinessResult` block.
5. The worker updates `job_results` with the JSONB payload and transitions `job_records` to `'completed'` or `'failed'` then finishes.

### 3.4 Polling UI & Lead Capture Gate

1. When the user lands on `/tools/geo-readiness-checker/result/[jobId]`, a Client Component (`AuditPoller`) initializes.
2. It pings a Server Action `getJobState(jobId)` every 3 seconds.
3. While `status !== 'completed' && status !== 'failed'`, brand-aligned loader logic is displayed (e.g., "Verifying entity graphs...", "Checking AI crawler accessibility...").
4. Once completed, the Poller unmounts and hands off execution to the `SummaryView` component.
5. The `SummaryView` reveals the basic sub-scores (Access, Understanding).
6. A form blocks the highly detailed PDF breakdown and recommendation table (**Gated Report**):
    *   "Enter work email to unlock the detailed AI visibility report."
    *   "Marketing Consent" (unchecked by default)
7. On submission, the Server Action updates `audit_leads.work_email` and transitions the view or provides the download link.

## 4. Output Contracts & Caching Protections

-   All routes operating under `/tools/geo-readiness-checker/result/[jobId]` must output strict caching headers:
    *   `Cache-Control: private, no-store, max-age=0`
-   Headers must broadcast `X-Robots-Tag: noindex, nofollow` to guarantee audits do not bloat Canonical or Search Engine Index scopes.
-   Audits do not map into `sitemap.xml`, `feed.xml`, `llms.txt`, or JSON-LD WebPage graphs. They remain temporary private utility views.

## 5. Migrations & Implementation Scope

-   New PostgreSQL tables and indexes mapping `audit_leads` bridging over `job_records`.
-   The strict boundary creation inside `packages/open-seo-adapter`. Raw `every-app/open-seo` models are not passed to the Next.js frontend. They must be resolved into `@seovista/geo-engine` results first.
-   Component builds respecting `@theme` tokens in Tailwind CSS v4, omitting DaisyUI or external third-party CSS.

## 6. Testing Acceptance Criteria

-   A malicious localhost payload input `http://127.0.0.1:5432` must be violently rejected by `audit-core` without triggering a BullMQ task.
-   If a worker job gracefully times out internally, the polling UI must successfully stop and render a user-friendly generic timeout error, instructing them to try again.
-   Emails cannot be demanded before the initial "Summary" payload arrives successfully in the UI.
