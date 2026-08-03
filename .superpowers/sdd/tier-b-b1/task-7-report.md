# Task 7 Report — "Takip Et" Button on Keyword-Rank Result Page

## What I Implemented

Added a client-side `TrackThisButton` to the completed keyword-rank-checker result page so users can promote the current keyword+domain pair into daily recurring tracking (Tier B B1).

### Files
- **Created** `apps/web/src/components/tracker/track-this-button.tsx`
  - `"use client"` component, props `{ keyword, domain }`.
  - Collapsed state: renders a single `<button>` with the Turkish CTA "Bu Anahtarı Takip Et".
  - Expanded state: renders an inline `<form>` with hidden `keyword`/`domain` and an `email` input, wired to `createTrackerTargetAction` via `useActionState`.
  - Success state: renders a green status block with a link to `/tracker/{token}`.
  - Server/validation errors from the action state surface as `role="alert"` paragraphs.
- **Created** `apps/web/src/__tests__/tracker-track-this-button.test.ts`
  - Contract test using `renderToStaticMarkup` to assert the collapsed CTA text "Bu Anahtarı Takip Et" is present. Mocks `@/lib/tracker/actions` so no server actions run.
- **Modified** `apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx`
  - Added `TrackThisButton` import.
  - Inserted a new "Günlük Takip" card (with `<h2>`) between the "İlk 10 Sonuç" table card and the GEO readiness cross-link card, so it only appears in the completed-result branch.

## TDD Evidence

### RED
```
FAIL  src/__tests__/tracker-track-this-button.test.ts > TrackThisButton > renders the track-this CTA with Turkish text in collapsed state
Error: Cannot find module '../components/tracker/track-this-button' imported from 'C:/bc-proje/Seovista/apps/web/src/__tests__/tracker-track-this-button.test.ts'
Test Files  1 failed (1)
      Tests  1 failed (1)
```

### GREEN
New test + existing keyword-rank result state regression tests run together:
```
 ✓ src/__tests__/tracker-track-this-button.test.ts (1 test) 40ms
 ✓ src/__tests__/keyword-rank-result-states.test.ts (4 tests) 1803ms
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

The existing landmark contract tests (exactly one `<main>`, exactly one `<h1>`) still pass — the new card uses an `<h2>`, so no landmark regressions.

## tsc Result
```
pnpm --filter @seovista/web exec tsc --noEmit
EXIT: 0
```
Strict-mode type check passes with no errors.

## Files Changed
- `apps/web/src/components/tracker/track-this-button.tsx` (new, 87 lines)
- `apps/web/src/__tests__/tracker-track-this-button.test.ts` (new, 26 lines)
- `apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx` (modified: +6 lines — import + Günlük Takip card)

## Commit
`848ad78` — `feat(web): 'takip et' button on keyword-rank result page`
Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>

## Self-Review Findings
- **Import style**: the component uses the relative path `../../lib/tracker/actions` (matching the brief), while the test mocks the `@/lib/tracker/actions` alias. Both resolve to the same absolute file under the vitest `@` → `src` alias, and the GREEN test result confirms the mock is applied correctly.
- **Landmark safety**: the new "Günlük Takip" card uses `<h2>`, preserving the exactly-one-`<h1>` / exactly-one-`<main>` invariants verified by `keyword-rank-result-states.test.ts`.
- **No UUIDs in tests**: the test uses plain string placeholders (`"seo denetimi"`, `"example.com"`), no UUID-format strings.
- **Scope**: only the three task files were staged/committed. Pre-existing unrelated working-tree changes (`.superpowers/sdd/progress.md`, `apps/web/tsconfig.json`, untracked `tier-b-b1/` directory) were left untouched and not included in the commit.
- **No new public route / metadata / sitemap impact**: this is an inline interactive widget on an existing `robots: noindex` result page; no canonical URL, JSON-LD, or `llms.txt` changes.
- **Concerns**: none. The expanded-form email submission flow is exercised by the B1 e2e suite per the brief; this task's contract scope is the collapsed CTA rendering, which is covered.
