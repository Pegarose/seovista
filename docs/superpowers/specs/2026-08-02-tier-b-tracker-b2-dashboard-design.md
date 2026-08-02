# Spec: Tier B — B2 Tracker Dashboard (Trend Charts + CSV Export)

**Date:** 2026-08-02
**Status:** Approved (brainstorming complete)
**Parent PRD:** `docs/prd/2026-07-31-keyword-tracking-prd.md` (Tier B)
**Parent authorities:** SeoVista PRD (Later roadmap: Recurring visibility dashboard), Implementation Brief v1 (§12, ADR 0002)
**Depends on:** Tier B B1 Recurring Rank Tracker (shipped — migration 015, repository, scheduler, `/tracker` + `/tracker/[token]` pages)

## 1. Scope

B2 is the second vertical slice of Tier B. It delivers the dashboard experience B1 deferred:

- **Trend chart per target:** server-rendered SVG line chart (position over time, 90-day window) replacing B1's compact "Son 7 Gözlem" badge list
- **Card layout:** B1's 6-column table is replaced by per-target cards — each card holds the chart, latest position, last-checked date, and deactivate button
- **CSV export:** a single global "CSV indir" button that exports all targets' observations in one long-format file
- **Inline add-target form:** a keyword + domain form directly on the dashboard (email is implicit from the session token) — replaces B1's "go to /tracker" link
- **`router.refresh()` migration:** `window.location.reload()` on the deactivate flow is replaced by `router.refresh()` (B1 deferred debt)

**Out of scope (deferred to B3 / later):**
- Delta badges (↑/↓ change indicators) — not selected during brainstorming
- Target detail view (big chart + full history + competitor overlay) — not selected
- Alerting thresholds, email/in-app notifications (B3)
- Observation retention/cleanup cron (B3)
- Pagination or time-range selector (90-day window is fixed)

## 2. Architecture

### 2.1 Component Restructure

B1's `TrackerDashboard` is a monolithic `"use client"` component that renders a table. B2 replaces it with an **RSC-first card layout** with small client islands for genuine interaction only:

| Component | Type | Location | Responsibility |
|---|---|---|---|
| `TrackerTokenPage` | RSC | `app/tracker/[token]/page.tsx` | Token gate, data fetch, renders card list + export link + inline form |
| `TrackerTargetCard` | RSC | `src/components/tracker/tracker-target-card.tsx` | Per-target card: heading, meta, TrendChart, `<details>` table, deactivate island |
| `TrendChart` | RSC | `src/components/tracker/trend-chart.tsx` | Pure SVG line chart from observation data (zero client JS) |
| `DeactivateButton` | Client | `src/components/tracker/deactivate-button.tsx` | `useTransition` + `deactivateTrackerTargetAction` + `router.refresh()` |
| `AddTargetForm` | Client | `src/components/tracker/add-target-form.tsx` | `useActionState` form: keyword + domain → `createTrackerTargetForSessionAction` |
| `TrackerDashboard` | — | deleted | Replaced by the RSC card layout above |

The old `tracker-dashboard.tsx` is deleted. Its functionality is split across the RSC card + two client islands.

### 2.2 Data Flow

```
/tracker/[token] page (RSC)
  ├── listTrackerTargetsAction(token)  →  { targets, email }
  ├── <AddTargetForm token={token} />          (client island)
  ├── <a href="/tracker/{token}/export">       (plain link, no JS)
  └── targets.map(target => <TrackerTargetCard .../>)
        ├── <TrendChart observations={target.recentObservations} keyword={target.keyword} />
        ├── <details><table>...</table></details>
        └── <DeactivateButton token={token} targetId={target.id} active={target.active} />
```

After a successful add, the server action calls `revalidatePath("/tracker/{token}")` and `useActionState`'s built-in route refresh re-renders the RSC tree automatically — no explicit `router.refresh()` needed. After a successful deactivate (imperative call, not a form action), the `DeactivateButton` client island calls `router.refresh()` to trigger the re-render.

### 2.3 Render Approach: Server-Rendered SVG

The chart is rendered as pure SVG in a Server Component. Rationale:

