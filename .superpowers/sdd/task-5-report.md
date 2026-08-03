# Task 5 Report: Processor integration — evaluate, insert, digest, retain

## Status
DONE

## Commit
- Hash: `57a465765069777e98af0ab026a64eccaff52f26`
- Message: `feat(worker): integrate alert evaluation, digest, and retention into tracker scan`
- Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>

## Files Changed
- `apps/worker/src/processors/tracker-scan.ts` (rewritten)
- `apps/worker/src/queue/tracker-scan-worker.ts` (updated)
- `apps/worker/src/__tests__/tracker-scan-processor.test.ts` (extended with 3 new tests)

## Implementation Summary
- Extended `TrackerScanInput` with `email`, `logger`, `minDelta`, `retentionDays`, `siteUrl`, and `fromEmail`.
- Imported `EmailProvider` from `@seovista/reports`, plus `evaluateTransition`, `runAlertDigest`, and `noopLogger`/`Logger`.
- Processor now fetches the previous observation before inserting the new one, evaluates the transition, and inserts a `tracker_alerts` row when a threshold is crossed.
- After the scan loop, `runAlertDigest` and retention cleanup (`deleteOldObservations` / `deleteOldAlerts`) run only when `input.email` is provided.
- Preserved existing behavior: active target listing, observation insertion, `last_checked_at` updates, per-target failure logging, and rate-limit courtesy delay.
- Worker now constructs `createMockEmail()` and passes the new options into `processTrackerScanBatch`.

## Test Summary
- Command: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-scan-processor`
- Result: 6 passed, 0 failed
- Confirmed initial failure (before implementation) for the alert/digest/retention tests.

## Quality Checks
- `pnpm --filter @seovista/worker typecheck`: 0 errors
- `pnpm --filter @seovista/worker lint`: 0 errors, 0 warnings

## Concerns
- None. The focused `tracker-scan-processor` test suite passes and the worker package type-checks and lints cleanly.
