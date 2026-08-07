# Form Pages + Tools Index Editorial Lab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 8 `/tools/*/page.tsx` form routes, the `/tools/` index copy, and the two Client companions (`SerpPreviewTool`, `GatedReportForm`) from the retired slate/indigo "white card" shell to the Editorial Lab paper/ink/spectral identity, with a new `form-pages` kit.

**Architecture:** Kit-first, mirroring the result-pages pass: build `FormShell` + field primitives (pure Server Components) with their own test suite, then migrate one-to-two pages per task into the kit, restyle the two Client companions via the spec's token mapping, refresh the index copy/metadata, and close with full gates. Form copy stays exactly as-is per tool (locked decision: geo EN, others TR); only the frame and one factual typo change.

**Tech Stack:** Next.js App Router (Client Components via `useActionState`), React 19, Tailwind CSS v4 design tokens, Vitest + `react-dom/client` `createRoot`/`act` (the in-repo client-component test pattern), Playwright (e2e pins updated once).

**Spec:** `docs/superpowers/specs/2026-08-07-form-tools-index-editorial-lab-design.md` (normative).

## Global Constraints

- Design tokens ONLY in every touched file: `bg-paper`, `bg-mineral`, `text-ink`, `text-muted-ink`, `text-signal`, `text-spectral`, `text-ember`, `border-hairline`, `font-serif`, `font-sans`, `font-mono`. NEVER `slate-*`/`gray-*`/`indigo-*`/`red-*`/`green-*`/`blue-*`/`amber-*`/`emerald-*`/`sky-*`/`rose-*`. No `shadow-*` anywhere (drop all shadows).
- Form copy, field `id`/`name` attributes, `useActionState` wiring, and per-tool language are UNCHANGED. The only copy change on forms: render-parity-diff helper's duplicated "bir kez bir tarayıcı User-Agent'ı" → second occurrence becomes "bir kez bir bot User-Agent'ı" (factual typo fix, TR preserved).
- Exactly one `<h1>` and one `<main id="main">` per route (FormShell owns both). Every card/white-shell element is removed — fields sit directly on `bg-paper`.
- Primary buttons use the committed pattern from `crew-cta-view.tsx`: `bg-ink text-paper hover:bg-mineral` + spectral focus ring.
- NEVER stage `apps/web/tsconfig.json` (`.next-runs` churn) or `.superpowers/sdd/*`. NEVER push. All commits on local `main` with the trailer `Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>`.
- Per-task gates (from `C:\bc-proje\Seovista\apps\web`): targeted vitest, full `pnpm vitest run`, `pnpm exec tsc --noEmit`, `pnpm next build`.
- Reference page styles: `apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx` (ResultShell header pattern: eyebrow `font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink` + `h-px w-10 bg-hairline` rule + serif h1).

---

### Task 1: form-pages kit (FormShell + FormField + FormErrorNote + SubmitButton + fieldClass)

**Files:**
- Create: `apps/web/src/components/form-pages/form-shell.tsx`
- Create: `apps/web/src/components/form-pages/form-field.tsx`
- Create: `apps/web/src/components/form-pages/form-error-note.tsx`
- Create: `apps/web/src/components/form-pages/submit-button.tsx`
- Create: `apps/web/src/components/form-pages/field-class.ts`
- Create: `apps/web/src/components/form-pages/index.ts`
- Test: `apps/web/src/__tests__/form-shell.test.tsx`

**Interfaces:**
- Consumes: nothing (kit root; pure Server Components, no `'use client'`, no new deps).
- Produces (consumed by Tasks 2-6 exactly as declared):

```ts
// form-shell.tsx
export interface FormShellProps {
  title: string;          // per-tool h1, unchanged copy
  helper?: string;        // per-tool helper, unchanged copy
  eyebrow?: string;       // default "Seovista / Instruments"
  children: React.ReactNode;
}
export function FormShell(props: FormShellProps): React.ReactElement;

// form-field.tsx
export interface FormFieldProps {
  id: string;             // control id — MUST equal the current field id
  label: string;          // unchanged per-tool label copy
  error?: string;         // single field-error string (join arrays at the page)
  children: React.ReactNode; // the input/select/textarea + any hint
}
export function FormField(props: FormFieldProps): React.ReactElement;

// form-error-note.tsx
export function FormErrorNote({ message }: { message: string }): React.ReactElement;

// submit-button.tsx
export interface SubmitButtonProps {
  pending: boolean;
  pendingLabel: string;   // unchanged per-tool pending copy
  children: React.ReactNode; // unchanged idle label
}
export function SubmitButton(props: SubmitButtonProps): React.ReactElement;

// field-class.ts
export const fieldClass: string;        // shared input/select/textarea classes
export const selectFieldClass: string;  // fieldClass + appearance-none
```

- [ ] **Step 1: Write the failing kit test** — `apps/web/src/__tests__/form-shell.test.tsx`:

