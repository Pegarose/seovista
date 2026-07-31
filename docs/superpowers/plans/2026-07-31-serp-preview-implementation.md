# SERP Preview (`/tools/serp-preview/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SERP Preview free tool: manual title/meta/URL input → live desktop + mobile Google snippet preview with pixel-based truncation warnings, character guidance and shareable query-param links. No worker, no DB, no queue.

**Architecture:** `@seovista/seo-core` gains a deterministic Arial pixel-approximation module (`serp-preview.ts`). The web route is an RSC shell (reads `?title&desc&url` searchParams) rendering one client component (`SerpPreviewTool`) that computes `analyzeSerpSnippet` live on every keystroke and renders snippet cards, meters, warnings and a clipboard share button.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4, Vitest + Testing Library (happy-dom).

## Global Constraints

- Node 24 LTS at `C:\Users\BCX\.config\herd\bin\nvm\v24.12.0` on PATH; `corepack pnpm@10.30.1`.
- TypeScript strict mode (`strictNullChecks` on).
- Exactly one `<h1>` inside exactly one `<main>`; WCAG 2.1 AA; no color-only status indicators.
- Turkish UI strings per PRD §0.3.
- Pixel measurement must be labeled as an estimate ("tahmini pixel ölçümü") — never claim exact Google rendering.
- No worker, DB, queue, or server action in this tool; state lives in the client component and in query params.
- Follow existing conventions: mirror `apps/web/src/components/ai-crawler-checker/` test setup (happy-dom pragma) and `apps/web/app/tools/` page structure.

---

### Task 1: Pixel approximation module in `@seovista/seo-core`

**Files:**
- Create: `packages/seo-core/src/serp-preview.ts`
- Modify: `packages/seo-core/src/index.ts` (re-export)
- Test: `packages/seo-core/src/__tests__/serp-preview.test.ts`

**Interfaces:**
- Produces: `measurePixelWidth`, `truncateAtPixelWidth`, `analyzeSerpSnippet`, `SERP_LIMITS`, `SERP_CHAR_GUIDANCE`, types `SerpAnalysis`, `SerpVariantMetrics`, `SerpGuidance`.

- [ ] **Step 1: Write the failing test**

Create `packages/seo-core/src/__tests__/serp-preview.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  analyzeSerpSnippet,
  measurePixelWidth,
  SERP_CHAR_GUIDANCE,
  SERP_LIMITS,
  truncateAtPixelWidth,
} from "../serp-preview";

describe("measurePixelWidth", () => {
  it("returns 0 for empty string", () => {
    expect(measurePixelWidth("", 20)).toBe(0);
  });
  it("wide characters cost more than narrow ones", () => {
    expect(measurePixelWidth("WWWWW", 20)).toBeGreaterThan(measurePixelWidth("iiiii", 20));
  });
  it("scales linearly with font size", () => {
    expect(measurePixelWidth("seo", 40)).toBe(measurePixelWidth("seo", 20) * 2);
  });
  it("handles Turkish characters", () => {
    expect(measurePixelWidth("ÇğİöŞü", 20)).toBeGreaterThan(0);
  });
});

describe("truncateAtPixelWidth", () => {
  it("returns original text when within limit", () => {
    const result = truncateAtPixelWidth("kısa başlık", 600, 20);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("kısa başlık");
  });
  it("truncates with ellipsis and reserves its width", () => {
    const long = "Bu çok uzun bir sayfa başlığıdır ve Google sonuçlarında kesinlikle kısaltılacaktır";
    const result = truncateAtPixelWidth(long, 200, 20);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(measurePixelWidth(result.text, 20)).toBeLessThanOrEqual(200);
  });
});

describe("analyzeSerpSnippet", () => {
  it("flags over-limit title as truncated on desktop", () => {
    const analysis = analyzeSerpSnippet("W".repeat(40), "kısa açıklama");
    expect(analysis.desktop.title.truncated).toBe(true);
    expect(analysis.desktop.title.maxPixelWidth).toBe(SERP_LIMITS.desktop.titleMaxPx);
  });
  it("computes character guidance bands", () => {
    const short = analyzeSerpSnippet("kısa", "kısa");
    expect(short.titleGuidance).toBe("too-short");
    expect(short.descriptionGuidance).toBe("too-short");
    const ok = analyzeSerpSnippet("x".repeat(55), "x".repeat(120));
    expect(ok.titleGuidance).toBe("ok");
    expect(ok.descriptionGuidance).toBe("ok");
    const long = analyzeSerpSnippet("x".repeat(SERP_CHAR_GUIDANCE.title.max + 1), "x".repeat(SERP_CHAR_GUIDANCE.description.max + 1));
    expect(long.titleGuidance).toBe("too-long");
    expect(long.descriptionGuidance).toBe("too-long");
  });
  it("handles empty input without errors", () => {
    const analysis = analyzeSerpSnippet("", "");
    expect(analysis.desktop.title.pixelWidth).toBe(0);
    expect(analysis.desktop.title.truncated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/seo-core test`
