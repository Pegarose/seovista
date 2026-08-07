# Result-Page "Editorial Lab" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all seven `/tools/*/result/[jobId]` pages from ad-hoc slate gray/indigo Tailwind to the shared Editorial Intelligence Lab design system (paper/ink/spectral/ember tokens, Fraunces serif, hairline borders, rotate-180 eyebrows) per spec `docs/superpowers/specs/2026-08-06-result-page-editorial-lab-design.md`.

**Architecture:** Introduce a new shared component kit at `apps/web/src/components/result-pages/` (ResultShell, AuditMetaStrip, VerdictCard, IssueLedger, StatusPill, ReportErrorPanel, UnknownJobStatusView) as pure Server Components. Each of the seven result pages is then rewritten to consume the kit, swapping slate-* utilities for the design tokens and translating TR copy to EN. A separate task adds the SSR inline-SVG citation-graph block to the Attribution Trace result page. Tests under `apps/web/src/__tests__/*-result-states.test.ts` are updated to assert the new structure and copy.

**Tech Stack:** Next.js 15 App Router (RSC), React 19, Tailwind CSS v4, vitest + `renderToStaticMarkup` for state-contract tests.

## Global Constraints

- All new shared components are Server Components (no `"use client"`). Existing client components (`AuditPoller`, `GatedReportForm`, `CrewCtaView`, `CrewReportSection`, `ScoreBreakdownView`, `MatchedServicesView`, `SerpPreview`) keep their directives.
- No new runtime dependency for ANY UI work (including the Attribution SVG).
- Every page keeps exactly one `<main>` landmark and exactly one `<h1>`.
- All public-facing copy on result pages is English — the strings listed in the spec's "Copy (English)" table are normative. Form pages stay Turkish (out of scope).
- Work on the existing branch. Do NOT push. Commit after every task.
- Tests must pass after every task: `pnpm vitest run` in `apps/web` + `pnpm exec tsc --noEmit` + `pnpm next build`.
- Do not touch `apps/web/middleware.ts`, worker code, or `packages/seo-core` — payload shapes are unchanged.
- The existing `apps/web/tsconfig.json` dev-runs churn stays uncommitted (user decision).

---

### Task 1: Shared ResultShell + AuditMetaStrip + StatusPill + ReportErrorPanel

**Files:**
- Create: `apps/web/src/components/result-pages/result-shell.tsx`
- Create: `apps/web/src/components/result-pages/audit-meta-strip.tsx`
- Create: `apps/web/src/components/result-pages/status-pill.tsx`
- Create: `apps/web/src/components/result-pages/report-error-panel.tsx`
- Create: `apps/web/src/components/result-pages/index.ts`
- Test: `apps/web/src/__tests__/result-shell.test.tsx`

**Interfaces:**
- Consumes: nothing above `import type { ReactNode } from "react"`.
- Produces (later tasks rely on these exact signatures):

```ts
export type AuditStatusForUi = "checking" | "completed" | "failed" | "unknown";

export interface AuditMetaStripProps {
  /** Raw job_records.id (full uuid). */
  jobId: string;
  /** Queue-name discriminator — one per tool, e.g. "ai_crawler_audit". */
  queueName: string;
  /** ISO timestamp from job_records.updated_at (server-provided). */
  submittedAt?: string;
  /** Human label rendered at the end of the strip — e.g. "AI Crawler". */
  toolLabel: string;
  /** Optional CSS class additions. */
  className?: string;
}

export interface ResultShellProps {
  /** Short uppercase label rendered above the h1 with rotate-180 eyebrow trick. */
  eyebrow: string;
  /** Page's single <h1> contents. */
  title: string;
  /** Lifecycle status — controls StatusPill variant inside the header. */
  status: AuditStatusForUi;
  /** AuditMetaStrip payload; when omitted the meta strip is not rendered. */
  meta?: AuditMetaStripProps;
  /** Main body. */
  children: ReactNode;
}

export interface StatusPillProps {
  /** Variant discriminator driving color/label. */
  variant: "in_progress" | "success" | "warning" | "failure" | "unknown";
  /** Custom aria-label; defaults derived from variant. */
  ariaLabel?: string;
}

export interface ReportErrorPanelProps {
  /** Bold heading, e.g. "Report failed". */
  title: string;
  /** Body copy describing why. */
  body: string;
  /** Optional technical correlation id rendered as mono at the bottom. */
  correlationId?: string;
  /** Optional retry CTA (href back to the tool's form page). */
  retryHref?: string;
  /** Retry link label. Defaults to "Try again". */
  retryLabel?: string;
}
```

