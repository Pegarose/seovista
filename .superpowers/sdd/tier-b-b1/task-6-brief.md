## Task 6: Tracker Pages — /tracker + /tracker/[token]

**Files:**
- Create: `apps/web/src/components/tracker/tracker-form.tsx`
- Create: `apps/web/src/components/tracker/tracker-dashboard.tsx`
- Create: `apps/web/app/tracker/page.tsx`
- Create: `apps/web/app/tracker/[token]/page.tsx`
- Test: `apps/web/src/__tests__/tracker-pages.test.ts`

**Interfaces:**
- Consumes: `createTrackerTargetAction`, `listTrackerTargetsAction`, `deactivateTrackerTargetAction` from `../../src/lib/tracker/actions`
- Produces: two new public routes (`/tracker`, `/tracker/[token]`) and two client components

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/tracker-pages.test.ts`:

```typescript
/**
 * Tracker page contract tests — verifies the /tracker and /tracker/[token]
 * pages render with the correct landmark structure (one <main id="main">,
 * one <h1>) and the expected Turkish UI text.
 *
 * Follows the keyword-rank-result-states.test.ts pattern: async page
 * components are awaited to resolve their RSC promises, then the resulting
 * React element is passed to renderToStaticMarkup.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockListTrackerTargets = vi.fn();

vi.mock("@seovista/worker", () => ({
  createTrackerRepository: vi.fn(),
}));

vi.mock("@/lib/admin/db", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetAction: vi.fn(),
  listTrackerTargetsAction: mockListTrackerTargets,
  deactivateTrackerTargetAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

const VALID_TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let TrackerPage: () => React.ReactElement;
let TrackerTokenPage: (props: { params: Promise<{ token: string }> }) => Promise<React.ReactElement>;

beforeAll(async () => {
  const trackerMod = await import("../app/tracker/page");
  TrackerPage = trackerMod.default;

  const tokenMod = await import("../app/tracker/[token]/page");
  TrackerTokenPage = tokenMod.default;

  // Mock listTrackerTargetsAction to return an empty list by default
  mockListTrackerTargets.mockResolvedValue({ success: true, targets: [], email: "user@example.com" });
});

describe("Tracker pages landmark contract", () => {
  it("/tracker page renders one main landmark with id=main and one h1", () => {
    const markup = renderToStaticMarkup(React.createElement(TrackerPage));
    expect(countTag(markup, "main")).toBe(1);
    expect(markup).toContain('id="main"');
    expect(countTag(markup, "h1")).toBe(1);
  });

  it("/tracker page contains Turkish heading", () => {
    const markup = renderToStaticMarkup(React.createElement(TrackerPage));
    expect(markup).toContain("Anahtar Kelime Takibi");
  });

  it("/tracker/[token] page renders one main landmark with id=main and one h1", async () => {
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(countTag(markup, "main")).toBe(1);
    expect(markup).toContain('id="main"');
    expect(countTag(markup, "h1")).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/tracker-pages.test.ts`
Expected: FAIL — `Cannot find module '../app/tracker/page'`

- [ ] **Step 3: Implement the tracker form client component**

Create `apps/web/src/components/tracker/tracker-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createTrackerTargetAction, type TrackerTargetActionState } from "../../lib/tracker/actions";

const initialState: TrackerTargetActionState = { status: "idle" };

export function TrackerForm() {
  const [state, formAction, isPending] = useActionState(
    createTrackerTargetAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="tracker-email" className="block text-sm font-medium text-slate-700 mb-1">
            E-posta
          </label>
          <input
            id="tracker-email"
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

        <div>
          <label htmlFor="tracker-keyword" className="block text-sm font-medium text-slate-700 mb-1">
            Anahtar Kelime
          </label>
          <input
            id="tracker-keyword"
            name="keyword"
            type="text"
            required
            placeholder="seo denetimi"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.keyword && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.keyword[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="tracker-domain" className="block text-sm font-medium text-slate-700 mb-1">
            Alan Adı
          </label>
          <input
            id="tracker-domain"
            name="domain"
            type="text"
            required
            placeholder="ornek.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.domain && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.domain[0]}</p>
          )}
        </div>

        {state.errors?.form && (
          <p className="text-sm text-red-600" role="alert">{state.errors.form[0]}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Ekleniyor..." : "Takibe Başla"}
        </button>
      </form>

      {state.status === "success" && state.token && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4" role="status">
          <p className="text-sm font-semibold text-green-800 mb-2">
            Takip hedefiniz eklendi! Günlük olarak kontrol edilecek.
          </p>
          <p className="text-sm text-green-700 mb-2">
            Takip panelinizi görüntülemek için aşağıdaki bağlantıyı yer imine ekleyin:
          </p>
          <a
            href={`/tracker/${state.token}`}
            className="block w-full rounded-lg border border-green-300 bg-white px-3 py-2 font-mono text-sm text-green-900 break-all hover:bg-green-50 transition-colors"
          >
            {typeof window !== "undefined" ? `${window.location.origin}/tracker/${state.token}` : `/tracker/${state.token}`}
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement the tracker dashboard client component**

Create `apps/web/src/components/tracker/tracker-dashboard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { deactivateTrackerTargetAction } from "../../lib/tracker/actions";
import type { TargetWithObservations } from "@seovista/worker";

export function TrackerDashboard({
  token,
  targets,
  email,
}: {
  token: string;
  targets: TargetWithObservations[];
  email: string;
}) {
  const [removing, setRemoving] = useState<string | null>(null);

  async function handleDeactivate(targetId: string) {
    setRemoving(targetId);
    try {
      await deactivateTrackerTargetAction(token, targetId);
      // Reload the page to reflect the change (RSC will re-render)
      window.location.reload();
    } catch {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <p className="text-sm text-slate-600">
          Hesap: <span className="font-mono font-medium text-slate-800">{email}</span>
        </p>
      </div>

      {targets.length === 0 ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
          <p className="text-slate-600">
            Henüz takip edilen anahtar kelime yok. Yukarıdaki formdan yeni bir hedef ekleyebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Takip Edilen Hedefler</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th scope="col" className="py-2 pr-4 font-semibold">Anahtar Kelime</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Alan Adı</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Son Sıra</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Son Kontrol</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Son 7 Gözlem</th>
                  <th scope="col" className="py-2 font-semibold">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-900 font-medium">{target.keyword}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600">{target.domain}</td>
                    <td className="py-2 pr-4 tabular-nums text-slate-700">
                      {target.latestPosition !== null && target.latestPosition > 0
                        ? `#${target.latestPosition}`
                        : target.latestPosition === 0
                        ? "İlk 10'da yok"
                        : "Henüz kontrol edilmedi"}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 text-xs">
                      {target.latestCheckedAt
                        ? new Date(target.latestCheckedAt).toLocaleDateString("tr-TR")
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {target.recentObservations.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {target.recentObservations.map((obs, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs tabular-nums text-slate-600"
                              title={new Date(obs.checkedAt).toLocaleDateString("tr-TR")}
                            >
                              {obs.position > 0 ? `#${obs.position}` : "—"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">Henüz veri yok</span>
                      )}
                    </td>
                    <td className="py-2">
                      {target.active && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(target.id)}
                          disabled={removing === target.id}
                          className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {removing === target.id ? "Kaldırılıyor..." : "Kaldır"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement the /tracker page (RSC)**

Create `apps/web/app/tracker/page.tsx`:

```tsx
import { TrackerForm } from "../../src/components/tracker/tracker-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Anahtar Kelime Takibi - SeoVista",
  robots: { index: false, follow: false, nocache: true },
};

export default function TrackerPage() {
  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Anahtar Kelime Takibi
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Anahtar kelimenizi günlük olarak otomatik kontrol ettirin. Sıralama
            değişimlerini takip panelinden izleyin.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Yeni Hedef Ekle</h2>
          <TrackerForm />
        </div>

        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-600">
            Takip paneli bağlantınızı kaybederseniz, aynı e-posta ile yeni bir
            hedef eklediğinizde mevcut panelinize erişebilirsiniz.
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Implement the /tracker/[token] page (RSC)**

Create `apps/web/app/tracker/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { listTrackerTargetsAction } from "../../../src/lib/tracker/actions";
import { TrackerDashboard } from "../../../src/components/tracker/tracker-dashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Takip Paneli - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrackerTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    notFound();
  }

  const result = await listTrackerTargetsAction(token);

  if (!result.success) {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Takip Paneli Bulunamadı
          </h1>
          <p className="text-slate-700">
            Takip paneli bağlantınız geçersiz veya bulunamadı. Lütfen bağlantıyı kontrol edin.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Takip Panelim
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Anahtar kelimeleriniz günlük olarak kontrol edilir. Bu sayfayı yer
            imlerine ekleyerek tekrar erişebilirsiniz.
          </p>
        </div>

        <TrackerDashboard
          token={token}
          targets={result.targets}
          email={result.email}
        />

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Yeni Hedef Ekle</h2>
          <AddTargetForm token={token} email={result.email} />
        </div>
      </div>
    </main>
  );
}

function AddTargetForm({ token: _token, email }: { token: string; email: string }) {
  // Reuses the TrackerForm but pre-fills the email since the session is known.
  // For B1 simplicity, we use a simple form that calls the same action.
  return (
    <form action="/api/tracker/add" method="POST" className="space-y-4">
      <input type="hidden" name="knownEmail" value={email} />
      <p className="text-sm text-slate-600">
        Yeni hedef eklemek için{" "}
        <a href="/tracker" className="font-semibold text-slate-900 hover:text-slate-600 underline">
          takip formuna gidin
        </a>{" "}
        ve aynı e-posta adresini kullanın. Hedefleriniz bu panelde görünecek.
      </p>
    </form>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/tracker-pages.test.ts`
Expected: PASS — all 3 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/tracker/tracker-form.tsx apps/web/src/components/tracker/tracker-dashboard.tsx apps/web/app/tracker/page.tsx apps/web/app/tracker/[token]/page.tsx apps/web/src/__tests__/tracker-pages.test.ts
git commit -m "feat(web): tracker pages — /tracker form + /tracker/[token] dashboard

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---