Expected: FAIL — `../serp-preview` module not found.

- [ ] **Step 3: Implement `packages/seo-core/src/serp-preview.ts`**

```ts
/**
 * SERP pixel approximation — Arial advance-width table at 100px scale.
 * Deterministic estimate of Google's snippet truncation; never presented
 * as exact rendering (UI must label it "tahmini pixel ölçümü").
 */
const ARIAL_WIDTHS_AT_100: Readonly<Record<string, number>> = {
  " ": 28, "!": 28, '"': 36, "#": 56, "$": 56, "%": 89, "&": 67, "'": 19,
  "(": 33, ")": 33, "*": 39, "+": 58, ",": 28, "-": 33, ".": 28, "/": 28,
  "0": 56, "1": 56, "2": 56, "3": 56, "4": 56, "5": 56, "6": 56, "7": 56, "8": 56, "9": 56,
  ":": 28, ";": 28, "<": 58, "=": 58, ">": 58, "?": 56, "@": 102,
  A: 67, B: 67, C: 72, D: 72, E: 67, F: 61, G: 78, H: 72, I: 28, J: 50,
  K: 67, L: 56, M: 83, N: 72, O: 78, P: 67, Q: 78, R: 72, S: 67, T: 61,
  U: 72, V: 67, W: 94, X: 67, Y: 67, Z: 61,
  "[": 28, "\\": 28, "]": 28, "^": 47, _: 56, "`": 33,
  a: 56, b: 56, c: 50, d: 56, e: 56, f: 28, g: 56, h: 56, i: 22, j: 22,
  k: 50, l: 22, m: 83, n: 56, o: 56, p: 56, q: 56, r: 33, s: 50, t: 28,
  u: 56, v: 50, w: 72, x: 50, y: 50, z: 50,
  "{": 33, "|": 26, "}": 33, "~": 58, "…": 83,
  "ç": 50, "ğ": 56, "ı": 22, "ö": 56, "ş": 50, "ü": 56,
  "Ç": 72, "Ğ": 78, "İ": 28, "Ö": 78, "Ş": 67, "Ü": 72,
};
const DEFAULT_WIDTH_AT_100 = 56;
const ELLIPSIS = " …";

export function measurePixelWidth(text: string, fontSize: number): number {
  let widthAt100 = 0;
  for (const ch of text) {
    widthAt100 += ARIAL_WIDTHS_AT_100[ch] ?? DEFAULT_WIDTH_AT_100;
  }
  return Math.round((widthAt100 * fontSize) / 100);
}

export interface SerpTruncation {
  readonly text: string;
  readonly truncated: boolean;
}

