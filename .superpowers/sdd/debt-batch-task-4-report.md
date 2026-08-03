# Debt Batch Task 4 — M1(b) Validation-Coded Unknown-Tool Error

## Scope

Implemented only M1(b): `buildCrewReportRequest` now routes unknown-tool failures through the existing `validationCrewReportError` helper, and the focused crew-report processor test asserts the `validation.crew_report` code. No M2 worker extraction or unrelated task was changed.

## RED/GREEN evidence

The requested focused test was run after adding the assertion but before the production fix:

```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\\bc-proje\\Seovista\\.lifecycle-evidence\\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/crew-report-processor.test.ts
```

RED result:

```text
Test Files  1 failed (1)
Tests       1 failed | 12 passed (13)
Failure: expected undefined to be 'validation.crew_report'
```

The production branch was then changed to throw `validationCrewReportError(...)` for an unknown tool. The same focused command passed:

```text
PASS
Test Files  1 passed (1)
Tests       13 passed (13)
```

Worker typecheck also passed:

```text
pnpm --filter @seovista/worker typecheck
PASS
```

Both commands emitted the existing Node engine warning because the environment uses Node v25.8.0 while the repository requests Node >=24.0.0 <25.0.0; validation was successful.

## Implementation

- Replaced the plain `Error` in the unknown-tool branch with `validationCrewReportError`, preserving the `Unknown crew report tool: ...` message.
- Updated the existing unknown-tool test to use the requested invalid tool input and assert `code === "validation.crew_report"`.

## Changed assigned files

- `apps/worker/src/processors/crew-report.ts`
- `apps/worker/src/__tests__/crew-report-processor.test.ts`

This report and all other pre-existing working-tree changes are intentionally not part of the assigned commit.