```tsx
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormShell } from "../src/components/form-pages/form-shell";
import { FormField } from "../src/components/form-pages/form-field";
import { FormErrorNote } from "../src/components/form-pages/form-error-note";
import { SubmitButton } from "../src/components/form-pages/submit-button";
import { fieldClass, selectFieldClass } from "../src/components/form-pages/field-class";

const RETIRED_TOKEN_RE = /slate-|gray-|indigo-|blue-|red-|green-|amber-|emerald-|sky-|rose-/;

function countTag(markup: string, tag: string): number {
  const re = new RegExp(`<${tag}[\\s>]`, "g");
  return (markup.match(re) ?? []).length;
}

describe("FormShell", () => {
  it("renders exactly one main + one h1 with eyebrow, title and helper", () => {
    const markup = renderToStaticMarkup(
      <FormShell title="GEO Readiness Checker" helper="Helper copy.">
        <p>body</p>
      </FormShell>,
    );
    expect(countTag(markup, "main")).toBe(1);
    expect(markup).toMatch(/<main[^>]*id="main"/);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain(">GEO Readiness Checker</h1>");
    expect(markup).toContain("Seovista / Instruments");
    expect(markup).toContain("Helper copy.");
    expect(markup).toContain(">body</p>");
  });

  it("renders no retired color tokens", () => {
    const markup = renderToStaticMarkup(
      <FormShell title="T">
        <p>body</p>
      </FormShell>,
    );
    expect(markup).not.toMatch(RETIRED_TOKEN_RE);
  });

  it("omits the helper when not provided", () => {
    const markup = renderToStaticMarkup(<FormShell title="T">x</FormShell>);
    expect(markup).not.toContain("<p");
  });
});

describe("FormField", () => {
  it("binds label to the control id and renders the error with role=alert", () => {
    const markup = renderToStaticMarkup(
      <FormField id="domain" label="Domain URL" error="Required">
        <input id="domain" name="domain" />
      </FormField>,
    );
    expect(markup).toContain('<label for="domain"');
    expect(markup).toContain("Domain URL");
    expect(markup).toMatch(/role="alert"[^>]*>Required</);
    expect(markup).not.toMatch(RETIRED_TOKEN_RE);
  });

  it("renders no error element when error is undefined", () => {
    const markup = renderToStaticMarkup(
      <FormField id="d" label="D">
        <input id="d" />
      </FormField>,
    );
    expect(markup).not.toContain('role="alert"');
  });
});

describe("FormErrorNote", () => {
  it("renders a role=alert note with the message", () => {
    const markup = renderToStaticMarkup(<FormErrorNote message="Bir şeyler ters gitti" />);
    expect(markup).toMatch(/role="alert"/);
    expect(markup).toContain("Bir şeyler ters gitti");
    expect(markup).not.toMatch(RETIRED_TOKEN_RE);
  });
});

describe("SubmitButton", () => {
  it("renders the idle label and is enabled", () => {
    const markup = renderToStaticMarkup(
      <SubmitButton pending={false} pendingLabel="Working...">
        Start
      </SubmitButton>,
    );
    expect(markup).toContain(">Start</button>");
    expect(markup).not.toContain("disabled");
    expect(markup).not.toMatch(RETIRED_TOKEN_RE);
  });

  it("renders the pending label and disabled state", () => {
    const markup = renderToStaticMarkup(
      <SubmitButton pending={true} pendingLabel="Working...">
        Start
      </SubmitButton>,
    );
    expect(markup).toContain(">Working...</button>");
    expect(markup).toContain("disabled");
  });
});

describe("field classes", () => {
  it("expose token-only control classes", () => {
    expect(fieldClass).not.toMatch(RETIRED_TOKEN_RE);
    expect(selectFieldClass).not.toMatch(RETIRED_TOKEN_RE);
    expect(selectFieldClass).toContain("appearance-none");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/__tests__/form-shell.test.tsx` — expect FAIL (module not found).

- [ ] **Step 3: Implement the kit**

`form-shell.tsx`:

```tsx
import type { ReactNode } from "react";

export interface FormShellProps {
  /** Per-tool page title (unchanged copy). */
  title: string;
  /** Per-tool helper paragraph (unchanged copy). */
  helper?: string;
  /** Eyebrow micro-label; default per the Editorial Lab identity. */
  eyebrow?: string;
  /** Form body (form element with fields + submit). */
  children: ReactNode;
}

export function FormShell({ title, helper, eyebrow = "Seovista / Instruments", children }: FormShellProps): React.ReactElement {
  return (
    <main id="main" className="min-h-screen bg-paper text-ink">
      <div className="mx-auto w-full max-w-5xl px-6 py-12 md:py-16">
        <header className="flex flex-col gap-3">
          <span className="flex items-center gap-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">
            {eyebrow}
            <span className="h-px w-10 bg-hairline" aria-hidden="true" />
          </span>
          <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">{title}</h1>
          {helper ? (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-ink md:text-base">{helper}</p>
          ) : null}
        </header>
        {children}
      </div>
    </main>
  );
}
```

`form-field.tsx`:

```tsx
import type { ReactNode } from "react";

export interface FormFieldProps {
  /** Control id — must equal the input/select/textarea id. */
  id: string;
  /** Visible label copy (unchanged per tool). */
  label: string;
  /** Single field-error string ("role=alert"); omitted when undefined. */
  error?: string;
  /** The control (and optional hint text). */
  children: ReactNode;
}

export function FormField({ id, label, error, children }: FormFieldProps): React.ReactElement {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      <div className="mt-1">{children}</div>
      {error ? <p role="alert" className="mt-2 text-sm text-ember">{error}</p> : null}
    </div>
  );
}
```

`form-error-note.tsx`:

```tsx
export function FormErrorNote({ message }: { message: string }): React.ReactElement {
  return (
    <div role="alert" className="rounded-lg border border-ember/30 bg-mineral p-3 text-sm text-ember">
      {message}
    </div>
  );
}
```

`submit-button.tsx`:

```tsx
import type { ReactNode } from "react";

export interface SubmitButtonProps {
  pending: boolean;
  /** Pending label copy (unchanged per tool). */
  pendingLabel: string;
  /** Idle label copy (unchanged per tool). */
  children: ReactNode;
}

export function SubmitButton({ pending, pendingLabel, children }: SubmitButtonProps): React.ReactElement {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-mineral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spectral focus-visible:ring-2 focus-visible:ring-spectral focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
```

`field-class.ts`:

```ts
/** Shared control classes for forms: inputs, selects, textareas. */
export const fieldClass =
  "w-full rounded-lg border border-hairline bg-paper px-4 py-3 text-ink placeholder:text-muted-ink/60 focus:border-spectral focus:outline-none focus:ring-2 focus:ring-spectral/20 transition-colors";

/** Select variant: hides the native arrow so the page can overlay a chevron. */
export const selectFieldClass = `appearance-none ${fieldClass}`;
```

`index.ts`:

```ts
export { FormShell } from "./form-shell";
export type { FormShellProps } from "./form-shell";
export { FormField } from "./form-field";
export type { FormFieldProps } from "./form-field";
export { FormErrorNote } from "./form-error-note";
export { SubmitButton } from "./submit-button";
export type { SubmitButtonProps } from "./submit-button";
export { fieldClass, selectFieldClass } from "./field-class";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/__tests__/form-shell.test.tsx` — expect PASS.

- [ ] **Step 5: Gates**