export function truncateAtPixelWidth(text: string, maxPx: number, fontSize: number): SerpTruncation {
  if (measurePixelWidth(text, fontSize) <= maxPx) {
    return { text, truncated: false };
  }
  const ellipsisWidth = measurePixelWidth(ELLIPSIS, fontSize);
  let accumulated = 0;
  let cutIndex = 0;
  for (const ch of text) {
    const charWidth = ((ARIAL_WIDTHS_AT_100[ch] ?? DEFAULT_WIDTH_AT_100) * fontSize) / 100;
    if (accumulated + charWidth + ellipsisWidth > maxPx) break;
    accumulated += charWidth;
    cutIndex += ch.length;
  }
  return { text: text.slice(0, cutIndex).trimEnd() + ELLIPSIS, truncated: true };
}

export const SERP_LIMITS = {
  desktop: { titleFontSize: 20, titleMaxPx: 600, descriptionFontSize: 14, descriptionMaxPx: 990 },
  mobile: { titleFontSize: 18, titleMaxPx: 600, descriptionFontSize: 14, descriptionMaxPx: 720 },
} as const;

export const SERP_CHAR_GUIDANCE = {
  title: { min: 50, max: 60 },
  description: { min: 70, max: 160 },
} as const;

export type SerpGuidance = "too-short" | "ok" | "too-long";

export interface SerpVariantMetrics {
  readonly pixelWidth: number;
  readonly maxPixelWidth: number;
  readonly charCount: number;
  readonly truncated: boolean;
  readonly previewText: string;
}

export interface SerpAnalysis {
  readonly desktop: { title: SerpVariantMetrics; description: SerpVariantMetrics };
  readonly mobile: { title: SerpVariantMetrics; description: SerpVariantMetrics };
  readonly titleGuidance: SerpGuidance;
  readonly descriptionGuidance: SerpGuidance;
}

function guidanceFor(count: number, band: { min: number; max: number }): SerpGuidance {
  if (count < band.min) return "too-short";
  if (count > band.max) return "too-long";
  return "ok";
}

function variantMetrics(text: string, maxPx: number, fontSize: number): SerpVariantMetrics {
  const truncation = truncateAtPixelWidth(text, maxPx, fontSize);
  return {
    pixelWidth: measurePixelWidth(text, fontSize),
    maxPixelWidth: maxPx,
    charCount: text.length,
    truncated: truncation.truncated,
    previewText: truncation.text,
  };
}

export function analyzeSerpSnippet(title: string, description: string): SerpAnalysis {
  const d = SERP_LIMITS.desktop;
  const m = SERP_LIMITS.mobile;
  return {
    desktop: {
      title: variantMetrics(title, d.titleMaxPx, d.titleFontSize),
      description: variantMetrics(description, d.descriptionMaxPx, d.descriptionFontSize),
    },
    mobile: {
      title: variantMetrics(title, m.titleMaxPx, m.titleFontSize),
      description: variantMetrics(description, m.descriptionMaxPx, m.descriptionFontSize),
    },
    titleGuidance: guidanceFor(title.length, SERP_CHAR_GUIDANCE.title),
    descriptionGuidance: guidanceFor(description.length, SERP_CHAR_GUIDANCE.description),
  };
}
```

Re-export from `packages/seo-core/src/index.ts` in the file's existing barrel style.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.30.1 --filter @seovista/seo-core test`
Expected: PASS (new + existing suites).

- [ ] **Step 5: Commit**

```bash
git add packages/seo-core
git commit -m "feat(seo-core): add SERP pixel approximation and snippet analysis module"
```

---

### Task 2: Web route, preview components, tools index + copy updates

**Files:**
- Create: `apps/web/app/tools/serp-preview/page.tsx`
- Create: `apps/web/src/components/serp-preview/serp-preview-tool.tsx`
- Create: `apps/web/src/components/serp-preview/serp-snippet-card.tsx`
- Modify: `apps/web/app/tools/page.tsx` (add SERP Preview instrument; hero capability "Three previews available" → "Four previews available")
- Modify: `apps/web/src/content/site.ts` (toolsPage meta description + body: mention SERP Preview as fourth linked preview)
- Modify: `apps/web/tests/e2e/seo.spec.ts` (update pinned meta description assertion to the new site.ts string)
- Modify: `apps/web/package.json` (add `"@seovista/seo-core": "workspace:*"` if absent; run `corepack pnpm@10.30.1 install` after)
- Test: `apps/web/src/components/serp-preview/__tests__/serp-preview-tool.test.tsx`

