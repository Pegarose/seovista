# Spec: Debt Batch (B8, M1, M2, M5, T3)

**Date:** 2026-08-02
**Status:** Approved (brainstorming complete)
**Parent authorities:** SeoVista PRD (§0.3 Turkish-default), Implementation Brief v1 (debt-triage discipline), AGENTS.md (TypeScript strict, no untyped logic, never fabricate)
**Depends on:** shipped features on branch `bugfix/foundation-geo-recovery-real` (HEAD `07fb5cb`) — Schema Checker, AI Crawler Checker, SERP Preview, Keyword Rank Checker, CrewAgency Report, Tier B B1/B2 Tracker
**Sources of the findings:** deferred Minor items from per-task reviews of AI Crawler Checker, CrewAgency Report, and all worker reviews (see `.superpowers/sdd/progress.md`)

## 1. Scope

This is a single debt-batch feature. It closes five deferred review findings in one spec → plan → task-by-task implementation cycle, mirroring the earlier "Debt fixes pre-Keyword-Tracking" and "Debt batch (S2/B5/B6)" precedents. Each finding is small and independently scoped; together they remove accumulated lint/test/parity debt before the next feature (Tier B B3 Alerts).

| Code | Source review | One-line summary |
|---|---|---|
| **T3** | Earlier session (compacted) | `ISSUE_TRANSLATIONS` dictionary missing entries for codes the geo-engine can emit — Turkish UI falls back to English `AuditIssue.title` |
| **B8** | AI Crawler Checker Task 1 | `parseRobotsTxt` parser edge cases not covered by `robots.test.ts` |
| **M1(a)** | AI Crawler Checker Task 2 | `findContradictoryRuleConflicts` in the worker duplicates the first half of seo-core `detectRuleConflicts` (incl. Turkish strings) — drift risk |
| **M1(b)** | CrewAgency Report Task 2 | `buildCrewReportRequest` throws a plain `Error` for an unknown tool instead of a `validation.*`-coded error — worker maps it to retryable `failed` instead of `permanent` |
| **M2** | CrewAgency Report Task 2 | `crew-report-worker.ts` has no test file — terminal-status mapping, poll ceiling, and SQL paths are untested |
| **M5** | All worker reviews | 14 pre-existing `no-console` ESLint warnings (`console.log`) in `db/admin-seed.ts`, `db/dev-seed.ts`, `utils/fetcher.ts` |

**Out of scope (deferred / separate batches):**
- B2 deferred Minor items (polyline gap behavior, pending-label test, error/success state tests, domain>253, naming nits) — tracked in `progress.md`, separate batch
- Structural i18n work (moving the translation dictionary into geo-engine or a dedicated i18n layer) — would require a PRD i18n decision; this batch keeps the dict in the web app and adds a parity guard instead
- `fetcher.ts` `console.warn` calls — already sanctioned by the ESLint config (`allow: ["error", "warn"]`); no change
- Any new product behavior — pure debt reduction

## 2. Architecture

No new runtime behavior. Five localized changes across `packages/seo-core`, `packages/geo-engine`, `apps/web`, and `apps/worker`. Task order is dependency-ordered: package-level helpers first, then consumers.

### 2.1 T3 — Translation completion + parity guard

**Discovery (refines the approved approach):** the geo-engine already exports a canonical issue-code registry — `CODE_TO_TAGS` in `packages/geo-engine/src/issue-tags.ts` (re-exported from `packages/geo-engine/src/index.ts`). Its docstring states exhaustive coverage of "every emitted issue `code`" across the 7 scoring modules plus the 3 NeuronWriter enrichment codes, and `attachIssueTags` throws fail-fast on any unmapped code. Creating a second `GEO_ISSUE_CODES` registry would itself be a drift risk. **We therefore reuse `CODE_TO_TAGS` as the single source of truth** — no new geo-engine module and no geo-engine code change. This honors the approved "registry + two-sided test" approach while avoiding a duplicate registry.

**Coverage gap (also refined during exploration):** `ISSUE_TRANSLATIONS` in `apps/web/src/components/geo-checker/score-breakdown.tsx` is missing **6** entries, not 3:

- `HTTP_STATUS_NOT_OK` (indexability module — `-10` pointLoss, `high` severity, user-facing in `ScoreBreakdown.modules[].issues`)
- `PAGESPEED_PROVIDER_FAILED` (experience module — `info`)
- `PAGESPEED_SKIPPED` (experience module — `info`, emitted on every run without `PAGESPEED_API_KEY`, i.e. effectively always in Sprint 0)
- `SEMANTIC_LSI_GAP` (engine.ts NeuronWriter enrichment — currently routed to `topIssues`/recommendations, not to `ScoreBreakdown.modules`)
- `SEMANTIC_ENTITY_GAP` (engine.ts enrichment — same routing)
- `SEMANTIC_ENRICHMENT_UNAVAILABLE` (engine.ts enrichment — same routing)

The 3 enrichment codes do not currently reach the `ScoreBreakdown` component, so today they cannot show an English fallback there. We translate all 6 anyway so the parity invariant is the simplest possible one — "every `CODE_TO_TAGS` key has a translation" — with no exclusion list to maintain. If a future change routes enrichment issues through the breakdown, they are already covered.

**Changes:**

1. Extract `ISSUE_TRANSLATIONS` (and `MODULE_STATUS_LABEL`, which is co-located and consumed only by `ScoreBreakdownView`) from `score-breakdown.tsx` into a new module `apps/web/src/components/geo-checker/issue-translations.ts`. The component imports both from there. This makes the dictionary importable by a test without importing a React component.
2. Add the 6 missing entries with Turkish translations (wording below).
3. New test `apps/web/src/components/geo-checker/__tests__/issue-translations.test.ts`: assert that `Object.keys(CODE_TO_TAGS)` (imported from `@seovista/geo-engine`) is a subset of the dictionary keys, and that every dictionary value is a non-empty trimmed string. This is the drift guard: a future geo-engine code without a translation fails the test.

