# Debt Batch Task 1 Implementation Report

## Scope

Implemented only T3 translation completion and parity guard:

- Extracted `MODULE_STATUS_LABEL` and `ISSUE_TRANSLATIONS` into `apps/web/src/components/geo-checker/issue-translations.ts`.
- Added the six missing Turkish issue translations specified by the brief:
  `HTTP_STATUS_NOT_OK`, `PAGESPEED_PROVIDER_FAILED`, `PAGESPEED_SKIPPED`,
  `SEMANTIC_LSI_GAP`, `SEMANTIC_ENTITY_GAP`, and
  `SEMANTIC_ENRICHMENT_UNAVAILABLE`.
- Added `CODE_TO_TAGS` parity and non-empty-value tests plus status-label coverage tests.
- Updated `score-breakdown.tsx` to import the extracted dictionaries.

`CODE_TO_TAGS` contains 58 entries and `ISSUE_TRANSLATIONS` contains 61 entries.

## TDD Evidence

1. **RED:** Temporarily removed the six specified entries from the translation module and ran:
   `pnpm --filter @seovista/web test -- src/components/geo-checker/__tests__/issue-translations.test.ts`
   The parity test failed as expected with:
   `Missing translations for: HTTP_STATUS_NOT_OK, PAGESPEED_PROVIDER_FAILED, PAGESPEED_SKIPPED, SEMANTIC_LSI_GAP, SEMANTIC_ENTITY_GAP, SEMANTIC_ENRICHMENT_UNAVAILABLE`.
   The original file was restored immediately after the check.
2. **GREEN:** Re-ran the focused test after implementation: 1 file passed, 3 tests passed.

## Verification

- Focused parity test: PASS — 1 file, 3 tests.
- Full web test suite: PASS — 40 files, 315 tests.
- Web typecheck: PASS — `tsc --noEmit`, 0 errors.
- Staged Task 1 diff check: PASS for the three assigned source/test files.

The test commands emitted the existing Node engine warning because the environment has Node `v25.8.0` while the project requests Node `>=24.0.0 <25.0.0`; this did not affect results. Existing unrelated working-tree changes were preserved and not staged.

## Commit

- `7224626` — `fix(geo-checker): complete ISSUE_TRANSLATIONS parity with geo-engine codes`
- Commit contains only the three assigned Task 1 source/test files. The report and all unrelated working-tree changes remain uncommitted and unstaged.
