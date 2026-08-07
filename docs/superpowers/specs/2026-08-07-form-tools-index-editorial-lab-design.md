# Spec: Form Pages + Tools Index — Editorial Lab Identity

**Date:** 2026-08-07
**Status:** Draft
**Parent authority:** SeoVista PRD ("Editorial Intelligence Lab" identity); extends the approved result-page design `docs/superpowers/specs/2026-08-06-result-page-editorial-lab-design.md` (tokens, typography, tone are inherited verbatim).
**Scope line:** the 8 `/tools/*/page.tsx` form routes, the `/tools/` index page, and the two Client components that render inside them (`SerpPreviewTool`, `GatedReportForm`).

## Goal

Make every tool form read like the intake sheet of the same lab that prints the result reports: paper background, serif h1 under a mono eyebrow, hairline-separated fields, ink primary action. The old slate/indigo "white card on gray" shell is retired everywhere a tool form renders. Copy stays exactly as-is per tool (locked decision: forms stay in their current language — geo EN, others TR; only the new frame eyebrow and the index corrections are touched).

## Design tokens and typography

Inherited from the result-page spec (normative swap table):

| Old utility | New utility |
|---|---|
| `bg-gray-50`, `bg-white` | `bg-paper` |
| `text-gray-900` | `text-ink` |
| `text-gray-500`, `text-gray-600`, `text-gray-700` | `text-muted-ink` |
| `border-gray-100`, `border-gray-200`, `border-gray-300` | `border-hairline` |
| `text-blue-*`, `bg-blue-*`, `focus:ring-blue-*` (actions/focus) | `text-spectral`, `bg-ink`, `focus:ring-spectral` |
| `text-red-*`, `bg-red-*`, `border-red-*` (errors) | `text-ember`, `bg-mineral`, `border-ember/30` |
| `text-green-*` / `border-green-*` (ok states) | `text-signal` / `border-signal/40` |
| `text-amber-*` / `border-amber-*` (warnings) | `text-ember` / `border-ember/40` |
| `font-extrabold`, `font-bold` headings | `font-serif` (Fraunces) on the page h1 only |
| `shadow-xl`, `shadow-sm`, `shadow` | dropped (no shadows) |
| `rounded-xl` card container | no card container — fields sit on `bg-paper` |
| `placeholder-gray-400` | `placeholder:text-muted-ink/60` |

Typography rules identical to the result-page spec: h1 `font-serif text-4xl md:text-5xl tracking-tight`; body `font-sans` (Inter Tight); eyebrow uses the exact `ResultShell` eyebrow pattern (`font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink` with the `h-px w-10 bg-hairline` rule); ids/urls `font-mono`.

## Component inventory

New shared kit under `apps/web/src/components/form-pages/` (Server Components, re-exported from `index.ts`):

1. **FormShell** — the outer frame for every form route. Props: `title: string` (per-tool h1, unchanged copy), `helper?: string` (per-tool helper, unchanged copy), `eyebrow?: string` (default `Seovista / Instruments`), `children`. Renders exactly one `<main id="main" className="min-h-screen bg-paper text-ink">`, a content column `mx-auto w-full max-w-5xl px-6 py-12 md:py-16`, a header band (eyebrow with the hairline rule, serif h1, helper `max-w-2xl text-muted-ink`), then children.
2. **FormField** — label + control + error slot. Props: `id`, `label`, `error?: string`, `children` (the control). Renders `<label htmlFor>` (`text-sm font-medium text-ink`) + control + `<p role="alert" className="mt-2 text-sm text-ember">` when error.
3. **SubmitButton** — primary action. Props: `pending: boolean`, `children` (idle label), `pendingLabel: string`. Renders `type="submit" disabled={pending}` with `bg-ink text-paper hover:bg-mineral disabled:opacity-50 rounded-md px-6 py-3 text-sm font-semibold transition-colors`; swaps the label when pending.
4. **Shared control classes** (exported const `fieldClass`): input/select `w-full rounded-lg border border-hairline bg-paper px-4 py-3 text-ink placeholder:text-muted-ink/60 focus:border-spectral focus:outline-none focus:ring-2 focus:ring-spectral/20 transition-colors`. Select chevron icons keep their shape, `text-gray-500` → `text-muted-ink`.

No card, no shadow anywhere in the kit.

## Page anatomy (all 8 form routes)

