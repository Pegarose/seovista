# B2 Final Review Fixes — Report

## Status: DONE

**Commit:** `07fb5cb1b50507d77362c3930db37bff792e5bd6`
**Branch:** `bugfix/foundation-geo-recovery-real`

## Verification

- Affected tests: 16/16 pass (`trend-chart`, `tracker-target-card`, `deactivate-button`)
- Full web test suite: **312/312 pass**
- Typecheck: **0 errors**

## Changes

### Fix 1 — Remove `dangerouslySetInnerHTML` from production code

**`apps/web/src/components/tracker/trend-chart.tsx`**
- Removed the explanatory comment block about `dangerouslySetInnerHTML`.
- `<title dangerouslySetInnerHTML={{ __html: NOT_FOUND_TITLE(o.checkedAt) }} />` → `<title>{NOT_FOUND_TITLE(o.checkedAt)}</title>`
- `<span dangerouslySetInnerHTML={{ __html: NOT_FOUND_LABEL }} />` → `<span>{NOT_FOUND_LABEL}</span>`
- `NOT_FOUND_LABEL` and `NOT_FOUND_TITLE` unchanged (still string constants/function).

**`apps/web/src/components/tracker/tracker-target-card.tsx`**
- Removed the explanatory comment block.
- Removed the now-unused `isNotFoundLabel` local variable.
- Collapsed the conditional `<span>` rendering of `latestPositionText` to a single `<span>{latestPositionText}</span>` (no `dangerouslySetInnerHTML`).
- `<p ... dangerouslySetInnerHTML={{ __html: EMPTY_STATE_LABEL }} />` → `<p ...>{EMPTY_STATE_LABEL}</p>`

**`apps/web/src/__tests__/trend-chart.test.ts`**
- Added `decodeEntities` helper (decodes `&#x27;` → `'`).
- Applied `decodeEntities(markup)` to the apostrophe assertion (`"İlk 10'da yok"`).

**`apps/web/src/__tests__/tracker-target-card.test.ts`**
- Added `decodeEntities` helper.
- Applied `decodeEntities(markup)` to the two apostrophe assertions (`"İlk 10'da yok"` and `"İlk kontrol bu gece 03:00 UTC'de yapılacak"`).

### Fix 2 — DeactivateButton error handling

**`apps/web/src/components/tracker/deactivate-button.tsx`**
- Added `useState` import and `error` state.
- `handleClick` now reads the action's return value: on `!result.success` sets `error` to `result.error ?? "Hedef kaldırılamadı."` and returns; on success calls `router.refresh()`.
- Renders the button inside a `<div className="space-y-1">` with an inline `<p role="alert">` error message below the button when `error` is set.

**`apps/web/src/__tests__/deactivate-button.test.ts`**
- Updated the `deactivateTrackerTargetAction` mock from `vi.fn()` to `vi.fn().mockResolvedValue({ success: true })` so the success path is exercised.

## Concerns

None. The `tracker-target-card.test.ts` also mocks `deactivateTrackerTargetAction` (left as plain `vi.fn()`); this is fine because `renderToStaticMarkup` renders initial state only and never invokes the action (no click event), so no return value is consumed there.