Run: `pnpm vitest run` (full — still green), `pnpm exec tsc --noEmit` (clean), `pnpm next build` (clean).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/form-pages apps/web/src/__tests__/form-shell.test.tsx
git commit -m "feat(form-pages): add FormShell + field primitives kit (unwired)"
```

---

### Task 2: Migrate geo-readiness form

**Files:**
- Modify: `apps/web/app/tools/geo-readiness-checker/page.tsx`
- Test: `apps/web/src/__tests__/form-pages.test.tsx` (create; establishes the client-page test pattern for Tasks 3-5)

**Interfaces:**
- Consumes: Task 1 kit — `FormShell`, `FormField`, `FormErrorNote`, `SubmitButton`, `selectFieldClass` from `../src/components/form-pages` (relative from `app/tools/geo-readiness-checker/`: `../../../src/components/form-pages`).
- Produces: the shared page-test pattern used by Tasks 3-5 (mock the tool's `actions` module with `vi.mock`, render with `createRoot` + `act`, assert markup).

- [ ] **Step 1: Write the failing page test** — `apps/web/src/__tests__/form-pages.test.tsx` (create with the geo suite; Tasks 3-5 append describe blocks):

```tsx
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/tools/geo-readiness-checker/actions", () => ({
  startGeoAuditAction: vi.fn().mockResolvedValue({ status: "idle" }),
}));

import GeoReadinessCheckerPage from "../app/tools/geo-readiness-checker/page";

const RETIRED_TOKEN_RE = /slate-|gray-|indigo-|blue-|red-|green-|amber-|emerald-|sky-|rose-/;

function countTag(markup: string, tag: string): number {
  const re = new RegExp(`<${tag}[\\s>]`, "g");
  return (markup.match(re) ?? []).length;
}

describe("Form pages", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  describe("geo-readiness-checker", () => {
    it("renders one main + one h1 in the FormShell frame with all fields", async () => {
      let page!: React.ReactElement;
      await act(async () => {
        page = <GeoReadinessCheckerPage />;
      });
      await act(async () => {
        root.render(page);
      });
      const markup = container.innerHTML;
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">GEO Readiness Checker</h1>");
      expect(markup).toContain("Seovista / Instruments");
      expect(markup).toContain('id="domain"');
      expect(markup).toContain('id="brandName"');
      expect(markup).toContain('id="primaryMarket"');
      expect(markup).toContain(">Start Free Audit</button>");
      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });
  });
});
```

Note: the `vi.mock` path is relative to the test file. The page imports `startGeoAuditAction` from `../../../src/lib/geo-checker/actions` — mock that module under its real specifier relative to the test file (`vi.mock("../../src/lib/geo-checker/actions", ...)` also works; use whichever resolves — verify with the run). The mock factory must NOT import the real actions module.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/__tests__/form-pages.test.tsx` — expect FAIL (markup still contains `bg-gray-50`/retired tokens; `RETIRED_TOKEN_RE` mismatch).

- [ ] **Step 3: Rewrite the page** — `apps/web/app/tools/geo-readiness-checker/page.tsx` full replacement:

```tsx
"use client";

import { useActionState } from "react";
import { startGeoAuditAction, type ActionState } from "../../../src/lib/geo-checker/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  selectFieldClass,
} from "../../../src/components/form-pages";

const initialState: ActionState = {
  status: "idle",
};

export default function GeoReadinessCheckerPage() {
  const [state, formAction, isPending] = useActionState(startGeoAuditAction, initialState);

  return (
    <FormShell
      title="GEO Readiness Checker"
      helper="Find out how well your brand performs across AI Overviews and major Search Engines."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && (
          <FormErrorNote message={state.errors.form.join(", ")} />
        )}

        <FormField id="domain" label="Domain URL" error={state.errors?.domain?.join(", ")}>
          <input
            id="domain"
            name="domain"
            type="url"
            required
            placeholder="https://example.com"
            className={selectFieldClass.replace("appearance-none ", "")}
          />
        </FormField>

        <FormField id="brandName" label="Brand Name" error={state.errors?.brandName?.join(", ")}>
          <input
            id="brandName"
            name="brandName"
            type="text"
            required
            placeholder="Acme Corp"
            className={selectFieldClass.replace("appearance-none ", "")}
          />
        </FormField>

        <FormField id="primaryMarket" label="Primary Market" error={state.errors?.primaryMarket?.join(", ")}>
          <div className="relative">
            <select
              id="primaryMarket"
              name="primaryMarket"
              required
              defaultValue=""
              className={selectFieldClass}
            >
              <option value="" disabled>Select your market</option>
              <option value="USA">United States</option>
              <option value="UK">United Kingdom</option>
              <option value="TR">Turkey</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="GLOBAL">Global</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-ink">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </FormField>

        <div className="pt-2">
          <SubmitButton pending={isPending} pendingLabel="Starting Audit...">
            Start Free Audit
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
```

Note: `selectFieldClass.replace("appearance-none ", "")` is ugly — instead import and use `fieldClass` for inputs and `selectFieldClass` for the select. Use `fieldClass` directly for the two inputs; keep the import list `FormShell, FormField, FormErrorNote, SubmitButton, fieldClass, selectFieldClass`, and apply `className={fieldClass}` on the inputs. Field `id`/`name`/`type`/`required`/`placeholder` and all copy stay byte-identical to the current page.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/__tests__/form-pages.test.tsx src/__tests__/form-shell.test.tsx` — expect PASS.

- [ ] **Step 5: Gates**

Run: `pnpm vitest run` (full — green), `pnpm exec tsc --noEmit` (clean), `pnpm next build` (clean; route `/tools/geo-readiness-checker/` still emitted).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/tools/geo-readiness-checker/page.tsx" apps/web/src/__tests__/form-pages.test.tsx
git commit -m "feat(form-pages): migrate geo-readiness form to editorial lab kit"
```

---

### Task 3: Migrate schema-checker + ai-crawler-checker forms

**Files:**
- Modify: `apps/web/app/tools/schema-checker/page.tsx`
- Modify: `apps/web/app/tools/ai-crawler-checker/page.tsx`
- Test: `apps/web/src/__tests__/form-pages.test.tsx` (append two describe blocks)

**Interfaces:**
- Consumes: Task 1 kit (`FormShell`, `FormField`, `FormErrorNote`, `SubmitButton`, `fieldClass`), Task 2 test pattern.

- [ ] **Step 1: Write the failing tests** — append to `form-pages.test.tsx`:

```tsx
vi.mock("../app/tools/schema-checker/actions", () => ({
  startSchemaCheckAction: vi.fn().mockResolvedValue({ status: "idle" }),
}));
vi.mock("../app/tools/ai-crawler-checker/actions", () => ({
  startAiCrawlerCheckAction: vi.fn().mockResolvedValue({ status: "idle" }),
}));
```

(Verify the real export names in each `src/lib/<tool>/actions.ts` — mock those exact names; the mock factory must not import the real module.) Then inside the outer `describe("Form pages")`, after the geo block:

```tsx
  describe("schema-checker", () => {
    it("renders one main + one h1 with the url field, no retired tokens", async () => {
      await act(async () => {
        root.render(<SchemaCheckerPage />);
      });
      const markup = container.innerHTML;
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain("Schema &amp; Yapısal Veri Denetleyicisi");
      expect(markup).toContain("Seovista / Instruments");
      expect(markup).toContain('id="url"');
      expect(markup).toContain(">Schema Denetimini Başlat</button>");
      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });
  });

  describe("ai-crawler-checker", () => {
    it("renders one main + one h1 with the url field, no retired tokens", async () => {
      await act(async () => {
        root.render(<AiCrawlerCheckerPage />);
      });
      const markup = container.innerHTML;
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">AI Crawler Checker</h1>");
      expect(markup).toContain("Seovista / Instruments");
      expect(markup).toContain('id="url"');
      expect(markup).toContain(">AI Crawler Denetimini Başlat</button>");
      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });
  });
```

With imports at the top: `import SchemaCheckerPage from "../app/tools/schema-checker/page";` and `import AiCrawlerCheckerPage from "../app/tools/ai-crawler-checker/page";`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/__tests__/form-pages.test.tsx` — expect FAIL (retired tokens present).

- [ ] **Step 3: Rewrite both pages** — same shape; `schema-checker/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { startSchemaCheckAction, type SchemaCheckActionState } from "../../../src/lib/schema-checker/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
} from "../../../src/components/form-pages";

const initialState: SchemaCheckActionState = { status: "idle" };

