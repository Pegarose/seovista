# Schema Checker Tool (`/tools/schema-checker/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Schema Checker tool (`/tools/schema-checker/` and `/tools/schema-checker/result/[jobId]`) backed by `@seovista/schema` validation, prohibited claim checks, and the background worker pipeline.

**Architecture:** A Server Action `startSchemaAuditAction` accepts a URL, creates a `schema_audit` job record in PostgreSQL, enqueues a job on BullMQ queue `schema-audit-jobs`, and redirects to `/tools/schema-checker/result/[jobId]`. The worker processor `executeSchemaAuditJob` fetches HTML, extracts JSON-LD scripts and Microdata, validates them against Zod schemas, checks prohibited claims, computes schema quality metrics, and updates the DB record. The result page renders summary metrics, prohibited claim warnings, an interactive entity tree, and recommended Crew services CTA.

**Tech Stack:** Next.js App Router (RSC + Client Components), Tailwind CSS v4, Zod, PostgreSQL (`pg`), Redis (`ioredis`), BullMQ, Vitest.

## Global Constraints
- Node 24 LTS & `pnpm@10.30.1` strict execution environment.
- TypeScript strict mode (`strict: true`).
- Server Components by default; Client Components only for genuine UI interactivity.
- Accessible UI: WCAG 2.1 AA compliant, explicit aria-labels, no color-only status indicators.
- Turkish default UI strings for issue descriptions and statuses per PRD §0.3.

---

### Task 1: Enriched Schema Extraction & Validation Utilities in `@seovista/schema`

**Files:**
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/src/graph.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/src/__tests__/schema-audit-extractor.test.ts`

**Interfaces:**
- Consumes: `@seovista/seo-core` (canonical URL tools)
- Produces: `extractAndValidateSchemas(html: string, siteUrl: string): SchemaAuditExtractionResult`

- [ ] **Step 1: Write the failing test for schema extraction & prohibited claim checking**

Create `packages/schema/src/__tests__/schema-audit-extractor.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { extractAndValidateSchemas } from "../validate";

