# Design Spec: SERP Preview (`/tools/serp-preview/`)

**Date:** 2026-07-31
**Status:** Approved (scope A confirmed by user: manual input only)
**Owner:** SeoVista Engineering Team

---

## 1. Purpose

PRD MVP 4: title/meta preview with pixel guidance, truncation warning and shareable result. A fast, low-friction acquisition utility — **no worker, no DB, no queue**.

## 2. Architecture

```
[ /tools/serp-preview/ (RSC shell, reads ?title&desc&url searchParams) ]
      → [ SerpPreviewTool (single Client Component) ]
            ├── Inputs: title, meta description, display URL (controlled)
            ├── Live analysis via @seovista/seo-core analyzeSerpSnippet
            ├── Desktop + Mobile Google snippet cards (truncated preview text)
            ├── Pixel meters + truncation warnings + character guidance chips
            └── Share button → query-param URL → clipboard
```

## 3. Components

### 3.1 `@seovista/seo-core` — `serp-preview.ts` (new)

Deterministic, unit-testable pixel approximation (Arial advance-width table at 100px scale, including Turkish characters):

- `measurePixelWidth(text, fontSize): number`
- `truncateAtPixelWidth(text, maxPx, fontSize): { text, truncated }` — reserves ellipsis width (`" …"`), trims trailing whitespace.
- `SERP_LIMITS` — desktop (title 20px/600px max, description 14px/990px max), mobile (title 18px/600px max, description 14px/720px max).
- `SERP_CHAR_GUIDANCE` — title 50–60 chars, description 70–160 chars.
- `analyzeSerpSnippet(title, description): SerpAnalysis` — per-variant (desktop/mobile) `{ pixelWidth, maxPixelWidth, charCount, truncated, previewText }` plus char-guidance bands (`too-short | ok | too-long`).
- Empty input is valid (renders placeholder previews, no errors).

### 3.2 Web (`apps/web`)

- `app/tools/serp-preview/page.tsx` — RSC: one `<main>`, one `<h1>`, Turkish explainer, metadata; parses `searchParams` (first value when array) and passes initial values to the tool.
- `src/components/serp-preview/serp-preview-tool.tsx` — `"use client"`: controlled inputs, live `analyzeSerpSnippet`, two snippet cards, pixel meters (bar + numeric `642 / 600px`), truncation warnings ("Google bu alanı kısaltacak"), character guidance chips, share button (`navigator.clipboard`, transient "Kopyalandı ✓" feedback).
- `src/components/serp-preview/serp-snippet-card.tsx` — presentational card: URL breadcrumb (hostname › path from display URL input), blue title, gray description; desktop/mobile styling variant.

### 3.3 Sharing

State encodes to `?title=…&desc=…&url=…` query params on the same route; no storage. RSC shell prefills from params, so the shared link reproduces the exact preview.

### 3.4 Index & copy updates

- `app/tools/page.tsx` — add SERP Preview instrument (Preview status, href), renumber ids; hero capability "Three previews available" → "Four previews available".
- `src/content/site.ts` toolsPage meta description + body copy — mention SERP Preview as fourth linked preview (honesty rule); update pinned assertion in `apps/web/tests/e2e/seo.spec.ts` to match.

## 4. Honesty & UI standards

- Pixel measurement labeled as an **estimate** ("tahmini pixel ölçümü") — no claim of exact Google rendering.
- Turkish UI (PRD §0.3), WCAG 2.1 AA, text+icon warnings, exactly one `<h1>` in one `<main>`.
- TypeScript strict; Node 24 LTS; `pnpm@10.30.1`; TDD.

## 5. Testing

- seo-core unit tests: width table sanity, truncation + ellipsis reservation, thresholds, Turkish characters, empty input, guidance bands.
- Component tests (happy-dom + RTL): initial values from props, truncation warning appears for over-limit title, character guidance chip states, share button writes the parametrized URL to clipboard.
