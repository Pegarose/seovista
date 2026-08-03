### Task 8: Web — alerts list component + consent toggle + page integration

**Files:**
- Create: `apps/web/src/components/tracker/alerts-list.tsx`
- Create: `apps/web/src/components/tracker/consent-toggle.tsx`
- Modify: `apps/web/app/tracker/[token]/page.tsx`
- Modify: `apps/web/src/lib/tracker/actions.ts` (add `listAlertsAction` and return `consent` from `listTrackerTargetsAction`)
- Test: `apps/web/src/__tests__/tracker-pages.test.ts` (extend), `apps/web/src/__tests__/tracker-alerts-list.test.ts` (new)

**Interfaces:**
- Consumes: `listAlertsByToken` from `@seovista/worker` (Task 2); `updateAlertConsentAction` (Task 6).
- Produces:
  - `listAlertsAction(token: string, limit?: number): Promise<{ success: true; alerts: AlertSummary[] } | { success: false; error: string }>`
  - `AlertsList({ alerts, email, token }: { alerts: AlertSummary[]; email: string; token: string })` — RSC.
  - `ConsentToggle({ token, current }: { token: string; current: boolean })` — client island.

- [ ] **Step 1: Write the failing page + component tests**

Extend `apps/web/src/__tests__/tracker-pages.test.ts` — add `listAlertsAction` to the mocked actions module and update all `listTrackerTargetsAction` return values to include `consent: boolean`.

In the `vi.mock("@/lib/tracker/actions", ...)` block add `listAlertsAction: vi.fn()` and default to resolve `{ success: true, alerts: [] }`.

Add a new test file `apps/web/src/__tests__/tracker-alerts-list.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertsList } from "../../src/components/tracker/alerts-list";

describe("AlertsList", () => {
  it("renders the alerts heading and kind labels", () => {
    const el = React.createElement(AlertsList, {
      alerts: [
        { id: "a1", kind: "dropped_out_of_top10", fromPosition: 4, toPosition: 0, observedAt: "2026-08-03T03:00:00.000Z", keyword: "seo", domain: "a.com" },
        { id: "a2", kind: "significant_rise", fromPosition: 8, toPosition: 3, observedAt: "2026-08-02T03:00:00.000Z", keyword: "sem", domain: "a.com" },
      ],
      email: "user@example.com",
      token: "************************************",
    });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("Uyarılar");
    expect(markup).toContain("İlk 10'dan düştü");
    expect(markup).toContain("Belirgin yükseliş");
    expect(countTag(markup, "h2")).toBe(1);
  });

  it("renders the empty state when there are no alerts", () => {
    const el = React.createElement(AlertsList, { alerts: [], email: "a@example.com", token: "************************************" });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("Henüz uyarı yok");
  });
});

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- tracker-alerts-list`

Expected: FAIL — `AlertsList` module not found.

- [ ] **Step 3: Add `listAlertsAction` to actions.ts**

Append to `apps/web/src/lib/tracker/actions.ts`:

```ts
export type AlertsResult =
  | { success: true; alerts: AlertSummary[] }
  | { success: false; error: string };

export async function listAlertsAction(token: string, limit = 30): Promise<AlertsResult> {
  try {
    const db = getAdminDb();
    const repo = createTrackerRepository(db);
    const session = await repo.findSessionByToken(token);
    if (!session) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }
    const alerts = await repo.listAlertsByToken(token, limit);
    return { success: true, alerts };
  } catch (error) {
    console.error("Failed to list tracker alerts:", error);
    return { success: false, error: "Uyarılar yüklenemedi." };
  }
}
```

Import `AlertSummary` type from `@seovista/worker` in the existing import statement. Also update `listTrackerTargetsAction` to return `consent: session.alert_consent` and update the `TrackerTargetsResult` type:

```ts
export type TrackerTargetsResult =
  | { success: true; targets: TargetWithObservations[]; email: string; consent: boolean }
  | { success: false; error: string };
```

- [ ] **Step 4: Create `alerts-list.tsx` (RSC)**

Create `apps/web/src/components/tracker/alerts-list.tsx`:

```tsx
import type { AlertSummary } from "@seovista/worker";

const KIND_LABEL: Record<string, string> = {
  dropped_out_of_top10: "İlk 10'dan düştü",
  entered_top10: "İlk 10'a girdi",
  significant_drop: "Belirgin düşüş",
  significant_rise: "Belirgin yükseliş",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function detailText(alert: AlertSummary): string {
  if (alert.kind === "dropped_out_of_top10") return `#${alert.fromPosition} → İlk 10'da yok`;
  if (alert.kind === "entered_top10") return `İlk 10'da yok → #${alert.toPosition}`;
  return `#${alert.fromPosition} → #${alert.toPosition}`;
}

export function AlertsList({ alerts }: { alerts: AlertSummary[]; email: string; token: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">Uyarılar</h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-slate-600 mt-2">
          Henüz uyarı yok. Pozisyon değişikliklerinde burada görünecek.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{alert.keyword}</span>
                <span className="font-mono text-slate-500">{alert.domain}</span>
              </div>
              <div className="mt-1 text-slate-700">
                <span className="font-semibold">{KIND_LABEL[alert.kind] ?? alert.kind}</span>
                <span className="text-slate-500"> · {detailText(alert)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{formatDate(alert.observedAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Note: The component accepts `email` and `token` props as specified in the interface even though the implementation uses only `alerts`.

- [ ] **Step 5: Create `consent-toggle.tsx` (client island)**

Create `apps/web/src/components/tracker/consent-toggle.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAlertConsentAction } from "../../lib/tracker/actions";

export function ConsentToggle({ token, current }: { token: string; current: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await updateAlertConsentAction(token, next);
      if (!result.success) {
        setError(result.error ?? "E-posta uyarı tercihi güncellenemedi.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={current}
          disabled={isPending}
          onChange={(e) => handleChange(e.target.checked)}
          className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
        />
        E-posta uyarıları: {current ? "Açık" : "Kapalı"}
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Integrate into the dashboard page**

Modify `apps/web/app/tracker/[token]/page.tsx`:

1. Import `AlertsList` and `ConsentToggle`, and `listAlertsAction`.
2. In `TrackerTokenPage`, fetch alerts alongside targets:

```tsx
  const alertsResult = await listAlertsAction(token);
  const alerts = alertsResult.success ? alertsResult.alerts : [];
```

3. Render the alerts section between `AddTargetForm` and the target cards:

```tsx
        <AddTargetForm token={token} />

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <ConsentToggle token={token} current={result.consent} />
          <AlertsList alerts={alerts} email={result.email} token={token} />
        </div>
```

- [ ] **Step 7: Run the page + alerts-list tests to verify they pass**

Run: `pnpm --filter @seovista/web test -- tracker-pages tracker-alerts-list`

Expected: PASS.

- [ ] **Step 8: Typecheck and lint the web app**

Run: `pnpm --filter @seovista/web typecheck` and `pnpm --filter @seovista/web lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/tracker/alerts-list.tsx apps/web/src/components/tracker/consent-toggle.tsx apps/web/app/tracker/[token]/page.tsx apps/web/src/lib/tracker/actions.ts apps/web/src/__tests__/tracker-alerts-list.test.ts apps/web/src/__tests__/tracker-pages.test.ts
git commit -m "feat(web): render tracker alerts section and consent toggle on dashboard"
```