export default function SchemaCheckerPage() {
  const [state, formAction, isPending] = useActionState(startSchemaCheckAction, initialState);

  return (
    <FormShell
      title="Schema & Yapısal Veri Denetleyicisi"
      helper="Web sitenizdeki JSON-LD ve Schema.org yapılarını, arama motorları ve AI botları için test edin."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && <FormErrorNote message={state.errors.form.join(", ")} />}
        <FormField id="url" label="Sayfa URL'si" error={state.errors?.url?.join(", ")}>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://example.com"
            className={fieldClass}
          />
        </FormField>
        <div className="pt-2">
          <SubmitButton pending={isPending} pendingLabel="Denetim Başlatılıyor...">
            Schema Denetimini Başlat
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
```

`ai-crawler-checker/page.tsx` is identical except: action import/name (`startAiCrawlerCheckAction`, `AiCrawlerCheckActionState`), h1 `AI Crawler Checker`, helper `robots.txt dosyanızın GPTBot, ClaudeBot, PerplexityBot gibi AI botlarına ve geleneksel arama botlarına hangi erişimi verdiğini test edin.`, label `Sayfa URL'si`, submit labels `Denetim Başlatılıyor...` / `AI Crawler Denetimini Başlat`. Copy verbatim from the current files (read each before rewriting; keep ids/names/types/required exactly).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/__tests__/form-pages.test.tsx` — PASS.

- [ ] **Step 5: Gates**

`pnpm vitest run` (full), `pnpm exec tsc --noEmit`, `pnpm next build`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/tools/schema-checker/page.tsx" "apps/web/app/tools/ai-crawler-checker/page.tsx" apps/web/src/__tests__/form-pages.test.tsx
git commit -m "feat(form-pages): migrate schema-checker + ai-crawler-checker forms"
```

---

### Task 4: Migrate keyword-rank + render-parity-diff forms

**Files:**
- Modify: `apps/web/app/tools/keyword-rank-checker/page.tsx`
- Modify: `apps/web/app/tools/render-parity-diff/page.tsx`
- Test: `apps/web/src/__tests__/form-pages.test.tsx` (append two describe blocks)

**Interfaces:**
- Consumes: Task 1 kit; Task 2 test pattern. `SERP_LOCALES` import from `@seovista/seo-core` stays.

- [ ] **Step 1: Write the failing tests** — append mocks:

```tsx
vi.mock("../app/tools/keyword-rank-checker/actions", () => ({
  startKeywordRankCheckAction: vi.fn().mockResolvedValue({ status: "idle" }),
}));
vi.mock("../app/tools/render-parity-diff/actions", () => ({
  startRenderParityDiffAction: vi.fn().mockResolvedValue({ status: "idle" }),
}));
```

(Verify the real export names in each `src/lib/<tool>/actions.ts`.) Append describe blocks:

```tsx
  describe("keyword-rank-checker", () => {
    it("renders one main + one h1 with domain/keyword/locale fields", async () => {
      await act(async () => {
        root.render(<KeywordRankCheckerPage />);
      });
      const markup = container.innerHTML;
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain("Anahtar Kelime Sıralama Kontrolü");
      expect(markup).toContain('id="domain"');
      expect(markup).toContain('id="keyword"');
      expect(markup).toContain('id="locale"');
      expect(markup).toContain(">Sıralamayı Kontrol Et</button>");
      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });
  });

  describe("render-parity-diff", () => {
    it("renders one main + one h1 with the url field and the bot-typo fix", async () => {
      await act(async () => {
        root.render(<RenderParityDiffPage />);
      });
      const markup = container.innerHTML;
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain("Render Parity Karşılaştırması");
      expect(markup).toContain('id="url"');
      expect(markup).toContain(">Karşılaştırmayı Başlat</button>");
      expect(markup).toContain("bir kez bir bot User-Agent'ı ile");
      expect(markup).not.toContain("bir kez bir tarayıcı\nUser-Agent'ı ile");
      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });
  });
```

With imports: `import KeywordRankCheckerPage from "../app/tools/keyword-rank-checker/page";` and `import RenderParityDiffPage from "../app/tools/render-parity-diff/page";`.

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run src/__tests__/form-pages.test.tsx` (FAIL: retired tokens; the render-parity helper still contains the duplicated "tarayıcı").

- [ ] **Step 3: Rewrite both pages** — `keyword-rank-checker/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { SERP_LOCALES } from "@seovista/seo-core";
import { startKeywordRankCheckAction, type KeywordRankActionState } from "../../../src/lib/keyword-rank-checker/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
  selectFieldClass,
} from "../../../src/components/form-pages";

const initialState: KeywordRankActionState = { status: "idle" };

export default function KeywordRankCheckerPage() {
  const [state, formAction, isPending] = useActionState(startKeywordRankCheckAction, initialState);

  return (
    <FormShell
      title="Anahtar Kelime Sıralama Kontrolü"
      helper="SearXNG üzerinden ilk 10 sonuçta alan adınızın konumunu kontrol edin. Sonuç, kontrol anına ait dürüst bir anlık görüntüdür."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && <FormErrorNote message={state.errors.form.join(", ")} />}
        <FormField id="domain" label="Alan Adı" error={state.errors?.domain?.join(", ")}>
          <input
            id="domain"
            name="domain"
            type="text"
            required
            placeholder="example.com"
            className={fieldClass}
          />
        </FormField>
        <FormField id="keyword" label="Anahtar Kelime" error={state.errors?.keyword?.join(", ")}>
          <input
            id="keyword"
            name="keyword"
            type="text"
            required
            placeholder="örn. seo denetimi"
            className={fieldClass}
          />
        </FormField>
        <FormField id="locale" label="Arama Bölgesi" error={state.errors?.locale?.join(", ")}>
          <div className="relative">
            <select
              id="locale"
              name="locale"
              required
              defaultValue="tr-TR"
              className={selectFieldClass}
            >
              {Object.entries(SERP_LOCALES).map(([value, config]) => (
                <option key={value} value={value}>
                  {config.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-ink">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </FormField>
        <div className="pt-2">
          <SubmitButton pending={isPending} pendingLabel="Kontrol Ediliyor...">
            Sıralamayı Kontrol Et
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
```

`render-parity-diff/page.tsx`: same shape with action `startRenderParityDiffAction`/`RenderParityDiffActionState`, h1 `Render Parity Karşılaştırması`, helper `Sayfanızı iki kez getirir — bir kez bir tarayıcı User-Agent'ı, bir kez bir bot User-Agent'ı ile — ve iki gösterim arasındaki farkları raporlar. Tarayıcıların gördüğü içerik insanların gördüğü sürümden saparsa bunu işaret eder.` (the factual bot fix), label `Sayfa URL'si`, submit labels `Karşılaştırılıyor...` / `Karşılaştırmayı Başlat`, placeholder `https://example.com/page`. Copy verbatim from the current file for everything except the bot fix.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/__tests__/form-pages.test.tsx` — PASS.

- [ ] **Step 5: Gates**

`pnpm vitest run` (full), `pnpm exec tsc --noEmit`, `pnpm next build`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/tools/keyword-rank-checker/page.tsx" "apps/web/app/tools/render-parity-diff/page.tsx" apps/web/src/__tests__/form-pages.test.tsx
git commit -m "feat(form-pages): migrate keyword-rank + render-parity forms"
```

---

### Task 5: Migrate attribution-trace + schema-truth-check forms

**Files:**
- Modify: `apps/web/app/tools/attribution-trace/page.tsx`
- Modify: `apps/web/app/tools/schema-truth-check/page.tsx`
- Test: `apps/web/src/__tests__/form-pages.test.tsx` (append two describe blocks)

**Interfaces:**
- Consumes: Task 1 kit; Task 2 test pattern.

- [ ] **Step 1: Write the failing tests** — append mocks:

```tsx
vi.mock("../app/tools/attribution-trace/actions", () => ({
  startAttributionTraceAction: vi.fn().mockResolvedValue({ status: "idle" }),
}));
vi.mock("../app/tools/schema-truth-check/actions", () => ({
  startSchemaTruthCheckAction: vi.fn().mockResolvedValue({ status: "idle" }),
}));
```

(Verify the real export names in each `src/lib/<tool>/actions.ts`.) Append describe blocks:

```tsx
  describe("attribution-trace", () => {
    it("renders one main + one h1 with domain/keyword/answer fields", async () => {
      await act(async () => {
        root.render(<AttributionTracePage />);
      });
      const markup = container.innerHTML;
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">Attribution Trace</h1>");
      expect(markup).toContain('id="domain"');
      expect(markup).toContain('id="keyword"');
      expect(markup).toContain('id="answer"');
      expect(markup).toContain(">Attribution Trace Başlat</button>");
      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });
  });

  describe("schema-truth-check", () => {
    it("renders one main + one h1 with the url field", async () => {
      await act(async () => {
        root.render(<SchemaTruthCheckPage />);
      });
      const markup = container.innerHTML;
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain("Schema Doğruluk Denetimi");
      expect(markup).toContain('id="url"');
      expect(markup).toContain(">Denetimi Başlat</button>");
      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });
  });
```

With imports: `import AttributionTracePage from "../app/tools/attribution-trace/page";` and `import SchemaTruthCheckPage from "../app/tools/schema-truth-check/page";`.

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run src/__tests__/form-pages.test.tsx` (FAIL: retired tokens).

- [ ] **Step 3: Rewrite both pages** — `attribution-trace/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { startAttributionTraceAction, type AttributionTraceActionState } from "../../../src/lib/attribution-trace/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
} from "../../../src/components/form-pages";

const initialState: AttributionTraceActionState = { status: "idle" };

