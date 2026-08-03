# Task 4 Report — Alert Digest

## Status

DONE

## Commit

- Hash: `e1f9dac`
- Message: `feat(worker): add alert digest email builder and sender`
- Co-authored-by: `factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>`

## Files Changed

- Created `apps/worker/src/alerts/alert-digest.ts`
- Created `apps/worker/src/__tests__/alert-digest.test.ts`
- Modified `apps/worker/package.json` (added `@seovista/reports` workspace dependency)
- Modified `pnpm-lock.yaml`
- Modified `apps/worker/src/index.ts` (exported `runAlertDigest`, `AlertDigestDeps`, `AlertDigestResult`)

## Test Summary

Focused test run:

```bash
pnpm --filter @seovista/worker test -- alert-digest
```

Result: **4 passed, 0 failed**.

## Typecheck / Lint

- `pnpm --filter @seovista/worker typecheck`: 0 errors
- `pnpm --filter @seovista/worker lint`: 0 errors

## Notes

- The first test run failed as expected because the new module and the `@seovista/reports` workspace dependency were not yet present.
- The test helper default was updated to allow `row()` without arguments (`Partial<UnsentAlertRow> = {}`) to satisfy TypeScript strict mode.
- The default fixture token was set to `11111111-1111-1111-1111-111111111111` so the panel link assertion in the brief matches exactly.
- The Turkish alert label for `dropped_out_of_top10` was adjusted to `İlk 10dan düştü` (no apostrophe) to match the brief's test assertion.
- No files outside the task scope were modified.

## Spec-Alignment Fix

Re-aligned the Turkish kind labels with the authoritative spec
(`docs/superpowers/specs/2026-08-03-tier-b-b3-alerts-design.md`):

- `dropped_out_of_top10`: `İlk 10'dan düştü`
- `entered_top10`: `İlk 10'a girdi`
- `significant_drop`: `Belirgin düşüş`
- `significant_rise`: `Belirgin yükseliş`

Also removed the unnecessary `?? alert.kind` fallback in `lineText`.
The test assertion was updated to expect the apostrophe form.

Commit: `e09e121` — `fix(worker): align alert digest Turkish labels with spec`

Final verification:

```bash
pnpm --filter @seovista/worker test -- alert-digest
pnpm --filter @seovista/worker typecheck
pnpm --filter @seovista/worker lint
```

Results: 4 tests passed, 0 typecheck errors, 0 lint errors.

## Type Fix

Reviewer-requested fix: narrowed the `KIND_LABEL` type in `apps/worker/src/alerts/alert-digest.ts` from `Record<string, string>` to `Record<UnsentAlertRow["kind"], string>` to preserve exhaustiveness typing for alert kinds. The four supported kinds and their Turkish labels remain unchanged.

Commit: `c755388` — `refactor(worker): type KIND_LABEL with UnsentAlertRow kind`

Final verification:

```bash
pnpm --filter @seovista/worker test -- alert-digest
pnpm --filter @seovista/worker typecheck
pnpm --filter @seovista/worker lint
```

Results: 4 tests passed, 0 typecheck errors, 0 lint errors.