**Interfaces:**
- Consumes: `analyzeSerpSnippet`, `SERP_CHAR_GUIDANCE` (Task 1).
- Produces: `SerpPreviewTool({ initialTitle, initialDescription, initialUrl })`, `SerpSnippetCard({ variant, title, description, displayUrl })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/serp-preview/__tests__/serp-preview-tool.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SerpPreviewTool } from "../serp-preview-tool";

describe("SerpPreviewTool", () => {
  it("renders initial values from props into inputs", () => {
    render(<SerpPreviewTool initialTitle="Başlık" initialDescription="Açıklama" initialUrl="https://example.com/sayfa" />);
    expect(screen.getByLabelText(/Sayfa Başlığı/i)).toHaveValue("Başlık");
    expect(screen.getByLabelText(/Meta Açıklama/i)).toHaveValue("Açıklama");
    expect(screen.getByLabelText(/Görüntülenecek URL/i)).toHaveValue("https://example.com/sayfa");
  });

  it("shows truncation warning when title exceeds desktop pixel limit", () => {
    render(<SerpPreviewTool initialTitle={"W".repeat(40)} initialDescription="" initialUrl="" />);
    expect(screen.getAllByText(/kısalt/i).length).toBeGreaterThan(0);
  });

  it("labels pixel measurement as an estimate", () => {
    render(<SerpPreviewTool initialTitle="x" initialDescription="" initialUrl="" />);
    expect(screen.getAllByText(/tahmini/i).length).toBeGreaterThan(0);
  });

  it("share button copies a parametrized URL to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<SerpPreviewTool initialTitle="Paylaş" initialDescription="Açıklama" initialUrl="https://example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /bağlantıyı kopyala/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain("/tools/serp-preview/?");
    expect(copied).toContain("title=");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/components/serp-preview`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement page + components**

`apps/web/app/tools/serp-preview/page.tsx` (RSC, mirror the ai-crawler-checker form page's structure/metadata style; one `<main>`, one `<h1>` "SERP Preview", Turkish explainer noting "tahmini pixel ölçümü", then `<SerpPreviewTool>`):
```tsx
import type { Metadata } from "next";
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
    <main className="min-h-screen bg-gray-50 flex items-start justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight text-center">
          SERP Preview
        </h1>
        <p className="mt-2 text-sm text-gray-500 text-center">
          Başlık ve meta açıklamanızın Google'da nasıl görüneceğini tahmini pixel ölçümüyle test edin.
        </p>
        <SerpPreviewTool
          initialTitle={firstValue(params.title)}
          initialDescription={firstValue(params.desc)}
          initialUrl={firstValue(params.url)}
        />
      </div>
    </main>
  );
}
```

`apps/web/src/components/serp-preview/serp-snippet-card.tsx` (presentational, no directive — parent is client):
```tsx
import type { ReactElement } from "react";

interface SerpSnippetCardProps {
  variant: "desktop" | "mobile";
  title: string;
  description: string;
  displayUrl: string;
}

function breadcrumbFor(displayUrl: string): string {
  if (!displayUrl.trim()) return "example.com";
  try {
    const url = new URL(displayUrl.startsWith("http") ? displayUrl : `https://${displayUrl}`);
    const path = url.pathname.replace(/\/$/, "");
    return path ? `${url.hostname} › ${path.slice(1).replace(/\//g, " › ")}` : url.hostname;
  } catch {
    return displayUrl;
  }
}