export default function AttributionTracePage() {
  const [state, formAction, isPending] = useActionState(startAttributionTraceAction, initialState);

  return (
    <FormShell
      title="Attribution Trace"
      helper="Yapıştırdığınız AI yanıtındaki her iddiayı, sitenizin kendi içeriği ve anahtar kelimenin SERP sonuçlarıyla karşılaştırır. Hangi iddiayı kendi içeriğinizden, hangisini rakip kaynaklardan, hangisini hiçbir yerden destekleyemediğimizi dürüstçe raporlar."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && <FormErrorNote message={state.errors.form.join(", ")} />}
        <FormField id="domain" label="Sitenizin alan adı" error={state.errors?.domain?.join(", ")}>
          <input
            id="domain"
            name="domain"
            type="text"
            required
            placeholder="example.com"
            className={fieldClass}
          />
        </FormField>
        <FormField id="keyword" label="Anahtar kelime (isteğe bağlı)" error={state.errors?.keyword?.join(", ")}>
          <input
            id="keyword"
            name="keyword"
            type="text"
            placeholder="örn. istanbul seo danışmanlığı"
            className={fieldClass}
          />
          <p className="mt-1 text-xs text-muted-ink">
            Boş bırakılırsa dış kaynak araması atlanır; yalnızca sitenizin kendi içeriği ile
            karşılaştırılır.
          </p>
        </FormField>
        <FormField id="answer" label="AI yanıtı" error={state.errors?.answer?.join(", ")}>
          <textarea
            id="answer"
            name="answer"
            rows={8}
            required
            minLength={40}
            maxLength={8000}
            placeholder="AI motorunuzun (örn. ChatGPT, Perplexity) size verdiği yanıtı buraya yapıştırın..."
            className={fieldClass}
          />
        </FormField>
        <div className="pt-2">
          <SubmitButton pending={isPending} pendingLabel="İzleniyor...">
            Attribution Trace Başlat
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
```

Note: the label text `Anahtar kelime <span className="text-gray-400">(isteğe bağlı)</span>` becomes a plain string `Anahtar kelime (isteğe bağlı)` — the muted span renders as text inside the label (tokens make the parent `text-ink`; the parenthetical reads the same). Alternative that preserves the muted styling exactly: pass `label="Anahtar kelime"` and put `<span className="text-muted-ink">(isteğe bağlı)</span>` inside the control slot's hint line. Prefer the latter: `label="Anahtar kelime"` + the existing hint `<p>` below the input extended: `<p className="mt-1 text-xs text-muted-ink">(isteğe bağlı) — Boş bırakılırsa dış kaynak araması atlanır; yalnızca sitenizin kendi içeriği ile karşılaştırılır.</p>`. This preserves the visual intent (muted parenthetical) without bending FormField. Implementer picks one and documents; both keep the copy intact.

`schema-truth-check/page.tsx`: same shape with action `startSchemaTruthCheckAction`/`SchemaTruthActionState`, h1 `Schema Doğruluk Denetimi`, helper `Yapılandırılmış veri (JSON-LD) içindeki her iddianın sayfanın görünür içeriğinde karşılığını kontrol eder. "Şemada söylediğin şeyleri okuyucu sayfada bulabiliyor mu?" — cevabını dürüstçe verir.`, label `Sayfa URL'si`, placeholder `https://example.com/page`, submit labels `Denetleniyor...` / `Denetimi Başlat`. Copy verbatim from the current file.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/__tests__/form-pages.test.tsx` — PASS.

- [ ] **Step 5: Gates**

`pnpm vitest run` (full), `pnpm exec tsc --noEmit`, `pnpm next build`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/tools/attribution-trace/page.tsx" "apps/web/app/tools/schema-truth-check/page.tsx" apps/web/src/__tests__/form-pages.test.tsx
git commit -m "feat(form-pages): migrate attribution-trace + schema-truth forms"
```

---

### Task 6: Migrate serp-preview page + restyle SerpPreviewTool

**Files:**
- Modify: `apps/web/app/tools/serp-preview/page.tsx`
- Modify: `apps/web/src/components/serp-preview/serp-preview-tool.tsx` (Client, 224 lines — token swap only, copy unchanged TR)
- Test: `apps/web/src/__tests__/form-pages.test.tsx` (append serp-preview describe block)

**Interfaces:**
- Consumes: Task 1 `FormShell`. `SerpPreviewTool` props unchanged (`initialTitle`, `initialDescription`, `initialUrl`).

- [ ] **Step 1: Write the failing test** — append:

```tsx
  describe("serp-preview", () => {
    it("renders one main + one h1 in the FormShell frame", async () => {
      const { default: SerpPreviewPage } = await import("../app/tools/serp-preview/page");
      await act(async () => {
        root.render(<SerpPreviewPage searchParams={Promise.resolve({})} />);
      });
      const markup = container.innerHTML;
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">SERP Preview</h1>");
      expect(markup).toContain("Seovista / Instruments");
      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });
  });
```

Note: `SerpPreviewPage` is an async Server Component taking `searchParams` — it may not render under `createRoot` (RSC). If `createRoot` fails on the async component, render it via the result-state pattern instead: `const el = await SerpPreviewPage({ searchParams: Promise.resolve({}) }); const markup = renderToStaticMarkup(el);` (import `renderToStaticMarkup` from `react-dom/server`). Use whichever works; the assertion contract (one main, one h1, eyebrow, no retired tokens) is identical.

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run src/__tests__/form-pages.test.tsx` (FAIL: retired tokens from the page + tool component).

- [ ] **Step 3: Rewrite the page** — `serp-preview/page.tsx`:

```tsx
import type { Metadata } from "next";
import { FormShell } from "../../../src/components/form-pages";
import { SerpPreviewTool } from "../../../src/components/serp-preview/serp-preview-tool";

export const metadata: Metadata = {
  title: "SERP Preview — Google Sonuç Önizlemesi | SeoVista",
  description: "Sayfa başlığınızın ve meta açıklamanızın Google arama sonuçlarında nasıl görüneceğini tahmini pixel ölçümüyle önizleyin.",
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function SerpPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <FormShell
      title="SERP Preview"
      helper="Başlık ve meta açıklamanızın Google'da nasıl görüneceğini tahmini pixel ölçümüyle test edin."
    >
      <SerpPreviewTool
        initialTitle={firstValue(params.title)}
        initialDescription={firstValue(params.desc)}
        initialUrl={firstValue(params.url)}
      />
    </FormShell>
  );
}
```

- [ ] **Step 4: Restyle `SerpPreviewTool`** — apply the spec token mapping to every class in the 224-line file (copy unchanged):