**Translation wording (Turkish, matching the existing entries' sentence+period style):**

| Code | Translation |
|---|---|
| `HTTP_STATUS_NOT_OK` | Sayfa 200 OK yerine beklenmeyen bir HTTP durum kodu döndürüyor. |
| `PAGESPEED_SKIPPED` | Sayfa hızı (Core Web Vitals) bu analizde ölçülmedi. |
| `PAGESPEED_PROVIDER_FAILED` | Sayfa hızı verisi alınamadı (PageSpeed API hatası). |
| `SEMANTIC_LSI_GAP` | İçerikte rakip sayfalarda bulunan anlamsal (LSI) terimler eksik. |
| `SEMANTIC_ENTITY_GAP` | İçerikte konuyla ilişkili önemli varlıklar (entity) eksik. |
| `SEMANTIC_ENRICHMENT_UNAVAILABLE` | Anlamsal zenginleştirme verisi bu analizde alınamadı; skor etkilenmedi. |

### 2.2 B8 — robots parser edge-case tests

Pure test additions to `packages/seo-core/src/__tests__/robots.test.ts`. The existing tests cover: basic groups/sitemaps/full-line comments, empty `Disallow`, longest-match + allow-tie, UA-specific group + case-insensitivity, wildcard `$` anchors, blocked/partial/allowed, both `detectRuleConflicts` branches. The following edge cases are uncovered and will be added:

1. **BOM** (`\uFEFF`) is stripped before parsing (the parser does `content.replace(/^\uFEFF/, "")`)
2. **`\r\n` and lone `\r`** line endings split correctly (split regex is `/\r\n|\r|\n/`)
3. **Inline `#` comment** on a rule line is stripped (`Disallow: /admin # keep out` → pattern `/admin`)
4. **Line without a colon** → `parseErrors` entry (`Satır N: geçersiz alan`)
5. **`Allow`/`Disallow` before any `User-agent`** → `parseErrors` entry (`user-agent olmadan ...`)
6. **Empty `Allow` value** is a no-op (rule not pushed) — parallel to the existing empty-`Disallow` test
7. **Multiple `User-agent` lines** accumulate into one group before rules start
8. **Field-name case-insensitivity** (`USER-AGENT: *` parses as `user-agent`)
9. **Equal-length `Allow` + `Disallow` tie-break** in `isPathAllowed` → allow wins (the existing conflict test covers detection, not the path-allowed outcome)
10. **Unknown fields** (`Crawl-delay: 10`, `Host: example.com`) are silently ignored (no rule, no error)
11. **Empty `Sitemap:` value** is skipped (not pushed to `sitemaps`)

TDD: each test is written first. If any test exposes a real parser bug (it should not, given the implementation), the parser is fixed in the same task with a red→green cycle. No behavior change is intended; the tests are characterization tests for existing correct behavior.

### 2.3 M1(a) — conflict-detector deduplication

`apps/worker/src/processors/ai-crawler-audit.ts` defines a local `findContradictoryRuleConflicts(doc)` that is a **verbatim copy** of the first loop of seo-core's `detectRuleConflicts` (same allow-set construction, same `Aynı yol için hem Allow hem Disallow kuralı tanımlı: ${pattern}` description, same `lines` format). If the seo-core wording or logic changes, the worker copy drifts.

**Changes:**

1. `packages/seo-core/src/robots.ts`: export a new `detectContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[]` containing only the same-pattern Allow/Disallow contradiction loop. Refactor `detectRuleConflicts` to call it internally and then append the wildcard-policy-vs-UA-full-block checks. Behavior of `detectRuleConflicts` is identical (same output for every input). Export `detectContradictoryRuleConflicts` from `packages/seo-core/src/index.ts`.
2. `apps/worker/src/processors/ai-crawler-audit.ts`: delete the local `findContradictoryRuleConflicts`; import `detectContradictoryRuleConflicts` from `@seovista/seo-core`. The processor's penalty/recommendation logic that consumed the local function is unchanged.
3. `packages/seo-core/src/__tests__/robots.test.ts`: add a focused `detectContradictoryRuleConflicts` test block (contradiction detected; wildcard-policy conflict NOT reported by the narrow function — that stays in `detectRuleConflicts`). Existing `detectRuleConflicts` tests stay green.

### 2.4 M1(b) — validation-coded unknown-tool error

`apps/worker/src/processors/crew-report.ts` line ~93: `buildCrewReportRequest` throws `new Error("Unknown crew report tool: ...")` for a non-`CrewReportTool` value. The worker's catch block maps `validation.*`-coded errors to `permanent` but a plain `Error` falls through to `failed` (retryable). The function's own docstring claims "Unknown tools throw — the worker maps that to a permanent failure", which is only true if the error carries the `validation.*` code. (The worker also guards with `TOOL_QUEUE_NAMES[tool]` before calling this, so the path is currently unreachable from the worker flow — but the processor's public contract is still wrong.)

**Changes:**

1. `crew-report.ts`: replace `throw new Error(...)` with `throw validationCrewReportError(...)` (the helper already exists in the same file and sets `error.code = "validation.crew_report"`).
2. `apps/worker/src/__tests__/crew-report-processor.test.ts`: add (or extend) a case asserting `buildCrewReportRequest({ tool: "bogus", sourcePayload: {}, sourceTarget: undefined })` throws with `code` starting with `validation.`.

### 2.5 M2 — crew-report-worker handler extraction + tests

`apps/worker/src/queue/crew-report-worker.ts` constructs a BullMQ `Worker` and a `db` client inside `startCrewReportWorker`, so the job-processing logic cannot be unit-tested without mocking BullMQ internals. The codebase's established pattern (e.g. `processCrewNotification` in `crew-queue.ts`, tested in `crew-queue.test.ts` via injected `fetch`) is to extract a dependency-injected handler and keep the wiring thin.

**Changes:**

1. Extract the BullMQ processor callback into a new exported function:

   ```ts
   export interface CrewReportJobDeps {
     db: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };
     client: CrewAgencyClient;
     sleep: (ms: number) => Promise<void>;
     /** Poll ceiling override; defaults to the module `POLL_CEILING_MS` (10 min). */
     pollCeilingMs?: number;
     /** Poll interval override; defaults to the module `POLL_INTERVAL_MS` (5 s). */
     pollIntervalMs?: number;
   }
   export async function processCrewReportJob(
     data: { jobId: string; sourceJobId: string; tool: CrewReportTool },
     deps: CrewReportJobDeps,
   ): Promise<void>
   ```

   `startCrewReportWorker` keeps the BullMQ `Worker` construction, `parseRedisUrl`, env reads, `resolveCrewAgencyClient`, and the `options.client`/`options.sleep` injection, and delegates its job callback to `processCrewReportJob` with the resolved deps. The terminal-status mapping logic (the `catch` block) moves into `processCrewReportJob` so it is testable; `console.error` there is allowed by the ESLint config (it is `console.error`, not `console.log`). The `worker.on('closed', ...)` db-close stays in `startCrewReportWorker`.

2. New `apps/worker/src/__tests__/crew-report-worker.test.ts` with a fake `db` (queue of `query` responses keyed by SQL shape or call order), a mock `CrewAgencyClient`, and an instant `sleep`. Cases:
   - **Happy path**: source row found → kickoff → poll returns `completed` with markdown → result inserted → status set to `completed`. Asserts the SQL call sequence (running → source join → job record select → result insert → completed update) and the final status.
   - **Misconfigured** (`resolveCrewAgencyClient` → null): throws `CrewAgencyError("crew.misconfigured")`; terminal status `permanent`.
   - **Unknown tool** (`TOOL_QUEUE_NAMES` miss → `permanentCrewReportError`): terminal status `permanent`.
   - **Missing source payload** (source join returns no row): terminal status `permanent`.
   - **Crew job failed**: poll returns `failed`; terminal status `failed` (plain `Error`, not `CrewAgencyError`).
   - **Poll ceiling**: poll never reaches terminal within `POLL_CEILING_MS`; throws `CrewAgencyError("crew.timeout")`; terminal status `timeout`.
   - **`extractReportMarkdown` variants**: `completed` with a plain string result; with `{ markdown }`; with `{ reportMarkdown }`; with `{ report }`; with empty/whitespace → throws `CrewAgencyError("crew.unavailable")` → terminal status `timeout`.

   `POLL_CEILING_MS`/`POLL_INTERVAL_MS` are module constants. The poll-ceiling test injects `pollCeilingMs: 0` (or `1`) and an instant `sleep`; the first non-terminal `getJob` then immediately exceeds the ceiling and throws `crew.timeout` — no real-time waiting and no `Date.now` mocking required. The handler threads `pollCeilingMs ?? POLL_CEILING_MS` and `pollIntervalMs ?? POLL_INTERVAL_MS` into `pollCrewJobUntilTerminal`.

### 2.6 M5 — logger injection

**Shared logger utility** — new `apps/worker/src/utils/logger.ts`:

```ts
export type Logger = (...values: unknown[]) => void;

// Single sanctioned stdout wrapper for CLI/worker diagnostics.
// eslint-disable-next-line no-console -- one controlled console.log site; all
// other call sites inject a Logger so the no-console rule stays clean.
export const stdoutLogger: Logger = (...values) => { console.log(...values); };

export const noopLogger: Logger = () => {};
```

This collapses all 14 `console.log` warnings to a single eslint-disabled site; every caller injects a `Logger`.

**Call-site changes (behavior preserved — output identical to today):**

- `apps/worker/src/db/admin-seed.ts`: `dependencies.logger ?? console.log` → `dependencies.logger ?? stdoutLogger` (the `dependencies.logger` injection point already exists; only the default changes). The single `console.error` in the catch stays (allowed). **Safety:** the existing `apps/worker/src/__tests__/admin-bootstrap.test.ts` already injects its own `logger` (`vi.fn()`) and asserts the password is not logged — it never relies on the default, so the default change is verified safe by that suite.
- `apps/worker/src/db/dev-seed.ts`: add a `logger: Logger = stdoutLogger` parameter to the seed entry function; replace all 11 `console.log` calls with `logger(...)`. The two `console.error` calls in the catch blocks stay (allowed).
- `apps/worker/src/utils/fetcher.ts`: add `logger?: Logger` to `FetchAndParseUrlOptions` (default `stdoutLogger`); replace the 2 `console.log` calls (structured `render_cache_hit` / `render_cache_miss` JSON events inside `fetchAndParseUrlWithMeta`) with `logger(...)`. The `console.warn` calls (credit guard, Browseract fallback) stay as `console.warn` (allowed) — they are operator-facing warnings, not stdout info, and changing their stream would alter observability semantics.

**Gate:** `pnpm --filter @seovista/worker lint` reports **0 warnings** (down from 14).

## 3. Testing

| Task | New/changed tests | Existing tests that must stay green |
|---|---|---|
| T3 | `issue-translations.test.ts` (web) — CODE_TO_TAGS ⊆ dict | `seo.spec.ts`, existing geo-checker component tests |
| B8 | `robots.test.ts` (seo-core) — 11 new edge cases | all seo-core tests |
| M1(a) | `robots.test.ts` — `detectContradictoryRuleConflicts` block; `ai-crawler-audit-processor.test.ts` (worker) | seo-core + worker ai-crawler processor tests |
| M1(b) | `crew-report-processor.test.ts` — unknown-tool code assertion | crew-report-processor tests |
| M2 | `crew-report-worker.test.ts` (new) — 6+ cases | crew-report-processor/submission/client/queue tests |
| M5 | none (behavior-preserving) | worker suite (esp. fetcher-dependent geo-worker tests, admin-seed/dev-seed tests if any) |

**TDD discipline:** every code-touching task writes the failing test first (B8, M1(b), M2). T3's parity test is written alongside the dict additions. M1(a) and M5 are refactors verified by the existing suites plus new focused tests where noted.

## 4. Gates

Per task: relevant package tests green + `typecheck` 0 errors for the touched package(s).

Final (whole batch):
- `pnpm --filter @seovista/web test` — green (test count increases by T3 + M1(a) web tests)
- `pnpm --filter @seovista/worker test` — green (test count increases by M1(b) + M2; M5 behavior-preserving). Known env failures acceptable: geo-worker 429, Crew Agency notify, migration-invariants advisory lock.
- `pnpm --filter @seovista/seo-core test` — green (B8 + M1(a) additions)
- `pnpm --filter @seovista/geo-engine test` — green (unchanged; T3 adds no geo-engine test)
- `pnpm --filter @seovista/web typecheck` and `@seovista/worker typecheck` — 0 errors
- `pnpm --filter @seovista/web lint` and `@seovista/worker lint` — **0 errors, 0 warnings** (M5 removes the 14 worker warnings)

If worker types change (M2 handler extraction), `pnpm --filter @seovista/worker build` runs before web typecheck.

## 5. Commit & Review Strategy

- One commit per task (6 commits), each self-contained with its own tests.
- Per-task review (scrutiny-feature-reviewer or `review` skill) after each commit.
- Final whole-batch review over the full diff, then fix wave + re-review, then close-out entry in `.superpowers/sdd/progress.md`.

## 6. Risk Notes

- **M2 handler extraction** changes the internal structure of `crew-report-worker.ts`. The risk is a wiring mistake in `startCrewReportWorker` after extraction. Mitigation: the new test exercises `processCrewReportJob` directly; the existing submission/processor tests still exercise the queue plumbing; a manual smoke check that the worker file still imports/exports correctly is part of the task review.
- **M1(a) refactor** of `detectRuleConflicts` must preserve identical output. Mitigation: the existing `detectRuleConflicts` tests are the regression guard; the new narrow-helper test additionally pins its scope.
- **T3 reusing `CODE_TO_TAGS`** means the web package gains a runtime dependency on a geo-engine export it did not previously import at that call site (it already imports types from geo-engine). No bundling concern — it is a server component path.
- **Droid-Shield:** use `crypto.randomUUID()` for any UUID-shaped test fixtures, never hardcoded literals.