- **AGENTS.md compliance:** "Server Components by default; Client Components only for genuine browser interaction." A static line chart of daily positions has no genuine browser interaction.
- **Zero bundle cost:** no chart library, no client JS, no new dependency.
- **Native tooltips:** SVG `<title>` elements provide hover tooltips for free.
- **Accessibility:** paired with a `<details>` data table for screen reader and keyboard access.
- **Inverted Y axis:** position 1 at top is trivial in custom SVG (just invert the Y mapping); chart libraries need configuration.

## 3. TrendChart Component (RSC, Pure SVG)

### 3.1 Props

```ts
interface TrendChartProps {
  observations: Array<{ position: number; checkedAt: string }>; // ASC by checkedAt
  keyword: string;
}
```

The page reverses B1's DESC-ordered `recentObservations` to ASC before passing to the chart. (Repository change: `LIMIT 7` → `LIMIT 90`; DESC ordering stays in the query, the component reverses in-memory.)

### 3.2 SVG Geometry

- `viewBox="0 0 560 160"`, `width="100%"`, `preserveAspectRatio="xMidYMid meet"`
- Padding: 32px left (Y labels), 24px right, 20px top, 28px bottom (X labels)
- **Y axis (inverted):** position 1 at top, position 10 at bottom. Mapping: `y = padTop + (position - 1) / 9 * (chartHeight)`. Y labels: "1" at top, "10" at bottom.
- **X axis (time-based):** each observation plotted by its actual date relative to the observation window. `x = padLeft + (dateMs - firstDateMs) / (lastDateMs - firstDateMs) * chartWidth`. Edge case: single observation → centered dot, no polyline.
- **Line:** `<polyline>` through all in-top-10 points (position 1–10), `stroke="#0f172a"` (slate-900), `stroke-width="1.5"`, `fill="none"`.
- **Points:** `<circle r="3">` at each in-top-10 position, `fill="#0f172a"`. Each has a `<title>` child: `"{tr-TR date} — #{position}"`.
- **Axis text:** `fill="#94a3b8"` (slate-400), `font-size="11"`.

### 3.3 position = 0 ("İlk 10'da yok")

Position 0 is semantically distinct from position 10 (the domain was not found in the top 10 results). It is rendered as a **separate marker in a bottom band** below the chart area:

- `y = chartHeight + padTop + 12` (below the position-10 line, inside the viewBox)
- `<circle r="3" fill="#f59e0b">` (amber-500)
- `<title>`: `"{tr-TR date} — İlk 10'da yok"`
- Not connected to the main polyline (broken line segments on either side)

This avoids the dishonest visual of plotting "not found" as position 10 or 11.

### 3.4 Gap Handling

If the daily scan misses a day (worker downtime, SearXNG error), there is no observation for that date. The chart uses **straight-line connections** between consecutive available points. Time-based X positioning means the gap is visible as wider spacing, but no dashed-line or gap-marker is drawn.

**Known limitation:** a 1–2 day gap is visually invisible; a multi-day gap appears as a long straight segment. This is acceptable for B2 (YAGNI). B3 or later may add gap markers if needed.

### 3.5 Accessibility

- `<svg role="img" aria-label="{keyword}: son {n} günde {firstPosition} → {lastPosition}">`
- A `<details>` element below the SVG contains a semantic `<table>` with all observations (date, position). This serves screen readers and keyboard users who cannot parse the visual chart. The `<summary>` reads "Veri tablosunu göster".
- The `<details>` table is also useful for sighted users who want exact values.

### 3.6 Empty State