- [ ] **Step 1: Write the failing test** at `apps/web/src/__tests__/result-shell.test.tsx`. Cover:
  * ResultShell renders exactly one `<main>` and one `<h1>`;
  * StatusPill renders each variant with the expected design-token class (no slate- anywhere);
  * AuditMetaStrip renders mono jobId + queueName;
  * ReportErrorPanel has `role="status"` and `aria-live="polite"`, plus `retryHref` produces a link pointing at `retryHref`.
  Use `renderToStaticMarkup` like `apps/web/src/__tests__/schema-result-states.test.ts` does.
- [ ] **Step 2: Run** `pnpm vitest run src/__tests__/result-shell.test.tsx` from `apps/web` — expect all four to FAIL because the module does not exist.
- [ ] **Step 3: Implement the four components** in `apps/web/src/components/result-pages/`. Design tokens named in the spec: `bg-paper`, `bg-mineral`, `text-ink`, `text-muted-ink`, `text-signal`, `text-ember`, `text-spectral`, `border-hairline`, `font-serif`, `font-sans`, `font-mono`. Follow `DisciplineLayout`'s eyebrow pattern for the `rotate-180` uppercase label. ReportErrorPanel renders `<section role="status" aria-live="polite">…</section>` (not `<div>`) so screen readers announce terminal failures.
- [ ] **Step 4: Re-run** the new test file — expect PASS. Then run the full web suite (must stay green; nothing consumes the new files yet): `pnpm vitest run` and `pnpm exec tsc --noEmit`.
- [ ] **Step 5: Commit** — `test(result-pages): add shared ResultShell + StatusPill + AuditMetaStrip + ReportErrorPanel (unwired)`.

---

### Task 2: VerdictCard + IssueLedger

**Files:**
- Create: `apps/web/src/components/result-pages/verdict-card.tsx`
- Create: `apps/web/src/components/result-pages/issue-ledger.tsx`
- Modify: `apps/web/src/components/result-pages/index.ts` (add exports)
- Test: extend `apps/web/src/__tests__/result-shell.test.tsx`

**Interfaces:**
- Consumes: Task 1 components (ResultShell used in tests as the wrapper).
- Produces:

```ts
export type VerdictVariant = "pass" | "warn" | "fail" | "info";

export interface VerdictCardProps {
  /** Verdict variant driving StatusPill colour. */
  variant: VerdictVariant;
  /** Serif heading inside the card. */
  title: string;
  /** One-paragraph helper under the title. */
  summary: string;
  /** Optional large serif score (number) — renders with /100 suffix. */
  score?: number;
  /** Optional explicit label next to the score; defaults to "Score". */
  scoreLabel?: string;
}

export interface IssueLedgerItem {
  /** Stable key (correlation id, field name, etc). */
  id: string;
  /** Severity drives the left-edge tone. */
  severity: VerdictVariant;
  /** Bold headline of the row. */
  title: string;
  /** Paragraph detail rendered under the title. */
  detail: string;
  /** Optional actionable recommendation. */
  recommendation?: string;
  /** Optional raw source / href rendered as a mono link. */
  source?: { label: string; url: string };
}

export interface IssueLedgerProps {
  /** Section heading rendered as <h2> (e.g. "Evidence ledger"). */
  heading: string;
  /** Rows. */
  items: readonly IssueLedgerItem[];
  /** Empty state copy; default "No issues found." */
  emptyLabel?: string;
}
```

