# Debt Batch Task 5 — M2 Report

## Scope

Implemented only the M2 crew-report-worker extraction and focused tests:

- `apps/worker/src/queue/crew-report-worker.ts`
- `apps/worker/src/__tests__/crew-report-worker.test.ts`

The existing BullMQ callback logic is now exported as `processCrewReportJob(data, deps)`. The exported strict `CrewReportDb` and `CrewReportJobDeps` interfaces inject the database, nullable CrewAgency client, sleep function, poll ceiling, and poll interval. `startCrewReportWorker` remains thin wiring for Redis/database setup, client resolution, and delegation. The nullable-client `crew.misconfigured` guard and terminal mapping live inside the extracted handler. SQL statements and terminal status behavior were preserved. The poll loop accepts injected ceiling and interval values.

## TDD evidence

### RED

Ran the focused suite against a temporary copy of the pre-extraction worker (the temporary files were removed afterward):

```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker exec vitest run src/__tests__/crew-report-worker.red.test.ts
```

Result: expected failure. All 11 tests failed because the pre-extraction module did not export `processCrewReportJob` (`TypeError: (0, processCrewReportJob) is not a function`). No tracked files were changed by the RED run.

### GREEN

Ran the focused suite with lifecycle context:

```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/crew-report-worker.test.ts
```

Result: PASS — 1 test file, 11 tests passed. Coverage includes happy-path persistence/completion, misconfigured client → permanent, unknown tool → permanent, missing source → permanent, CrewAgency failure → failed, poll ceiling → timeout, plain-string markdown, all three supported object result keys, and empty result → timeout.

## Required validation

- Focused worker test: PASS — 11/11.
- Full worker suite:
  - 40 test files passed, 2 failed.
  - 300 tests passed, 2 failed.
  - Known environment/concurrency failures only: `geo-worker.test.ts` 429 rate-limit scenario observed completed instead of failed, and `migration-invariants.test.ts` advisory-lock release assertion observed one lock. No M2 test failed.
- `pnpm --filter @seovista/worker typecheck`: PASS.
- `pnpm --filter @seovista/worker lint`: PASS with 0 errors and 14 pre-existing warnings in `db/admin-seed.ts`, `db/dev-seed.ts`, and `utils/fetcher.ts`.
- `pnpm --filter @seovista/worker build`: PASS.
- `git diff --check` for assigned source/test files: PASS.

## Self-review

- `processCrewReportJob` owns all processing and terminal-status mapping; the BullMQ callback only resolves dependencies and delegates.
- `CrewReportDb` uses strict row typing (`readonly Record<string, unknown>[]`); the fake database is typed against that interface.
- The handler accepts `CrewAgencyClient | null` and maps missing configuration to permanent status before any source lookup.
- Poll ceiling and interval are injectable with the original 10-minute/5-second defaults.
- Existing source lookup, result-save SQL, result payload construction, and status update SQL were retained.
- No M5 logger work, unrelated source files, `.superpowers/sdd` scratch files, or `apps/web/tsconfig.json` were staged.

## Environment caveat

The repository requires Node 24 LTS, but this environment reports Node v25.8.0. pnpm 10.30.1 was used as required; commands emitted the unsupported-engine warning. This did not prevent the focused test, typecheck, lint, or build from passing.