export function SerpSnippetCard({ variant, title, description, displayUrl }: SerpSnippetCardProps): ReactElement {
  const isDesktop = variant === "desktop";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-700">{breadcrumbFor(displayUrl)}</p>
      <p
        className={`mt-0.5 text-[#1a0dab] hover:underline cursor-pointer ${isDesktop ? "text-xl" : "text-lg"} leading-snug`}
        data-testid={`${variant}-title`}
      >
        {title || "Sayfa başlığınız burada görünecek"}
      </p>
      <p className="mt-0.5 text-sm text-gray-600 leading-normal" data-testid={`${variant}-description`}>
        {description || "Meta açıklamanız burada görünecek. Arama sonuçlarında kullanıcıların göreceği özet metindir."}
      </p>
    </div>
  );
}
```

`apps/web/src/components/serp-preview/serp-preview-tool.tsx` (`"use client"`):
- Props: `{ initialTitle: string; initialDescription: string; initialUrl: string }`.
- State: title/description/siteUrl initialized from props; `analysis = analyzeSerpSnippet(title, description)` computed inline each render.
- Inputs with Turkish labels: "Sayfa Başlığı" (text input), "Meta Açıklama" (textarea), "Görüntülenecek URL" (text input) — each with `id` + `<label htmlFor>` (tests query by label).
- Character guidance chips under title/description inputs: `"{count} karakter · hedef 50-60"` with text+icon state ("Kısa ⚠", "Uygun ✓", "Uzun ⚠") — not color-only.
- Two sections: "Masaüstü Önizleme" and "Mobil Önizleme", each rendering `<SerpSnippetCard variant=… title={analysis.<v>.title.previewText} description={analysis.<v>.description.previewText} displayUrl={siteUrl} />` plus a pixel meter per field:
  - bar: `<div>` width % = min(100, pixelWidth/max*100), threshold marked, numeric text `{pixelWidth} / {maxPx}px (tahmini)`.
  - when `truncated`: warning paragraph "⚠ Google bu alanı kısaltacak — önizleme kısaltılmış hâliyle gösteriliyor." (the word "kısalt" must appear — test).
- Estimate note visible: "Pixel ölçümleri tahminidir; Google'ın gerçek render'ı cihaza göre değişebilir." (the word "tahmini" must appear — test).
- Share button "Bağlantıyı Kopyala": builds `${window.location.origin}/tools/serp-preview/?title=${encodeURIComponent(title)}&desc=${encodeURIComponent(description)}&url=${encodeURIComponent(siteUrl)}`, `navigator.clipboard.writeText(...)`, transient "Kopyalandı ✓" state (button keeps accessible name matching /bağlantıyı kopyala/i in default state — the test clicks by that name; ensure the button text returns to default or use aria-label constant "Bağlantıyı Kopyala").

- [ ] **Step 4: Update tools index + site copy**

1. `apps/web/app/tools/page.tsx`: append SERP Preview to `instruments` (`{ id: "06", name: "SERP Preview", status: "Preview", summary: "Google sonuç görünümünü pixel bazlı kısaltma uyarılarıyla önizler.", href: "/tools/serp-preview/" }`), renumber as needed, update hero capability "Three previews available" → "Four previews available".
2. `apps/web/src/content/site.ts` toolsPage entry: update meta description to `"A growing library of free tools for GEO and SEO readiness. The GEO Readiness Checker, Schema Checker, AI Crawler Checker, and SERP Preview are linked as previews."` and body copy equivalently (four previews + "Additional tools are planned for later phases."). READ the file first and match its existing structure.
3. `apps/web/tests/e2e/seo.spec.ts`: update the pinned meta-description assertion to the exact new string.

- [ ] **Step 5: Run tests to verify they pass**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/components/serp-preview`
Expected: PASS. Then full gates: `corepack pnpm@10.30.1 typecheck` (0 errors), `corepack pnpm@10.30.1 --filter @seovista/web test` (all pass), `corepack pnpm@10.30.1 lint` (0 errors).

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add SERP Preview tool with pixel truncation warnings and share links"
```