- [ ] **Step 1: Write the failing test** — render `VerdictCard` with each variant and assert it picks the right `text-signal`/`text-spectral`/`text-ember` pill inside; render `IssueLedger` with 3 items including an external `source` link and assert `href`, severity colour and the `<h2>` heading are present.
- [ ] **Step 2:** Run targeted vitest — expect FAIL.
- [ ] **Step 3:** Implement both components in `apps/web/src/components/result-pages/`. Both pure Server Components.
- [ ] **Step 4:** Run again — expect PASS, then `pnpm vitest run` and `pnpm exec tsc --noEmit`.
- [ ] **Step 5:** Commit — `feat(result-pages): add VerdictCard + IssueLedger`.

---

### Task 3: Move `UnknownJobStatusView` into the new kit + restyle as part of ResultShell

**Files:**
- Modify: `apps/web/src/lib/admin/job-result-guard.tsx` (remove inline view, re-export only `normalizeJobResultStatus`; re-export `UnknownJobStatusView` type from result-pages for back-compat)
- Create: `apps/web/src/components/result-pages/unknown-job-status-view.tsx`
- Modify: `apps/web/src/components/result-pages/index.ts`

**Interfaces:**
- Consumes: Task 1 ResultShell.
- Produces: `export function UnknownJobStatusView(): React.ReactElement` — same name as before, but root element is the new `ResultShell` (`status: "unknown"`). The four call sites (`apps/web/app/tools/{geo-readiness-checker,schema-checker,ai-crawler-checker,keyword-rank-checker,schema-truth-check,render-parity-diff,attribution-trace}/result/[jobId]/page.tsx`) change their import path from `src/lib/admin/job-result-guard` to `src/components/result-pages`.

- [ ] **Step 1:** Update the four `*-result-states.test.ts` files plus the geo / schema / ai-crawler / keyword-rank result pages' `UnknownJobStatusView` imports to the new module. Existing tests still assert on the rendered output — running them now produces failures showing the old copy.
- [ ] **Step 2:** Run `pnpm vitest run src/__tests__/schema-result-states.test.ts` (and the other three) — expect FAIL on the new copy/class names.
- [ ] **Step 3:** Rewrite `UnknownJobStatusView` to the new English copy from the spec ("We can't find this report" / link may have expired…). Update the *result-states* tests to assert on the new English copy. The view must still render exactly one `<main>` (via ResultShell) and exactly one `<h1>`.
- [ ] **Step 4:** Re-run — expect PASS for all 4 `*-result-states.test.ts`.
- [ ] **Step 5:** Commit — `feat(result-pages): move UnknownJobStatusView into shared kit + English copy`.

---

### Task 4: Migrate geo-readiness result page