When `observations.length === 0`, `TrendChart` renders `null` and the parent card shows: "İlk kontrol bu gece 03:00 UTC'de yapılacak." (The daily batch runs at 03:00 UTC per B1's scheduler.)

### 3.7 X-Axis Date Ticks

~6 date ticks spread across the time range, formatted as `d MMM` in tr-TR (e.g. "12 Ağu"). Computed by dividing the time span into 5 equal intervals. If fewer than 6 observations exist, only the available dates are labeled.

## 4. Card Layout & Inline Add Form

### 4.1 TrackerTargetCard (RSC)

Each card is a `<section>` containing:

- `<h2>`: keyword (e.g. "seo denetimi")
- Domain in `<span class="font-mono">`: e.g. "example.com"
- Meta row: latest position badge (`#3` or "İlk 10'da yok" or "Henüz kontrol edilmedi") + last checked date (tr-TR)
- `<TrendChart>` component
- `<details>` data table ( accessibility + exact values)
- `<DeactivateButton>` island (only if `target.active`)

Inactive targets show a "Pasif" badge and no deactivate button (observations retained per B1 soft-delete).

### 4.2 AddTargetForm (Client Island)

A `"use client"` form with two inputs (keyword, domain) and a submit button. Uses `useActionState` with the new `createTrackerTargetForSessionAction`. On success, the action calls `revalidatePath` and `useActionState`'s built-in route refresh re-renders the dashboard automatically to show the new target card. No explicit `router.refresh()` needed for form actions.

- Email is **not** an input — the session is resolved from the token in the URL.
- Validation errors (keyword too long, invalid domain, duplicate, max-targets, rate limit) are displayed inline below the form.
- The form is placed at the top of the dashboard (above the card list), replacing B1's "go to /tracker" link block.

### 4.3 DeactivateButton (Client Island)

A `"use client"` button using `useTransition`:

1. Calls `deactivateTrackerTargetAction(token, targetId)`
2. On success, calls `router.refresh()` (replaces B1's `window.location.reload()`)
3. On error, shows the error message inline and resets the button
4. Disabled state with "Kaldırılıyor..." text during the transition

### 4.4 Export Link (RSC, No JS)

A plain `<a href="/tracker/{token}/export" download>` link styled as a button, placed in the dashboard header next to the `<h1>`. No client JS — the browser handles the download natively.

### 4.5 Page Structure

```tsx
<main id="main">
  <h1>Takip Panelim</h1>
  <p>subtitle + export link</p>
  <AddTargetForm token={token} />
  {targets.length === 0 ? <EmptyState /> : targets.map(t => <TrackerTargetCard ... />)}
</main>
```

Landmark contract: one `<main id="main">`, one `<h1>`. Card headings are `<h2>`. The `<details>` summary is not a heading.

## 5. CSV Export

### 5.1 Route Handler

File: `apps/web/app/tracker/[token]/export/route.ts`

```
GET /tracker/{token}/export → text/csv
```

- UUID regex gate on token (same `TOKEN_RE` as the page) → 404 if malformed
- `findSessionByToken` → 404 if unknown token
- `listTargetsByToken` (returns all targets with 90 observations each)
- Builds CSV string, returns `Response` with appropriate headers

### 5.2 CSV Format

- **Encoding:** UTF-8 with BOM (`\uFEFF` prefix) — ensures Turkish characters (ö, ç, ş, ğ, ü, İ) display correctly in Excel.
- **Delimiter:** semicolon (`;`) — Turkish Excel uses comma as the decimal separator, so it expects semicolon-delimited CSV. This is the tr-TR locale convention.
- **Header row:** `keyword;domain;date;position;top_competitors`
- **Data rows:** one row per observation, long format:
  - `keyword`: the target keyword (Turkish text, may contain special chars)
  - `domain`: the target domain
  - `date`: ISO date `YYYY-MM-DD` (from `checked_at` timestamp, date-only)
  - `position`: raw integer. `0` means "not found in top 10" (documented in the UI near the export button as a help text)
  - `top_competitors`: comma-separated `domain(#rank)` list, e.g. `rival.com(#1),other.com(#2)`. Comma is safe inside a semicolon-delimited field. Empty if no competitors were recorded.

### 5.3 Field Escaping

Fields are wrapped in double quotes when they contain a semicolon, double quote, or newline. Embedded double quotes are doubled (`""`). This is standard RFC 4180 escaping adapted for semicolon delimiter. Keywords are Turkish user input and may contain `;` or `"`.

### 5.4 Response Headers

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="seovista-takip-{YYYY-MM-DD}.csv"
Cache-Control: no-store
```

The filename date is the current date (download date), not the data date.

### 5.5 Rate Limiting

No separate rate limit for CSV export. The token is a secret (unguessable UUID); anyone who can view the dashboard can export. Data volume is small (max 5 targets × 90 days = 450 rows). Adding a rate limit would be YAGNI.

### 5.6 Empty Export

If the session has no targets or no observations, the CSV still downloads with just the header row. This is honest — the user sees an empty dataset rather than an error.

## 6. New Server Action: createTrackerTargetForSessionAction

File: `apps/web/src/lib/tracker/actions.ts`

```ts
export type TrackerSessionTargetActionState = {
  status: "idle" | "error" | "success";
  errors?: { keyword?: string[]; domain?: string[]; form?: string[] };
};
```

### 6.1 Flow

1. Extract `keyword` and `domain` from `formData` (no email — implicit from session)
2. Zod validation: new schema `TrackerSessionTargetSchema` (keyword + domain only, no email). A separate schema keeps validation honest — reusing `TrackerTargetFormSchema` would require a dummy email value.
3. UUID regex check on `token` (defense in depth; page already gates, but this action is called from the client island which receives the token as a prop)
4. `findSessionByToken(token)` → if null, return error "Oturum bulunamadı." (shouldn't happen on a valid dashboard, but defensive)
5. `checkIpRateLimit` with bucket `"tracker-create"` (same bucket as the `/tracker` form — shared quota)
6. `countActiveTargets(sessionId)` → if ≥ `TRACKER_MAX_TARGETS_PER_EMAIL`, return "Bu panel için maksimum hedef sayısına ulaştınız."
7. `createTarget({ sessionId, keyword, domain, locale: "tr-TR" })` → catch PG 23505 → "Bu anahtar kelime zaten takip ediliyor." (rethrow all other errors)
8. `revalidatePath("/tracker/[token]")` — actually `revalidatePath(\`/tracker/${token}\`)` with the concrete token
9. Return `{ status: "success" }`

### 6.2 Validation Schema

New schema in `validation.ts`:

```ts
export const TrackerSessionTargetSchema = z.object({
  keyword: z.string().trim().min(1, "Anahtar kelime gereklidir.").max(200, "Anahtar kelime 200 karakteri geçemez."),
  domain: z.string().trim().min(1, "Alan adı gereklidir.").max(253, "Alan adı 253 karakteri geçemez."),
});

export function validateTrackerSessionTargetInput(input: { keyword: string; domain: string }) {
  return TrackerSessionTargetSchema.safeParse(input);
}
```

## 7. Repository Changes

### 7.1 listTargetsByToken: LIMIT 7 → 90

The only repository change. In `apps/worker/src/db/tracker-repository.ts`:

```sql
-- Before (B1):
SELECT position, checked_at FROM rank_observations
WHERE target_id = $1 ORDER BY checked_at DESC LIMIT 7

-- After (B2):
SELECT position, checked_at FROM rank_observations
WHERE target_id = $1 ORDER BY checked_at DESC LIMIT 90
```

This aligns with B3's planned 90-day retention window. The `recentObservations` array name is kept (no type change) to avoid a breaking rename across consumers. The field semantically means "recent observations up to 90" after B2.

No new repository methods. The CSV export reuses `listTargetsByToken` (90 observations per target is the full window — no need for a separate "all observations" query).

### 7.2 No Schema Changes

No new migration. The existing `rank_observations` table and indexes are sufficient. The `idx_rank_obs_target_checked` index on `(target_id, checked_at DESC)` already supports the `LIMIT 90` query efficiently.

## 8. Error Handling

| Scenario | Behavior |
|---|---|
| Invalid/malformed token (page) | `notFound()` → 404 via `not-found.tsx` (B1 contract, unchanged) |
| Invalid/malformed token (export route) | Return `new Response(null, { status: 404 })` |
| Unknown token (export route) | Return `new Response(null, { status: 404 })` — no data leak |
| Session not found (inline add action) | Return `{ status: "error", errors: { form: ["Oturum bulunamadı."] } }` |
| Rate limit exceeded (inline add) | Return "Saatlik takip limitine ({limit}) ulaştınız..." |
| Max targets exceeded (inline add) | Return "Bu panel için maksimum hedef sayısına ({maxTargets}) ulaştınız." |
| Duplicate target (inline add) | Return "Bu anahtar kelime zaten takip ediliyor." (PG 23505) |
| Other DB error (inline add) | Rethrow → outer catch → "Sistem hatası nedeniyle hedef eklenemedi..." |
| Deactivate failure | DeactivateButton shows error message inline, resets button |
| Export with no targets | CSV with header row only (honest empty dataset) |

## 9. Testing Strategy

### 9.1 TrendChart Tests (`src/__tests__/trend-chart.test.ts`)

RSC component rendered via `renderToStaticMarkup`. Tests:

- Renders `<svg>` with `role="img"` and an `aria-label` containing the keyword
- Inverted Y axis: a position-1 point has a smaller `cy` than a position-10 point
- `position = 0` rendered as amber circle with `<title>` containing "İlk 10'da yok"
- Each in-top-10 point has a `<title>` with date and `#{position}`
- `<details>` element contains a `<table>` with one row per observation
- Empty observations → renders `null` (card shows empty state text)
- Single observation → renders a circle, no `<polyline>` (or a degenerate single-point polyline)

### 9.2 Actions Tests (`src/__tests__/tracker-actions.test.ts` extension)

New tests for `createTrackerTargetForSessionAction`:

- Unknown token → error "Oturum bulunamadı."
- Validation errors (empty keyword, invalid domain)
- Rate limit exceeded → form error
- Max targets exceeded → form error
- PG 23505 duplicate → "Bu anahtar kelime zaten takip ediliyor."
- Other DB error → rethrown → outer catch → "Sistem hatası..."
- Success → `revalidatePath` called with the token path

Mock `next/cache` `revalidatePath`, `@seovista/worker`, `@/lib/admin/db`, `next/headers`.

### 9.3 Export Route Tests (`src/__tests__/tracker-export-route.test.ts`)

- Malformed token → 404
- Unknown token → 404
- Valid token with targets → 200, `Content-Type: text/csv; charset=utf-8`, BOM present, semicolon-delimited header, correct row count
- Keyword containing `;` → field wrapped in double quotes
- `position = 0` → row contains `0` in the position column
- `top_competitors` → comma-separated `domain(#rank)` format
- Empty targets → CSV with header row only
- `Content-Disposition` header contains the date-stamped filename

Mock `@seovista/worker`, `@/lib/admin/db`.

### 9.4 Page Tests (`src/__tests__/tracker-pages.test.ts` update)

- Card layout: each target renders an `<h2>` (card heading)
- Landmark contract preserved: one `<main id="main">`, one `<h1>`
- Export link present: `<a href="...export" download>`
- Empty state: no cards, "Henüz takip edilen anahtar kelime yok" text
- Inline form present: `<form>` with keyword + domain inputs (AddTargetForm renders in initial state)

### 9.5 Client Island Tests

- `DeactivateButton`: `router.refresh()` called after successful deactivate (mock `next/navigation` `useRouter`)
- `AddTargetForm`: renders keyword + domain inputs, submits to the action, calls `router.refresh()` on success

### 9.6 Repository Test Update

- `listTargetsByToken` observation cap: verify 90 observations returned (was 7). Existing test updated with a 90-row fixture or a count assertion.

## 10. Honest Content Rules

- Trend chart plots **real SERP data** from SearXNG — no fabricated positions.
- `position = 0` is honestly rendered as "İlk 10'da yok" — never hidden or plotted as a real position.
- Gaps (missed scans) are visible as spacing in the time-based X axis — not filled with interpolated data.
- CSV export contains raw observation values — no smoothing, no fabrication, no computed deltas.
- No "ranking factor" claims — positions are factual observations.
- Empty datasets are exported as header-only CSV — no fake rows.

## 11. Out of Scope (Explicitly Deferred)

- **Delta badges (↑/↓):** not selected during B2 brainstorming. May be added later as a thin overlay on the card meta row.
- **Target detail view:** large chart + full history + competitor overlay. Not selected. Cards + `<details>` table cover the current need.
- **B3 (Alerts):** threshold-based notifications (email/in-app), position drop alerts, observation retention cron (90-day cleanup).
- **Time-range selector:** the 90-day window is fixed. A dropdown (7/30/90/all) would add client state and query variation — YAGNI for B2.
- **Chart interactivity (zoom, pan, crosshair):** no client JS. SVG `<title>` tooltips are sufficient.
- **Pagination:** max 5 targets × 90 days fits one page. No pagination needed.
- **Competitor chart overlay:** `top_competitors` JSONB is available in CSV export but not visualized on the chart. Detail view (deferred) would surface this.

## 12. Migration

**No new migration.** B2 uses the existing `rank_observations`, `keyword_targets`, and `tracker_sessions` tables from migration 015 (B1). No schema changes, no new indexes.

## 13. Environment Variables

**No new environment variables.** B2 reuses B1's `TRACKER_MAX_TARGETS_PER_EMAIL` (default 5) and `TRACKER_PER_IP_RATE_LIMIT` (default 3) for the inline add-target form. No new config needed for charts, CSV export, or `router.refresh()`.
