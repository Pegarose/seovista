# SeoVista Design System — Locked

Editorial intelligence lab. Paper + ink typography with three deliberate accent colors. This document is the single source of truth for visual language. Any change requires updating both `src/styles.css` and this file in the same commit.

---

## 1. Brand Voice

- **Tone:** Editorial, measured, evidence-first. Long-form serif headlines. Short factual body copy. No marketing hyperbole.
- **Composition:** Generous whitespace, hairline borders, corner brackets, subtle paper grain. One decisive accent per surface — never rainbows.
- **Motion:** Restrained. Scan lines, gentle rises, sticky scroll swaps. No parallax, no bounce.

---

## 2. Color System

Three accent colors. Each has a single semantic job. Do not repurpose them.

| Token | Hex (light) | Hex (dark) | Role |
|---|---|---|---|
| `--signal` | `#00bb00` | `#00bb00` | **Primary.** Actions, active states, success, growth, "live" indicators. |
| `--spectral` | `#1f3ce0` | `#7f9cff` | **Secondary.** Links, focus rings, data highlights, informational callouts. |
| `--ember` | `#c2410c` | `#fb923c` | **Tertiary.** Warnings, deprecations, "unavailable" states, editorial pull-quotes. |

### Neutrals (light theme)

| Token | Value | Use |
|---|---|---|
| `--paper` | `oklch(0.985 0.004 90)` | Page background |
| `--mineral` | `oklch(0.955 0.006 90)` | Secondary surfaces, muted cards |
| `--ink` | `oklch(0.185 0.015 260)` | Primary text, headings |
| `--muted-ink` | `oklch(0.48 0.015 260)` | Secondary text, captions |
| `--hairline` | `oklch(0.9 0.008 90)` | Borders, dividers, brackets |

### Foregrounds (paired)

- `--signal-foreground: #052e14` — text on signal fills
- `--spectral-foreground: #f5f7ff` — text on spectral fills
- `--ember-foreground: #fff7ed` — text on ember fills

### Rules

1. Only three accents exist. Do not introduce purple, teal, pink, yellow, etc.
2. Never combine two accents in the same component. Signal OR spectral OR ember — pick one.
3. Never hardcode hex in components. Use Tailwind tokens: `bg-signal`, `text-spectral`, `border-ember`.
4. Contrast is verified on `/design/contrast/`. All text pairs must pass WCAG AA. Signal is treated as a graphic element, not body text.

---

## 3. Typography

| Role | Family | Weight | Tracking |
|---|---|---|---|
| Display / H1–H4 | **Fraunces** (serif) | 500 | `-0.01em` |
| Body / UI | **Inter Tight** (sans) | 400 / 500 | normal |
| Mono / data | system ui-monospace | 400 | normal |

### Scale

| Class | Use |
|---|---|
| `text-6xl` → `text-9xl` | Hero H1 only (responsive) |
| `text-4xl` / `text-5xl` | Section H2 |
| `text-2xl` / `text-3xl` | Sub-section H3 |
| `text-lg` | Lead paragraph |
| `text-base` | Body |
| `text-sm` | Metadata, captions |
| `text-xs` uppercase tracking-widest | Eyebrows, labels |

### Rules

1. One H1 per page. Serif only.
2. Body copy stays sans. Do not set body in Fraunces.
3. Eyebrows are always `text-xs uppercase tracking-[0.2em] text-muted-ink`.
4. Never introduce a third font. No Inter, Poppins, Roboto — Inter Tight only.

---

## 4. Spacing & Layout

- **Base unit:** 4px (Tailwind default).
- **Section rhythm:** `py-16` mobile → `py-28` desktop.
- **Container:** max `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8`.
- **Hero:** full viewport height, content vertically centered with `-translate-y-[1.75rem]` header offset.
- **Grid:** 12-column responsive. Editorial rows alternate 60/40.

### Radius

- `--radius: 0.5rem` base. Cards use `rounded-lg`. Pills use `rounded-full`. Never `rounded-3xl+` — breaks editorial tone.

### Borders

- Always `1px solid var(--hairline)`. No thick borders. Corner brackets are 2px, 24px long, at 4 viewport corners of the hero.

---

## 5. Components

### Buttons

| Variant | Background | Foreground | Border |
|---|---|---|---|
| Primary | `bg-signal` | `text-signal-foreground` | none |
| Secondary | `bg-transparent` | `text-ink` | `border border-hairline` |
| Ghost | `bg-transparent` | `text-ink` | none |
| Link | inline | `text-spectral underline-offset-4 hover:underline` | none |

Focus: `focus-visible:outline-2 focus-visible:outline-spectral outline-offset-2`.

### Cards

`bg-card border border-hairline rounded-lg p-6`. No shadows by default. Elevated only for modals/popovers.

### Badges

`inline-flex items-center gap-1.5 text-xs uppercase tracking-widest border border-hairline px-2 py-0.5 rounded-full`. Signal dot uses `bg-signal` 6px round.

---

## 6. Motion

| Animation | Duration | Easing | Use |
|---|---|---|---|
| `hero-rise` | 0.7s | ease-out | Initial hero content mount |
| `scan-y` | 9s | linear infinite | Hero scan line texture |
| Scroll swap | native scroll + `sticky top-24` | — | Workflow preview |
| Hover | 150ms | ease-out | Links, buttons |

No spring physics. No parallax. `prefers-reduced-motion: reduce` disables `scan-y` and `hero-rise`.

---

## 7. Accessibility (locked)

- All text passes WCAG AA (verified at `/design/contrast/`).
- Focus rings visible on every interactive element (`--ring: var(--spectral)`).
- Semantic landmarks: `<header>`, `<main id="main">`, `<footer>`. Skip-to-content link mandatory.
- Heading order strict: H1 → H2 → H3, no skips.
- Interactive step indicators are real `<button role="tab">`, not divs.

---

## 8. Forbidden

- Purple/indigo gradients on white (generic AI aesthetic)
- Fonts: Inter, Poppins, Roboto, Montserrat
- Emoji icons in production UI
- Drop shadows on flat surfaces
- Hardcoded hex in components (must go through tokens)
- Introducing a 4th accent color
- Rainbow gradients or multi-hue backgrounds
- `text-white` / `bg-black` literals

---

## 9. Where things live

- Tokens: `src/styles.css` (`@theme inline` + `:root` + `.dark`)
- Contrast audit: `src/routes/design.contrast.tsx` → `/design/contrast/`
- Root layout & metadata: `src/routes/__root.tsx`
- Shared header/footer: `src/components/site-header.tsx`, `src/components/site-footer.tsx`

Change tokens in `src/styles.css` → rerun `/design/contrast/` → update this file. That is the whole workflow.
