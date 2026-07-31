# Design Spec: Schema Checker Tool (`/tools/schema-checker/`)

**Date:** 2026-07-31  
**Status:** Draft / Pending Review  
**Owner:** SeoVista Engineering Team  

---

## 1. Overview & Purpose

The **Schema Checker** (`/tools/schema-checker/`) is a core free tool under SeoVista's `Free Tools` library (`/tools/`). It allows users to validate JSON-LD and Microdata structured data on any URL, inspect entity clarity for AI search engines (ChatGPT, Perplexity, Google AI Overviews), detect prohibited claims (fabricated ratings, reviews, dataset promises), and view structured graph trees.

---

## 2. Architecture & Data Flow (Option B: Background Worker Pipeline)

```
[ User Input (URL) ]
         │
         ▼
[ Web App Server Action: startSchemaAuditAction ]
         │
         ▼
[ PostgreSQL: Insert Job (type: "schema_audit", status: "queued") ]
         │
         ▼
[ BullMQ Queue: "schema-audit-jobs" ]
         │
         ▼
[ Worker Process: executeSchemaAuditJob ]
   ├── 1. Fetch HTML & execute client JS via Fetcher/DOM Parser
   ├── 2. Extract JSON-LD script blocks & Microdata attributes
   ├── 3. Validate against Zod schemas in `@seovista/schema`
   ├── 4. Check Prohibited Claims via `rejectProhibitedClaims` rules
   ├── 5. Compute Schema Readiness & Entity Clarity Scores (0–100)
   └── 6. Persist Audit Result to PostgreSQL
         │
         ▼
[ Web App Result Page: /tools/schema-checker/result/[jobId] ]
   ├── Summary Cards (Overall Schema Score, Valid Graphs, Issues Found)
   ├── Prohibited Claim Warnings (if any)
   ├── Entity & Type Tree Inspector (Interactive View)
   └── Recommended Crew Services CTA (SEO & Schema optimization)
```

---

## 3. Key Components & Implementation Breakdown

### 3.1 Web Application (`apps/web`)
* **Route 1:** `app/tools/schema-checker/page.tsx` — Input form for target URL with CSRF protection and Server Action handler.
* **Route 2:** `app/tools/schema-checker/result/[jobId]/page.tsx` — Dynamic audit result report page rendering JSON-LD graphs, issues, and compliance scores.
* **Server Action:** `apps/web/src/lib/schema-checker/actions.ts` — Validates inputs, creates job in DB, enqueues worker task, and redirects to result page.
* **UI Components:**
  * `SchemaScoreOverview` — Visual breakdown of validity, entity completeness, and prohibited claims.
  * `SchemaGraphTree` — Interactive tree view of extracted `@graph` nodes.
  * `SchemaIssuesList` — Categorized list of schema errors, warnings, and missing required properties in Turkish.

### 3.2 Worker & Audit Core (`apps/worker` & `packages/schema` / `packages/audit-core`)
* **Job Processor:** `apps/worker/src/processors/schema-audit.ts`
* **Parser & Validator:** Extends `@seovista/schema` (`validate.ts` & `graph.ts`) to support batch validation of extracted JSON-LD payloads.
* **Prohibited Claim Checker:** Detects forbidden fields (`aggregateRating`, `review`, `dataset`, `customerCount`, `award`, `guarantee`, `hiddenFaq`) and flags severe compliance warnings.

---

## 4. UI & Localization Standards

* **Language:** Turkish default for all user-facing issue titles, recommendations, and status badges per PRD §0.3.
* **Accessibility:** Full WCAG 2.1 AA compliance with aria-labels, semantic landmarks (`<main>`, `<section>`, `<dl>`), and no color-only status indicators.

---

## 5. Validation & Testing Strategy

1. **Unit Tests:** `@seovista/schema` unit tests for JSON-LD parser and prohibited claim rejection.
2. **Worker Tests:** Processor tests in `apps/worker` verifying job execution lifecycle.
3. **App Typecheck & Lint:** Zero TypeScript errors (`tsc --noEmit`) and clean ESLint checks across workspace.
