## Task 7: "Takip Et" Button on Keyword-Rank Result Page

**Files:**
- Create: `apps/web/src/components/tracker/track-this-button.tsx`
- Modify: `apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx` (add the button in the completed result branch)
- Test: `apps/web/src/__tests__/tracker-track-this-button.test.ts`

**Interfaces:**
- Consumes: `createTrackerTargetAction` from `@/lib/tracker/actions`
- Produces: `TrackThisButton` client component that takes `{ keyword: string; domain: string }` props and renders an inline email + submit form

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/tracker-track-this-button.test.ts`:

```typescript
/**
 * TrackThisButton contract test — verifies the component renders the
 * "Bu anahtarı takip et" CTA in its initial (collapsed) state.
 * The expanded form with email input is tested via e2e (B1 minimal).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetAction: vi.fn(),
}));

describe("TrackThisButton", () => {
  it("renders the track-this CTA with Turkish text in collapsed state", async () => {
    const { TrackThisButton } = await import("../components/tracker/track-this-button");
    const markup = renderToStaticMarkup(
      React.createElement(TrackThisButton, { keyword: "seo denetimi", domain: "example.com" }),
    );
    expect(markup).toContain("Bu Anahtarı Takip Et");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/tracker-track-this-button.test.ts`
Expected: FAIL — `Cannot find module '../components/tracker/track-this-button'`

- [ ] **Step 3: Implement the TrackThisButton component**

Create `apps/web/src/components/tracker/track-this-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createTrackerTargetAction, type TrackerTargetActionState } from "../../lib/tracker/actions";

const initialState: TrackerTargetActionState = { status: "idle" };

export function TrackThisButton({ keyword, domain }: { keyword: string; domain: string }) {
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createTrackerTargetAction,
    initialState,
  );

  if (state.status === "success" && state.token) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4" role="status">
        <p className="text-sm font-semibold text-green-800 mb-2">
          Takibe alındı! Günlük olarak kontrol edilecek.
        </p>
        <a
          href={`/tracker/${state.token}`}
          className="text-sm font-semibold text-green-700 underline hover:text-green-800"
        >
          Takip panelinize gidin →
        </a>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
      >
        Bu Anahtarı Takip Et
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">
        Bu anahtarı günlük takibe alın
      </p>
      <p className="text-xs text-slate-600">
        Anahtar kelime: <span className="font-medium">{keyword}</span> · Alan adı:{" "}
        <span className="font-mono">{domain}</span>
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="keyword" value={keyword} />
        <input type="hidden" name="domain" value={domain} />
        <div>
          <label htmlFor="track-email" className="block text-sm font-medium text-slate-700 mb-1">
            E-posta
          </label>
          <input
            id="track-email"
            name="email"
            type="email"
            required
            placeholder="ornek@email.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.email && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.email[0]}</p>
          )}
        </div>
        {state.errors?.form && (
          <p className="text-sm text-red-600" role="alert">{state.errors.form[0]}</p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Ekleniyor..." : "Takibe Başla"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Add the button to the keyword-rank result page**

In `apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx`, add the import at the top (after the CrewReportSection import):

```typescript
import { TrackThisButton } from "../../../../../src/components/tracker/track-this-button";
```

Add the TrackThisButton in the completed result section, after the "İlk 10 Sonuç" table div and before the GEO cross-link div (before the `<div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">` that contains the GEO readiness link):

```tsx
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Günlük Takip</h2>
          <TrackThisButton keyword={safePayload.keyword} domain={safePayload.domain} />
        </div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/tracker-track-this-button.test.ts`
Expected: PASS — all 1 test passes.

- [ ] **Step 6: Run keyword-rank result state contract tests to verify no regressions**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/keyword-rank-result-states.test.ts`
Expected: PASS — existing landmark contract tests still pass (the new div does not add extra `<main>` or `<h1>` tags; it uses `<h2>`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/tracker/track-this-button.tsx apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx apps/web/src/__tests__/tracker-track-this-button.test.ts
git commit -m "feat(web): 'takip et' button on keyword-rank result page

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---