| Old | New |
|---|---|
| `border-green-300 text-green-800` | `border-signal/40 text-signal` |
| `border-amber-300 text-amber-800` | `border-ember/40 text-ember` |
| `text-gray-600` | `text-muted-ink` |
| `bg-gray-200` (track) | `bg-mineral` |
| `bg-red-500` (truncated fill) | `bg-ember` |
| `bg-amber-500` (ratio > 90 fill) | `bg-ember` |
| `bg-green-500` (ok fill) | `bg-signal` |
| `bg-gray-500` (marker) | `bg-muted-ink` |
| `text-red-700` | `text-ember` |
| `border-gray-200 bg-white shadow-sm` (section card) | `border-hairline bg-paper` (drop shadow) |
| `text-gray-700` | `text-muted-ink` |
| `border-gray-300 ... text-gray-900 shadow-sm` (inputs) | `border-hairline ... text-ink` (drop shadow; add the kit focus ring: `focus:border-spectral focus:outline-none focus:ring-2 focus:ring-spectral/20`) |
| `placeholder-gray-400` | `placeholder:text-muted-ink/60` |
| `focus:ring-blue-500 focus:border-blue-500` | `focus:border-spectral focus:ring-spectral/20` |
| any remaining `gray-*`, `blue-*`, `red-*`, `green-*`, `amber-*`, `shadow-*` | token equivalents per the spec swap table |

After the swap, verify with a scan: `Select-String -Path src/components/serp-preview/serp-preview-tool.tsx -Pattern "slate-|gray-|indigo-|red-|green-|blue-|amber-|emerald-|sky-|rose-|shadow"` → no hits.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run src/__tests__/form-pages.test.tsx` — PASS.

- [ ] **Step 6: Gates**

`pnpm vitest run` (full), `pnpm exec tsc --noEmit`, `pnpm next build`.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/tools/serp-preview/page.tsx" apps/web/src/components/serp-preview/serp-preview-tool.tsx apps/web/src/__tests__/form-pages.test.tsx
git commit -m "feat(form-pages): migrate serp-preview page + restyle SerpPreviewTool"
```

---

### Task 7: Restyle GatedReportForm

**Files:**
- Modify: `apps/web/src/components/geo-checker/gated-report-form.tsx` (Client; renders on the geo result page completed/degraded states)
- Test: verify the geo result-state suite still passes (it renders this component via the geo page)

**Interfaces:**
- Consumes: nothing new (no kit import needed — this is a standalone Client form; token swap only).
- Produces: no API change. Props (`leadId`, `jobId`), copy (EN), ids (`email`, `consent`), and the `role=status`/`role=alert` semantics unchanged.

- [ ] **Step 1: Apply the token mapping** — replace every class in `gated-report-form.tsx` per the spec:

| Old | New |
|---|---|
| `bg-indigo-50 border-indigo-100 rounded-xl p-8 max-w-2xl mx-auto` | `bg-mineral border-hairline rounded-xl p-8 max-w-2xl mx-auto` |
| `text-indigo-900` (heading/labels) | `text-ink` |
| `text-indigo-700` (body) | `text-muted-ink` |
| `border-indigo-200` (input) | `border-hairline` + kit focus ring (`focus:border-spectral focus:outline-none focus:ring-2 focus:ring-spectral/20`) |
| `border-gray-300` (checkbox) | `border-hairline` |
| `text-indigo-600` (checkbox) | `text-spectral` |
| `focus:ring-indigo-500` | `focus:ring-spectral` |
| `text-indigo-800` (consent) | `text-ink` |
| `text-red-600 bg-red-50` (error) | `text-ember bg-mineral` |
| `bg-indigo-600 hover:bg-indigo-700 text-white` (submit) | `bg-ink text-paper hover:bg-mineral` |
| spinner `border-white border-t-transparent` | `border-paper/40 border-t-paper` |
| any remaining `indigo-*`/`gray-*`/`red-*`/`blue-*`/`shadow-*` | token equivalents per the spec |

Keep the heading `Unlock Full Detailed Report`, all labels/placeholders/consent/button copy, `name="email"`/`name="consent"`/`name="leadId"`/`name="jobId"`, and the `role=status` wrapper exactly as today. After the swap, scan: `Select-String -Path src/components/geo-checker/gated-report-form.tsx -Pattern "indigo-|gray-|red-|blue-|amber-|emerald-|sky-|rose-|shadow"` → no hits.

- [ ] **Step 2: Verify**

Run: `pnpm vitest run src/__tests__/geo-result-states.test.ts` — PASS (the geo page renders GatedReportForm in completed/degraded states; no retired-token assertions exist there, so this is a regression check).

- [ ] **Step 3: Gates**