```
┌──────────────────────────────────────────────────────────────┐
│ FormShell (main, bg-paper)                                    │
│  eyebrow "Seovista / Instruments" ────────── hairline rule    │
│  h1 (font-serif, per-tool title)                              │
│  helper (per-tool, unchanged)                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ form (useActionState wiring unchanged)                   │ │
│  │   FormField groups (hairline-separated, space-y)         │ │
│  │   form-level error note (role="alert")                   │ │
│  │   SubmitButton (ink, label swap on pending)              │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Rules: exactly one `<h1>` and one `<main id="main">` per route (FormShell owns both); field `id`/`name` attributes, form `action`, `useActionState`, and metadata are unchanged so existing action tests and e2e flows keep passing; pending state keeps the current label-swap behavior.

## Per-page copy table (h1 + helper — UNCHANGED from today)

| Route | h1 (unchanged) | helper (unchanged) | language |
|---|---|---|---|
| geo-readiness-checker | GEO Readiness Checker | Find out how well your brand performs across AI Overviews and major Search Engines. | EN |
| schema-checker | Schema & Yapısal Veri Denetleyicisi | Web sitenizdeki JSON-LD ve Schema.org yapılarını, arama motorları ve AI botları için test edin. | TR |
| ai-crawler-checker | AI Crawler Checker | robots.txt dosyanızın GPTBot, ClaudeBot, PerplexityBot gibi AI botlarına ve geleneksel arama botlarına hangi erişimi verdiğini test edin. | TR helper |
| keyword-rank-checker | Anahtar Kelime Sıralama Kontrolü | SearXNG üzerinden ilk 10 sonuçta alan adınızın konumunu kontrol edin. Sonuç, kontrol anına ait dürüst bir anlık görüntüdür. | TR |
| render-parity-diff | Render Parity Karşılaştırması | Sayfanızı iki kez getirir — bir kez bir tarayıcı User-Agent'ı, bir kez bir bot User-Agent'ı ile — ve iki gösterim arasındaki farkları raporlar. Tarayıcıların gördüğü içerik insanların gördüğü sürümden saparsa bunu işaret eder. | TR |
| attribution-trace | Attribution Trace | Yapıştırdığınız AI yanıtındaki her iddiayı, sitenizin kendi içeriği ve anahtar kelimenin SERP sonuçlarıyla karşılaştırır. | TR helper |
| schema-truth-check | Schema Doğruluk Denetimi | Yapılandırılmış veri (JSON-LD) içindeki her iddianın sayfanın görünür içeriğinde karşılığını kontrol eder. | TR |
| serp-preview | SERP Preview | Başlık ve meta açıklamanızın Google'da nasıl görüneceğini tahmini pixel ölçümüyle test edin. | TR helper |

Field labels, placeholders, error strings, buttons, and per-form language are untouched. Only the frame (eyebrow/h1 class/helper class/container) changes.

**Single factual copy fix (in scope):** the render-parity-diff helper currently reads "bir kez bir tarayıcı User-Agent'ı, bir kez bir tarayıcı User-Agent'ı ile" — "tarayıcı" appears twice, but the tool compares a default (browser) request against a crawler (bot) request (the result page labels them "Default (browser) request / Crawler (bot) request"). The second occurrence becomes `bot` (Turkish preserved, factual correction only): "bir kez bir bot User-Agent'ı ile".

## Companion components restyle

1. **`apps/web/src/components/serp-preview/serp-preview-tool.tsx`** (Client, renders on the serp-preview form): token swap per the table (gray card → `bg-paper border-hairline`; ratio track `bg-gray-200` → `bg-mineral`; truncated `text-red-700`/`bg-red-500` → `text-ember`/`bg-ember`; `ratio > 90` amber → ember; ok green → signal; `shadow-sm` dropped). Copy unchanged (TR).
2. **`apps/web/src/components/geo-checker/gated-report-form.tsx`** (Client, renders on the geo result page below the completed report): indigo family → `bg-mineral border-hairline`, headings `text-indigo-900` → `text-ink`, body `text-indigo-700` → `text-muted-ink`, inputs `border-indigo-200` → `border-hairline` with spectral focus, consent `text-indigo-600/800` → `text-spectral`/`text-ink`, primary `bg-indigo-600 hover:bg-indigo-700` → `bg-ink hover:bg-mineral`, error `text-red-600 bg-red-50` → `text-ember bg-mineral`, spinner `border-white border-t-transparent` → `border-paper/40 border-t-paper`. Copy unchanged (EN).

## Tools index (`/tools/page.tsx`) + site metadata

1. Commit the outstanding correctness edit (pre-existing unstaged change, approved in earlier sessions): instruments 04/05/08 flip `Planned` → `Preview` with hrefs; hero capabilities `Five previews available / Three briefs in planning` → `Eight previews available / No briefs in planning`. The page is already on the editorial identity (paper/ink/Fraunces/spectral pills) — no restyle needed.
2. SERP Preview row summary (currently Turkish in an English index) → EN: `Previews how your title and meta description appear in Google results, with pixel-level truncation warnings.`
3. Live-tool link label `Read brief →` → `Open tool →`; the `In planning` branch stays for the null-href case.
4. **`apps/web/src/content/site.ts`** `toolsPage` metadata: the description/ogDescription list only 5 tools and claim `Additional tools are planned for later phases` — update both strings to reflect all 8 live instruments (neutral wording, no fabricated claims). The e2e pin in `apps/web/tests/e2e/seo.spec.ts` (L17-18, toolsPage title/description) is updated in the same commit.

## State mapping (forms — behavior unchanged)

Forms have no audit lifecycle; only `idle → pending → success/error`. The kit only restyles presentation. Error summary (`state.errors.form`) renders as a `role="alert"` note with token classes; field errors via `FormField` `error` prop (`role="alert"`).

## Accessibility

- Exactly one `<h1>` and one `<main>` per route (FormShell owns both).
- Field errors: `role="alert"`; form-level error summary: `role="alert"`.
- Focus: `focus:border-spectral` + `focus:ring-2 focus:ring-spectral/20` on inputs/selects; no focus traps; modal-free.
- Labels: every control keeps a visible `<label htmlFor>` (unchanged).
- Submit disabled while pending (`disabled:opacity-50`) — unchanged.
- Contrast: ink/signal/ember/spectral on paper per the result-page spec (pre-tested ≥ 4.5:1 for text).
- The page h1 uses `font-serif`; body `font-sans` — no layout shift concerns (system font stacks unchanged from the result pages).

## Testing / acceptance criteria

### New suites

- `apps/web/src/__tests__/form-shell.test.tsx` — renders `FormShell`, `FormField`, `SubmitButton` against representative props: exactly one `<main id="main">` + one `<h1>`, eyebrow `Seovista / Instruments`, helper text, error `role="alert"`, disabled pending submit, and no `slate-|gray-|indigo-|blue-|red-|green-|amber-|emerald-|sky-|rose-` tokens in the markup.
- `apps/web/src/__tests__/form-pages.test.tsx` — for all 8 form routes: render the page component with the action mocked (the same `vi.mock` pattern as the result-state suites; forms are Client components using `useActionState`, so render the page with React DOM and assert SSR markup): exactly one `<main id="main">` + one `<h1>` with the per-tool title, the eyebrow, the expected field `id`s present, and no retired color tokens in the markup.

### Updated

- `apps/web/tests/e2e/seo.spec.ts` — toolsPage title/description pins (site.ts strings changed).
- Any existing assertion that references `Read brief`, the old capabilities text, or the old SERP summary on `/tools/` (unit or e2e) — update in the same commit.

## Out of scope

- Result pages and the `result-pages` kit (done in the previous pass).
- Form copy language unification (per-tool language stays — locked decision).
- `DisciplineHero`, `/geo/`, `/seo/`, tracker/admin UIs, `/tracker/*`.
- Worker/engine changes, persistence, queue behavior.
- `/tools/` page structural redesign (already on the identity; only the copy/status items above).

## Risks / open questions

1. **Client-component SSR in tests.** The 8 form pages are `"use client"` with `useActionState`; SSR-rendering them in vitest requires mocking `next/navigation` and the action module (the `vi.mock` hoisting pattern used by the result-state suites). The action modules are already exported pure functions (`startGeoAuditAction` etc.) — mock the server-action boundary, do not touch the action implementations.
2. **e2e flow continuity.** `geo-lead.spec.ts` fills `#domain`, `#brandName`, `#primaryMarket` and submits — field ids/names and the submit label (`Start Free Audit` / `Starting Audit...`) must stay byte-identical, or the spec breaks. The redesign keeps copy and ids unchanged by rule.
3. **site.ts metadata is shared** by the index page and the e2e pin — both update in the same commit or `seo.spec.ts` fails.
4. **Stale status edit in the working tree.** The `/tools/page.tsx` edit is pre-existing and unstaged; it becomes part of the committed index change. `apps/web/tsconfig.json` churn stays out of every commit (standing rule).
