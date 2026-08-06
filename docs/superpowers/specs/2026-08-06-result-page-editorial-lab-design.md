# Spec: Result Page Editorial Lab — Shared Report Components + Typography Pass

**Date:** 2026-08-06
**Status:** Draft
**Parent authority:** SeoVista PRD ("Editorial Intelligence Lab" identity, Citation Graph resonance motif)
**Style reference:** `docs/superpowers/specs/2026-08-03-tier-b-b3-alerts-design.md`
**Scope line:** 7 `app/tools/*/result/[jobId]/page.tsx` routes, their direct companion components, and 6 new shared components under `apps/web/src/components/result-pages/`.

## Goal

Make every tool result page read like a printed lab report: verdict first, evidence ledger second, provenance last. Persona is a technical SEO/GEO lead who screenshots or prints the page for a client deck. The visual language is the editorial paper-and-ink system already used by `DisciplineLayout` and the tools index; the old slate/indigo look is retired.

## Design tokens and typography

### Token mapping

All slate-* utilities are replaced. The full swap table:

| Old Tailwind utility | New design-token utility |
|---|---|
| `bg-slate-50`, `bg-slate-100` | `bg-paper` |
| `bg-slate-200`, `bg-slate-300` | `bg-mineral` |
| `text-slate-900`, `text-slate-950` | `text-ink` |
| `text-slate-500`, `text-slate-600`, `text-slate-700` | `text-muted-ink` |
| `text-emerald-*`, `text-green-*` (positive verdicts) | `text-signal` |
| `text-red-*`, `text-rose-*` (negative verdicts) | `text-ember` |
| `text-indigo-*`, `text-blue-*` (info/neutral chips) | `text-spectral` |
| `border-slate-200`, `border-slate-300` | `border-hairline` |
| `font-sans` on display headings | `font-serif` (Fraunces) on page h1 only |
| `font-sans` on body | `font-sans` (Inter Tight) |
| arbitrary uppercase micro-labels | `rotate-180` uppercase eyebrow (writing-mode) |

### Typography rules

- Page h1: `font-serif`, `text-4xl md:text-5xl`, tight tracking.
- Body, ledger rows, helper text: `font-sans` (Inter Tight).
- IDs, correlation ids, code, timestamps: `font-mono`.
- Eyebrow labels (top of each section): uppercase, `tracking-[0.14em]`, `text-muted-ink`, rendered with the `rotate-180` writing-mode trick already used in `DisciplineLayout`.

## Component inventory

### New shared components (Server Components by default)

All live under `apps/web/src/components/result-pages/` and are re-exported from `index.ts`.

1. **ResultShell** — outer frame: single `<main>` landmark, `bg-paper`, `border-hairline` top rule, header band with eyebrow + h1 + `AuditMetaStrip`. Props: `eyebrow`, `title`, `status`, `children`, `meta` (job id, queue name, submitted-at). Consumed by every result page.
2. **AuditMetaStrip** — inline provenance strip under the h1: job id (`font-mono`), queue name (`font-mono`), submitted timestamp, tool label. Zero client logic.
3. **VerdictCard** — the large verdict block that opens every completed state. Props: `verdict: "pass" | "warn" | "fail" | "info"`, `title`, `summary`, `score?: number`, `scoreLabel?: string`. Renders `text-signal` / `text-spectral` / `text-ember` chip and an optional big serif score. Consumed by all 7 result pages.
4. **IssueLedger** — the evidence table. Rows are `<article>` cards inside a `<section>` with `border-hairline` separators. Props: `items: Array<{ id, severity, title, detail, recommendation? }>`, `emptyLabel`. Replaces ad-hoc slate lists across the 7 pages.
5. **StatusPill** — small status chip used in `AuditMetaStrip` and inside `VerdictCard`. Variants map to `text-signal` / `text-spectral` / `text-ember` / `text-muted-ink`. Includes `aria-label` with full text.
6. **ReportErrorPanel** — failure-state card with `role="status"`, `aria-live="polite"`, `border-hairline`, lists terminal failure reason + correlation id + "Try again" link back to the form. Replaces the per-page inline error blocks.

### Existing components touched

| Component | Action |
|---|---|
| `AuditPoller` | stays a Client Component; classes restyled, copy unchanged. |
| `GatedReportForm` | stays Client; inherits `ResultShell` paddings. |
| `ScoreBreakdownView` | stays Client; slate classes swapped. |
| `CrewReportSection`, `CrewCtaView` | stay Client; restyled. |
| `MatchedServicesView` | stays Client; restyled. |
| `SerpPreview` | stays Client; restyled. |
| `SchemaScoreOverview`, `SchemaGraphTree` | Server; token swap only. |
| `CrawlerAccessMatrix`, `CrawlerIssues`, `PlatformConfidence` | Server; token swap only. |
| `UnknownJobStatusView` | **moved** from `src/lib/admin/job-result-guard.tsx` into `result-pages/` so it renders inside `ResultShell` with the new copy. |

