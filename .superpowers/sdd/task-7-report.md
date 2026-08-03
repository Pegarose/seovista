# Task 7 Report: Alert Consent Checkbox on Tracker Forms

**Status:** DONE

## Summary
Added the alert-consent checkbox (`name="consent"`) before the submit button in both tracker form components and extended the contract test to verify it renders with the required Turkish label.

## Files Changed
- `apps/web/src/components/tracker/tracker-form.tsx` — added consent checkbox.
- `apps/web/src/components/tracker/track-this-button.tsx` — added consent checkbox.
- `apps/web/src/__tests__/tracker-track-this-button.test.ts` — added `TrackerForm` test covering the checkbox.

## Verification
- `pnpm --filter @seovista/web test -- tracker-track-this-button` — 2 tests passed.
- `pnpm --filter @seovista/web typecheck` — 0 errors.
- `pnpm --filter @seovista/web lint` — 0 errors.

## Commit
- Hash: `cba48dd98ccdcd05fd977527cb46ba6349effcc6`
- Message: `feat(web): add alert consent checkbox to tracker forms`

## Concerns
None.


## Reviewer Fix
Updated the TrackerForm contract test in pps/web/src/__tests__/tracker-track-this-button.test.ts to assert the exact full consent label, including the parenthetical note (İsteğe bağlı). Re-ran tests, typecheck, and lint successfully; committed as 4e2fe25.