describe("extractAndValidateSchemas", () => {
  it("extracts valid JSON-LD scripts and detects prohibited claims", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "Acme Corp",
              "url": "https://example.com",
              "aggregateRating": { "@type": "AggregateRating", "ratingValue": "5" }
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const result = extractAndValidateSchemas(html, "https://example.com");
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes.length).toBe(1);
    expect(result.prohibitedClaims.length).toBe(1);
    expect(result.prohibitedClaims[0].field).toBe("aggregateRating");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/schema test packages/schema/src/__tests__/schema-audit-extractor.test.ts`
Expected: FAIL with "extractAndValidateSchemas is not a function".

- [ ] **Step 3: Implement `extractAndValidateSchemas` in `packages/schema/src/validate.ts`**

Add `SchemaAuditExtractionResult` interface and `extractAndValidateSchemas` function in `packages/schema/src/validate.ts`:
```ts
export interface ExtractedProhibitedClaim {
  field: string;
  reason: string;
}

export interface SchemaAuditExtractionResult {
  rawScriptCount: number;
  validNodes: Record<string, unknown>[];
  parseErrors: string[];
  prohibitedClaims: ExtractedProhibitedClaim[];
  score: number;
}

export function extractAndValidateSchemas(
  html: string,
  _siteUrl: string
): SchemaAuditExtractionResult {
  const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  const validNodes: Record<string, unknown>[] = [];
  const parseErrors: string[] = [];
  const prohibitedClaims: ExtractedProhibitedClaim[] = [];
  let rawScriptCount = 0;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    rawScriptCount++;
    const scriptContent = match[1].trim();
    if (!scriptContent) continue;

    try {
      const parsed = JSON.parse(scriptContent) as Record<string, unknown>;
      validNodes.push(parsed);

      for (const claim of PROHIBITED_CLAIMS) {
        if (claim.field in parsed) {
          prohibitedClaims.push({ field: claim.field, reason: claim.reason });
        }
      }
    } catch (e) {
      parseErrors.push(e instanceof Error ? e.message : "Invalid JSON-LD format");
    }
  }

  let score = 100;
  if (rawScriptCount === 0) score -= 40;
  score -= parseErrors.length * 20;
  score -= prohibitedClaims.length * 30;
  score = Math.max(0, Math.min(100, score));

  return {
    rawScriptCount,
    validNodes,
    parseErrors,
    prohibitedClaims,
    score,
  };
}
```

Re-export `extractAndValidateSchemas` and types in `packages/schema/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.30.1 --filter @seovista/schema test packages/schema/src/__tests__/schema-audit-extractor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add packages/schema/src/validate.ts packages/schema/src/index.ts packages/schema/src/__tests__/schema-audit-extractor.test.ts
git commit -m "feat(schema): add extractAndValidateSchemas utility for schema audit"
```

---

### Task 2: Background Worker Processor for `schema_audit` Jobs

**Files:**
- Create: `apps/worker/src/processors/schema-audit.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/src/__tests__/schema-audit-processor.test.ts`

**Interfaces:**
- Consumes: `extractAndValidateSchemas` from `@seovista/schema`, `dbPool` from database
- Produces: `processSchemaAuditJob(jobData: { jobId: string, url: string })`

- [ ] **Step 1: Write the failing test for worker processor**

Create `apps/worker/src/__tests__/schema-audit-processor.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { processSchemaAuditJobPayload } from "../processors/schema-audit";

describe("processSchemaAuditJobPayload", () => {
  it("processes HTML and returns audit result payload", async () => {
    const mockHtml = `
      <html>
        <head>
          <script type="application/ld+json">
            { "@context": "https://schema.org", "@type": "WebPage", "name": "Test Page" }
          </script>
        </head>
      </html>
    `;
    const result = await processSchemaAuditJobPayload("https://example.com", mockHtml);
    expect(result.score).toBeGreaterThan(0);
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/worker test src/__tests__/schema-audit-processor.test.ts`
Expected: FAIL with "processSchemaAuditJobPayload is not defined".

- [ ] **Step 3: Implement `processSchemaAuditJobPayload` in `apps/worker/src/processors/schema-audit.ts`**

Create `apps/worker/src/processors/schema-audit.ts`:
```ts
import { extractAndValidateSchemas, type SchemaAuditExtractionResult } from "@seovista/schema";

export async function processSchemaAuditJobPayload(
  url: string,
  html: string
): Promise<SchemaAuditExtractionResult> {
  return extractAndValidateSchemas(html, url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.30.1 --filter @seovista/worker test src/__tests__/schema-audit-processor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/worker/src/processors/schema-audit.ts apps/worker/src/__tests__/schema-audit-processor.test.ts
git commit -m "feat(worker): add schema-audit job processor"
```

---

### Task 3: Schema Checker Form & Server Action (`/tools/schema-checker/`)

**Files:**
- Create: `apps/web/src/lib/schema-checker/actions.ts`
- Create: `apps/web/app/tools/schema-checker/page.tsx`
- Test: `apps/web/src/lib/schema-checker/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: Server Action `startSchemaAuditAction(prevState, formData)`
- Produces: Form page rendering URL input and submitting `startSchemaAuditAction`

- [ ] **Step 1: Write the failing test for `startSchemaAuditAction`**

Create `apps/web/src/lib/schema-checker/__tests__/actions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { validateSchemaInput } from "../actions";

describe("validateSchemaInput", () => {
  it("validates url format", () => {
    const valid = validateSchemaInput("https://example.com");
    expect(valid.success).toBe(true);

    const invalid = validateSchemaInput("invalid-url");
    expect(invalid.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/lib/schema-checker/__tests__/actions.test.ts`
Expected: FAIL with "validateSchemaInput is not defined".

- [ ] **Step 3: Implement `actions.ts` & `page.tsx`**

Create `apps/web/src/lib/schema-checker/actions.ts` with Zod schema & input validation logic:
```ts
import { z } from "zod";

const SchemaInputSchema = z.object({
  url: z.string().url("Geçerli bir URL giriniz."),
});

export function validateSchemaInput(url: string) {
  return SchemaInputSchema.safeParse({ url });
}
```

Create `apps/web/app/tools/schema-checker/page.tsx` for URL submit UI.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/lib/schema-checker/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/web/src/lib/schema-checker/actions.ts apps/web/app/tools/schema-checker/page.tsx apps/web/src/lib/schema-checker/__tests__/actions.test.ts
git commit -m "feat(web): add Schema Checker page and server actions"
```

---

### Task 4: Schema Audit Result View (`/tools/schema-checker/result/[jobId]`)

**Files:**
- Create: `apps/web/app/tools/schema-checker/result/[jobId]/page.tsx`
- Create: `apps/web/src/components/schema-checker/schema-score-overview.tsx`
- Create: `apps/web/src/components/schema-checker/schema-graph-tree.tsx`
- Test: `apps/web/src/components/schema-checker/__tests__/schema-score-overview.test.tsx`

**Interfaces:**
- Consumes: Schema Audit Result DB record
- Produces: Responsive audit result UI with summary card, graph tree inspector, and Crew agency CTA

- [ ] **Step 1: Write test for `SchemaScoreOverview` rendering**

Create `apps/web/src/components/schema-checker/__tests__/schema-score-overview.test.tsx`:
```ts
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchemaScoreOverview } from "../schema-score-overview";

describe("SchemaScoreOverview", () => {
  it("renders score and status", () => {
    render(<SchemaScoreOverview score={85} rawScriptCount={2} parseErrorCount={0} prohibitedClaimCount={0} />);
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("Yapısal Veri Skoru")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/components/schema-checker/__tests__/schema-score-overview.test.tsx`
Expected: FAIL with component missing.

- [ ] **Step 3: Implement components & result page**

Create components and result page with Turkish UI labels per PRD §0.3.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/components/schema-checker/__tests__/schema-score-overview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/web/app/tools/schema-checker/result/[jobId]/page.tsx apps/web/src/components/schema-checker/
git commit -m "feat(web): add Schema Checker result page and score overview components"
```