## Page anatomy

Common anatomy (all 7 pages):

```
┌─────────────────────────────────────────────────────────────┐
│ ResultShell                                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ eyebrow (rotate-180 uppercase) + h1 (font-serif)         │ │
│  │ AuditMetaStrip (mono ids, timestamps)                   │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ StatusPill   /   VerdictCard (completed)                 │ │
│  │ IssueLedger (completed evidence)                        │ │
│  │ Attribution-only: SSR SVG citation-graph block          │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ next-step links / crew CTA                              │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Per-page render contract

For every page the shell tree is the same. What changes is the state branch:

| State | Shared tree | Copy block |
|---|---|---|
| In-flight (`queued`/`running`) | ResultShell → AuditMetaStrip → StatusPill → `AuditPoller` | "Checking…" + tool-specific helper |
| Terminal failed (`failed`, `timeout`, `permanent`, `permanent_failure`) | ResultShell → ReportErrorPanel | "Report failed" + correlation id |
| Unknown | ResultShell → UnknownJobStatusView | "We can’t find this report" |
| Completed | ResultShell → AuditMetaStrip → VerdictCard → IssueLedger → next-step links | tool-specific verdict + ledger |
| Payload malformed | ResultShell → ReportErrorPanel | "Report data is incomplete" |

**Pages:**
1. `geo/result/[jobId]` — VerdictCard: "AI-citation readiness"; ledger: ranked citation gaps.
2. `schema/result/[jobId]` — VerdictCard: "Structured data coverage"; ledger: missing/invalid types.
3. `ai-crawler/result/[jobId]` — VerdictCard: "AI crawler access"; ledger: blocked/allowed bots.
4. `keyword-rank/result/[jobId]` — VerdictCard: "Rank snapshot"; ledger: keywords + positions + movement.
5. `attribution/result/[jobId]` — VerdictCard: "Citation trace"; ledger: source-list; **plus** the SSR SVG block (below).
6. `render-parity/result/[jobId]` — VerdictCard: "Render parity"; ledger: diff classes.
7. `schema-truth/result/[jobId]` — VerdictCard: "Schema truth"; ledger: contradictions.

### Attribution Trace SVG (completed state only)

Rendered in `ResultShell` as a `<section>` with heading "Citation graph". Constraints:

- SSR-rendered inline `<svg>`; no new runtime dependency, no client toolkit.
- Edges: `<line stroke="var(--color-hairline)" stroke-width={0.5 + 2*bestSimilarity} />`.
- Node fill by verdict kind: pass → `text-signal`, info → `text-spectral`, warn/fail → `text-ember`, unlinked → `text-muted-ink`.
- Hover tooltips via `title` attribute and CSS `pointer-events: auto`; no JS.
- Wrapped in `<figure>` with a `<figcaption>` summary sentence.

## Copy (English)

| Context | Copy |
|---|---|
| Eyebrow (all pages) | `Seovista / Lab report` |
| Geo h1 | `Citation readiness` |
| Geo helper | `How large language models describe your pages, and where citations drop off.` |
| Schema h1 | `Structured data coverage` |
| Schema helper | `Which Schema.org types are present, valid, and eligible for rich results.` |
| AI Crawler h1 | `AI crawler access` |
| AI Crawler helper | `Whether AI training and retrieval bots can read this site.` |
| Keyword Rank h1 | `Rank snapshot` |
| Keyword Rank helper | `Current positions for your tracked keywords in live search.` |
| Attribution h1 | `Citation trace` |
| Attribution helper | `Where each claim came from, and which sources carried the most weight.` |
| Render Parity h1 | `Render parity` |
| Render Parity helper | `Differences between raw HTML and the rendered page AI systems see.` |
| Schema Truth h1 | `Schema truth` |
| Schema Truth helper | `Where your markup contradicts on-page facts, and what to fix first.` |
| In-flight status pill | `Checking` |
| In-flight helper | `The audit is running. This page refreshes automatically.` |
| ReportErrorPanel title | `Report failed` |
| ReportErrorPanel body | `We could not finish this audit. Keep the reference id below when you ask for help.` |
| ReportErrorPanel CTA | `Try again` |
| UnknownJobStatusView h1 | `We can’t find this report` |
| UnknownJobStatusView body | `The link may have expired, or the report id is wrong. Start a new audit to get a fresh link.` |
| VerdictCard pass label | `Pass` |
| VerdictCard warn label | `Warning` |
| VerdictCard fail label | `Fail` |
| VerdictCard info label | `Info` |
| IssueLedger empty state | `No issues found.` |
| IssueLedger evidence heading | `Evidence ledger` |
| Attribution graph heading | `Citation graph` |
| Crew CTA heading | `Need a hand with the next step?` |
| Crew CTA body | `Our crew can turn this report into a fix list for your team.` |
| Malformed payload title | `Report data is incomplete` |
| Malformed payload body | `The audit finished, but the stored result is unreadable. Rerun the audit to regenerate it.` |

Tone rules: short imperative verbs, no exclamation points, no fabricated customer claims, only describe what the tool reported.

## State machine mapping

| Status | Shell variant | Copy block | ARIA |
|---|---|---|---|
| `queued` | ResultShell + StatusPill("Checking") + AuditPoller | In-flight helper | `role="status"` + `aria-live="polite"` |
| `running` | ResultShell + StatusPill("Checking") + AuditPoller | In-flight helper | `role="status"` + `aria-live="polite"` |
| `failed` | ResultShell + ReportErrorPanel | "Report failed" + correlation id | `role="status"` + `aria-live="polite"` |
| `timeout` | ResultShell + ReportErrorPanel | "Report failed" + correlation id | `role="status"` + `aria-live="polite"` |
| `permanent` | ResultShell + ReportErrorPanel | "Report failed" + correlation id | `role="status"` + `aria-live="polite"` |
| `permanent_failure` | ResultShell + ReportErrorPanel | "Report failed" + correlation id | `role="status"` + `aria-live="polite"` |
| `unknown` | ResultShell + UnknownJobStatusView | "We can’t find this report" | default |
| `completed` | ResultShell + AuditMetaStrip + VerdictCard + IssueLedger | tool-specific verdict | default |
| `completed` (payload malformed) | ResultShell + ReportErrorPanel | "Report data is incomplete" | `role="status"` + `aria-live="polite"` |

`UnknownJobStatusView` is extracted from `src/lib/admin/job-result-guard.tsx` into `apps/web/src/components/result-pages/unknown-job-status-view.tsx` so it inherits `ResultShell` styling. All pages continue to filter by `queue_name` exactly as today; no persistence change.

## Accessibility

- `role="status"` + `aria-live="polite"` on every in-flight block and every `ReportErrorPanel`.
- Score chips: `aria-label="Score: 85 out of 100"` on the score element inside `VerdictCard`.
- Landmarks: exactly one `<h1>` and one `<main>` per page; section content uses `<h2>`-level headings inside `ResultShell`.
- Focus: no new focus traps; modal-free design.
- Contrast: status chips use `text-signal` / `text-spectral` / `text-ember` on `bg-paper` or `bg-mineral`; tokens are pre-tested at ≥ 4.5:1 for text usage.
- Attribution SVG: `<svg role="img" aria-label="Citation graph">`, with `<title>` inside for screen readers.

## Testing / acceptance criteria

### Updates to existing suites

- `apps/web/src/__tests__/geo-result-states.test.ts`
- `apps/web/src/__tests__/schema-result-states.test.ts`
- `apps/web/src/__tests__/ai-crawler-result-states.test.ts`
- `apps/web/src/__tests__/keyword-rank-result-states.test.ts`
- plus the remaining 3 result-state suites

Changes: swap slate-class assertions for design-token classes; update any inline copy assertions to the new English strings; verify `role="status"` and `aria-live="polite"` on in-flight and failure states; verify `aria-label` on score chips; verify exactly one h1/main per page.

### New suite

- `apps/web/src/__tests__/result-shell.test.tsx` — renders `ResultShell`, `AuditMetaStrip`, `VerdictCard`, `IssueLedger`, `StatusPill`, `ReportErrorPanel`, and `UnknownJobStatusView` against representative payloads for all 7 tools.

Worker tests are unaffected. Tool action/validation tests (`*-actions.test.ts`) stay untouched.

## Out of scope

- Forms (`/tools/.../page.tsx`), `/tools/` index page, `DisciplineHero`.
- Tracking/admin UIs.
- ISR/SSR, middleware, database schema, worker processors (already migrated in 5addd1b).
- Persistence / queue behavior changes.
- Any new runtime dependency for the Attribution Trace SVG.

## Risks / open questions

1. **AuditPoller copy is hardcoded in some tests.** Copy changes must land in the same commit as the test updates, or suites break.
2. **Server/Client boundary.** New shared components default to Server Components and are re-exported from `apps/web/src/components/result-pages/index.ts`; existing `use client` components keep their directives.
3. **Attribution SVG.** The trace drawing code must not pull in d3, svg-react, or any other runtime dependency; pure inline SVG only.
4. **Tools index copy untouched.** `/tools/` index page's "Read brief →" copy is out of this pass.