`pnpm vitest run` (full), `pnpm exec tsc --noEmit`, `pnpm next build`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/geo-checker/gated-report-form.tsx
git commit -m "fix(form-pages): restyle GatedReportForm to design tokens"
```

---

### Task 8: Tools index copy + site metadata + e2e pin

**Files:**
- Modify: `apps/web/app/tools/page.tsx` (includes the pre-existing unstaged status edit — it becomes part of this commit by design)
- Modify: `apps/web/src/content/site.ts` (`toolsPage` entry)
- Modify: `apps/web/tests/e2e/seo.spec.ts` (toolsPage title/description pins at ~L17-18)
- Test: no new unit suite (the index is static markup; verify via the token scan + build)

**Interfaces:**
- Consumes: nothing. Produces: the committed index state — all 8 instruments `status: "Preview"` with hrefs, hero capabilities `Eight previews available` / `No briefs in planning`, live rows labelled `Open tool →`.

- [ ] **Step 1: Update the instruments array + hero copy** — `apps/web/app/tools/page.tsx`:

In the `instruments` array, ensure the eight entries are exactly:

```tsx
const instruments: Instrument[] = [
  { id: "01", name: "GEO Readiness Checker", status: "Preview", summary: "Assesses how a page presents itself to generative answer systems. Brief is published; the audit engine is not connected.", href: "/tools/geo-readiness-checker/" },
  { id: "02", name: "Schema Checker", status: "Preview", summary: "Fetches a page, parses every JSON-LD block, and reports syntax errors, prohibited claims, and a structural score.", href: "/tools/schema-checker/" },
  { id: "03", name: "AI Crawler Checker", status: "Preview", summary: "Fetches a site's robots.txt and reports, per bot, whether AI search, AI training, and traditional search crawlers are allowed, partially restricted, or blocked.", href: "/tools/ai-crawler-checker/" },
  { id: "04", name: "Attribution Trace", status: "Preview", summary: "Maps a synthesized answer back to the sources a generative system likely drew from, and flags misattribution.", href: "/tools/attribution-trace/" },
  { id: "05", name: "Render Parity Diff", status: "Preview", summary: "Compares what a crawler sees against what a user sees, so gaps in server-rendered content surface before they hurt retrieval.", href: "/tools/render-parity-diff/" },
  { id: "06", name: "SERP Preview", status: "Preview", summary: "Previews how your title and meta description appear in Google results, with pixel-level truncation warnings.", href: "/tools/serp-preview/" },
  { id: "07", name: "Keyword Rank Checker", status: "Preview", summary: "Reports the observed top-10 position for a domain and keyword via SearXNG; a deterministic mock stands in when SearXNG is not configured.", href: "/tools/keyword-rank-checker/" },
  { id: "08", name: "Schema Truth Check", status: "Preview", summary: "Verifies that structured markup matches the visible page, with no claims in JSON-LD that a reader cannot find on the page itself.", href: "/tools/schema-truth-check/" },
];
```

Note the SERP Preview summary change: `Google sonuç görünümünü pixel bazlı kısaltma uyarılarıyla önizler.` → `Previews how your title and meta description appear in Google results, with pixel-level truncation warnings.`

In `DisciplineHero`, set `capabilities={["Eight previews available", "No briefs in planning", "No fabricated scores"]}` (the working tree already has this edit — keep it).

In `InstrumentRow`, change the live-tool trailing label:

```tsx
<span className="hidden self-baseline font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink md:inline">{instrument.href ? "Open tool →" : "In planning"}</span>
```

- [ ] **Step 2: Update site metadata** — `apps/web/src/content/site.ts`, the `toolsPage` entry (both the short description and the ogDescription):

```
"A growing library of free tools for GEO and SEO readiness. Eight instruments are live as previews: GEO Readiness Checker, Schema Checker, AI Crawler Checker, SERP Preview, Keyword Rank Checker, Attribution Trace, Render Parity Diff, and Schema Truth Check."
```

and

```
"SeoVista builds free tools that audit generative and search visibility. Eight instruments are live as previews — GEO Readiness Checker, Schema Checker, AI Crawler Checker, SERP Preview, Keyword Rank Checker, Attribution Trace, Render Parity Diff, and Schema Truth Check — and every release ships with a published brief."
```

(Trim/rewrite freely while keeping it true: all 8 live, no "planned" claims, no fabricated numbers. The exact wording is the implementer's choice within those constraints; update the e2e pin to match verbatim.)

- [ ] **Step 3: Update the e2e pin** — `apps/web/tests/e2e/seo.spec.ts` L17-18: set `description` to the exact new `toolsPage` description from `site.ts`. Also scan the spec for any other `/tools/` copy pins ("Five previews", "Read brief", "Three briefs") and update them.

- [ ] **Step 4: Verify**

Run: `Select-String -Path apps/web/app/tools/page.tsx -Pattern "Planned|Five previews|Three briefs|Read brief|sonuç görünümünü"` → no hits. Then `pnpm vitest run` (full; note `seo.spec.ts` is Playwright — NOT part of vitest, so vitest stays green), `pnpm exec tsc --noEmit`, `pnpm next build`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/tools/page.tsx" apps/web/src/content/site.ts apps/web/tests/e2e/seo.spec.ts
git commit -m "fix(tools): refresh index copy + metadata (8 live instruments)"
```

---

### Task 9: Final gates + close-out

**Files:** none (verification only; commit only if a task left a stray edit).

- [ ] **Step 1: Web gates**

From `C:\bc-proje\Seovista\apps\web`:
- `pnpm vitest run` — full suite green (expect the previous 445 + the new form-shell/form-pages suites).
- `pnpm exec tsc --noEmit` — clean.
- `pnpm next build` — clean; all 8 form routes (`/tools/<slug>/`) AND all 7 result routes (`/tools/<slug>/result/<uuid>`) emitted.

- [ ] **Step 2: Token sweep**

Scan every touched file for retired tokens + shadows:
`Get-ChildItem -Recurse -Path apps/web/app/tools,apps/web/src/components/form-pages,apps/web/src/components/serp-preview,apps/web/src/components/geo-checker/gated-report-form.tsx -Include *.tsx,*.ts | Select-String -Pattern "slate-|gray-|indigo-|red-|green-|blue-|amber-|emerald-|sky-|rose-|shadow-"` → confirm only expected hits (e.g., `bg-mineral` has no match; `placeholder:text-muted-ink/60` fine). Note: `apps/web/app/tools/page.tsx` and the migrated form pages must be clean; `shadow-` must have zero hits in the touched set.

- [ ] **Step 3: Stray-edit check + commit**

`git status --short` — if any task left an unintended tracked-file edit, fix or commit it as a tiny `chore(result-pages): final gates follow-up`; else no final commit. NEVER stage `apps/web/tsconfig.json` or `.superpowers/sdd/*`. Confirm `git log --oneline -8` shows the 9 plan commits in order.

- [ ] **Step 4: Ledger + report**

Append the per-task outcomes (commit hashes, review verdicts, gates) to `.superpowers/sdd/progress.md` (working tree only, not committed).

---

## Self-review notes

- **Spec coverage:** Goal→Tasks 2-6 (8 pages); tokens→Tasks 1-7; kit→Task 1; component inventory (SerpPreviewTool, GatedReportForm)→Tasks 6-7; index copy/metadata/e2e→Task 8; the render-parity bot typo→Task 4 (+ test assertion); testing→Task 1 suite + Task 2-6 page suites; out-of-scope items guarded by Global Constraints.
- **Type consistency:** kit prop names (`title`/`helper`/`eyebrow`, `id`/`label`/`error`, `pending`/`pendingLabel`) are fixed in Task 1 and used verbatim in Tasks 2-6. `fieldClass`/`selectFieldClass` names fixed in Task 1.
- **Placeholder scan:** every task carries concrete code or an exact mapping table; the only open choices are explicitly bounded (mock-path resolution in Task 2, the attribution optional-label rendering in Task 5, serp-preview RSC render pattern in Task 6, site.ts wording constraints in Task 8) with acceptance contracts, so no task can stall on ambiguity.