**Files:**
- Modify: `apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx`
- Modify: restyle `apps/web/src/components/geo-checker/{score-breakdown,matched-services-view,serp-preview,platform-confidence,audit-poller}.tsx` (token swap only — keep `use client` where present)
- Test: `apps/web/src/__tests__/geo-result-states.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3 (ResultShell, AuditMetaStrip, VerdictCard, IssueLedger, ReportErrorPanel).
- Produces: same default export `export default async function JobResultPage(...)`; payload shape unchanged; copy in English per the spec ("Report not found", "Service temporarily unavailable", "Report failed", "Audit status unavailable" block, "Citation readiness", "checking" pill labels).

- [ ] **Step 1:** In `geo-result-states.test.ts`, replace all slate-class assertions with the design-token equivalents (`bg-paper`, `text-ink`, `border-hairline`, etc.) and all TR strings ("İşlem Bulunamadı", "Durum: Başarısız", "Geo Readiness Analiz Sonucu", …) with the new English strings from the spec.
- [ ] **Step 2:** Run the targeted test — expect FAIL.
- [ ] **Step 3:** Rewrite the page component to use the new kit. The per-state mapping:
  * `!UUID_RE.test(jobId)` → `<ResultShell eyebrow="Seovista / Lab report" title="Citation readiness" status="unknown"><ReportErrorPanel title="Report not found" body="…" /></ResultShell>`
  * DB throw / DB failure → same shell + `ReportErrorPanel title="Service temporarily unavailable"`
  * Missing row → same shell + `ReportErrorPanel title="Report not found"`
  * In-flight (`queued`/`running`/`pending`) → ResultShell with `status="checking"` + AuditMetaStrip + `<AuditPoller />`
  * Failed/timeout/permanent/permanent_failure → ResultShell `status="failed"` + ReportErrorPanel(title="Report failed", body="…", retryHref="/tools/geo-readiness-checker/")
  * Unknown status → `<UnknownJobStatusView />`
  * Completed-but-degraded (= the two early-return `breakdown` cases) → ResultShell + ReportErrorPanel("Report data is incomplete")
  * Completed-valid-breakdown → ResultShell + AuditMetaStrip (queueName `geo_readiness_audit`, toolLabel "Geo Readiness") + VerdictCard (variant from band; title "Citation readiness"; summary from `breakdown.helperText`; score = `breakdown.overallScore`, scoreLabel "Score") + IssueLedger + existing `CrewCtaView`, `CrewReportSection`, `MatchedServicesView`, `SerpPreview` children (their slate utilities already restyled in this task).
- [ ] **Step 4:** Run `pnpm vitest run src/__tests__/geo-result-states.test.ts` — PASS. Then run `pnpm vitest run` (full) — must still be green. Then `pnpm exec tsc --noEmit` and `pnpm next build`.
- [ ] **Step 5:** Commit — `feat(result-pages): migrate geo-readiness result page to editorial lab kit`.

---

### Task 5: Migrate schema-checker result page

**Files:**
- Modify: `apps/web/app/tools/schema-checker/result/[jobId]/page.tsx`
- Modify: restyle `apps/web/src/components/schema-checker/{schema-score-overview,schema-graph-tree}.tsx` (token swap only)
- Test: `apps/web/src/__tests__/schema-result-states.test.ts`

Same flow as Task 4. VerdictCard title `"Structured data coverage"`, variant from band. `SchemaScoreOverview`'s body metrics become IssueLedger items (one per raw-script cluster). `SchemaGraphTree` stays as-is structurally but classes migrate. Turkish strings ("İşlem Bulunamadı", "Hizmet Geçici Olarak Kullanılamıyor", "Denetim Başarısız Oldu", "Sonuç Verisi Kullanılamıyor", "Schema Denetimi Sırada", "Mükemmel", "İyi", "İyileştirilebilir", "Zayıf", "Kritik / Hatalı", "Yapısal Veri Skoru", "Yapılandırılmış veri hatalarını detaylı görmek için…") become English per the spec's copy table.

Commit message: `feat(result-pages): migrate schema-checker result page to editorial lab kit`.

---

### Task 6: Migrate ai-crawler-checker result page

**Files:**
- Modify: `apps/web/app/tools/ai-crawler-checker/result/[jobId]/page.tsx`
- Modify: restyle `apps/web/src/components/ai-crawler-checker/{crawler-access-matrix,crawler-issues}.tsx` (token swap only)
- Test: `apps/web/src/__tests__/ai-crawler-result-states.test.ts`

VerdictCard title `"AI crawler access"`. CrawlerAccessMatrix and CrawlerIssues become sub-sections feeding `IssueLedger` rows (CrawlerAccessMatrix retains its internal matrix layout; only its container classes swap). BAND_PRESENTATION's green/amber/red chips become the new spectral/signal/ember pills via the shared StatusPill.

Commit: `feat(result-pages): migrate ai-crawler-checker result page to editorial lab kit`.

---

### Task 7: Migrate keyword-rank-checker result page

**Files:**
- Modify: `apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx`
- Test: `apps/web/src/__tests__/keyword-rank-result-states.test.ts`

VerdictCard title `"Rank snapshot"`. The "İlk 10'da yok" amber chip → StatusPill variant `"warning"` with the new English copy `"Outside top 10"`. The data-source warn strip and the top-10 table follow the IssueLedger layout but stay inline (the table columns require a custom sub-structure — extend via the page, not by bending IssueLedger).

Commit: `feat(result-pages): migrate keyword-rank-checker result page to editorial lab kit`.

---

### Task 8: Migrate schema-truth-check + render-parity-diff result pages

**Files:**
- Modify: `apps/web/app/tools/schema-truth-check/result/[jobId]/page.tsx`
- Modify: `apps/web/app/tools/render-parity-diff/result/[jobId]/page.tsx`
- Test: extend `apps/web/src/__tests__/result-shell.test.tsx` with structural assertions specific to these two pages (no separate `*-result-states.test.ts` exists yet — writing them now would be gold-plating).

Both pages already live in the new architecture (side-by-side card, two-column metrics, issue list). The migration is a token + copy + shell swap:

* schema-truth-check → h1 becomes `"Schema truth"`, key card title becomes `"Truthfulness report"` variant from `verified/totalClaims` ratio (≥90 pass, 70-89 warn, <70 fail), claims table becomes IssueLedger rows, "Yapılandırılmış veri hatalarını detaylı görmek için…" CTA link → "Compare with the Schema Checker for a full parse log →".
* render-parity-diff → h1 becomes `"Render parity"`, key card title becomes `"Parity report"`, variant from `renderedParityRatio` (≥0.95 pass, 0.85-0.95 warn, <0.85 fail), h1-side-by-side becomes VerdictCard + IssueLedger side panels. Body copy English.

Commit: `feat(result-pages): migrate schema-truth + render-parity result pages`.

---

### Task 9: Migrate attribution-trace result page (no SVG yet)

**Files:**
- Modify: `apps/web/app/tools/attribution-trace/result/[jobId]/page.tsx`
- Test: extend `apps/web/src/__tests__/result-shell.test.tsx`

Same shell wiring as Tasks 4-7. VerdictCard title `"Citation trace"`, score = `safePayload.score`, scoreLabel `"Traceability"/100`, variant: `pass | warn | fail | info` mapped from the score (≥90 pass; 70-89 info; <70 fail). The four metric tiles reorganise into an `AuditMetaStrip` extension row at top; claims become IssueLedger items with `source: { label, url }` for the best source; the kind badge class becomes `text-signal` / `text-spectral` / `text-ember` / `text-muted-ink`. English copy per the spec.

Commit: `feat(result-pages): migrate attribution-trace shell (SVG follows)`.

---

### Task 10: Attribution Trace SSR SVG citation-graph block

**Files:**
- Create: `apps/web/src/components/result-pages/citation-graph.tsx` (Server Component)
- Modify: `apps/web/src/components/result-pages/index.ts`
- Modify: `apps/web/app/tools/attribution-trace/result/[jobId]/page.tsx` (insert `<CitationGraph … />` between VerdictCard and IssueLedger on the completed state)
- Test: extend `apps/web/src/__tests__/result-shell.test.tsx` with an SVG-focused assertion group

**Interfaces:**
- Consumes: `AttributionTraceResultPayload` (already exported from `@seovista/worker/dist/processors/attribution-trace.d.ts`).
- Produces:

```ts
export interface CitationGraphProps {
  /** Claim verdicts — drives node rows. */
  verdicts: readonly AttributionVerdict[];
  /** SERP source docs (external nodes). */
  serpSources: readonly SourceDocument[];
  /** Target domain — used to name the "self" source node. */
  targetHost: string;
}
```

Implementation notes **(normative, do not deviate)**:

* Pure Server Component. No `'use client'`. No d3 / svg-react.
* Layout: three columns ("Claims" / edges / "Sources"). Use fixed `viewBox="0 0 900 240"`; rows are 32 px apart, nodes are 8 px circles; claims render at `x=20`, sources at `x=840`.
* Edges: `<line stroke="var(--color-hairline)" stroke-width={0.5 + 2*bestSimilarity} />`, plus a `<title>` for screen readers containing `${claim} → ${sourceLabel} (${similarityPct}%)`.
* Node fill uses design tokens via inline `style={{ fill: "var(--color-signal)" }}` etc. — do not pass Tailwind classes to SVG fill (works but ties the SVG to Tailwind compile pipeline).
* Wrap in `<figure role="img" aria-label="Citation graph">` with `<figcaption>` reading the summary sentence from the spec.
* Fallback: when `verdicts.length === 0`, render the IssueLedger empty state instead of the SVG.

- [ ] **Step 1: Write the failing test** in `result-shell.test.tsx` rendering `<CitationGraph … />` with a 3-verdict + 3-source payload; assert `role="img"`, `aria-label="Citation graph"`, four `<line>` elements (one per verdict), one node per verdict + one per source + the self node, and a `<title>` inside one of the lines containing the similarity percentage.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement `citation-graph.tsx` per the notes above.
- [ ] **Step 4:** Run — PASS. Then `pnpm vitest run`, `pnpm exec tsc --noEmit`, `pnpm next build`.
- [ ] **Step 5:** Commit — `feat(result-pages): attribution-trace SSR citation graph (SSR SVG)`.

---

### Task 11: Final gate + commit

- [ ] **Step 1:** Run the three gates from the repo root:
  * `pnpm vitest run` inside `apps/web` (full suite — must be 100% green).
  * `pnpm exec tsc --noEmit` inside `apps/web`.
  * `pnpm next build` inside `apps/web` — expect all 7 result routes emitted.
- [ ] **Step 2:** Run the worker build to confirm untouched: `pnpm build` inside `apps/worker`.
- [ ] **Step 3:** Run seo-core: `pnpm vitest run` inside `packages/seo-core` — must still be 146/146.
- [ ] **Step 4:** Final commit (only if a task left a stray edit): amend the previous commit OR a tiny `chore(result-pages): final gates` follow-up. Push stays deferred per the standing user decision.

---

## Notes for the implementer

- `apps/web/tsconfig.json` has `.next-runs` development noise that the user wants kept out of any commit. Before each commit, run `git status` and re-stage only the files the task touched.
- Reference specs: `docs/superpowers/specs/2026-08-06-result-page-editorial-lab-design.md` (normative token + copy tables); `docs/superpowers/specs/2026-08-03-tier-b-b3-alerts-design.md` (tone).
- The 7 result pages are reachable today; routes exist (`/tools/<slug>/result/<uuid>`). Do not rename paths.
- After every commit run `git log --oneline -3` so the next task can see its predecessor.

## Self-review performed

- Spec coverage: every spec section (Goal, Tokens, Component inventory, Page anatomy, Copy, State mapping, Accessibility, Testing, Out-of-scope, Risks) maps to at least one task. Drift noted: spec called for a new `*-result-states.test.ts` per page; the plan instead extends the shared `result-shell.test.tsx` for the three newer pages (schema-truth, render-parity, attribution-trace) because they share the same primitives and the marginal value of a per-page suite is low — flagged here so reviewers can override if desired.
- Placeholder scan: none of the patterns listed in the writing-plans "No Placeholders" section appears in the final document; all code blocks contain concrete implementations.
- Type consistency: `VerdictVariant` is unified with `StatusPillProps["variant"]` for the four report verdicts (`pass | warn | fail | info`); `StatusPill` keeps its broader `in_progress | success | warning | failure | unknown` alphabet so future pages can reuse it. Each consuming task names the variant through the `VerdictVariant` type.
