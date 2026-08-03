### Task 4: Alert digest — build + send one mock email per session

**Files:**
- Create: `apps/worker/src/alerts/alert-digest.ts`
- Test: `apps/worker/src/__tests__/alert-digest.test.ts`

**Interfaces:**
- Consumes: `UnsentAlertRow` from `../db/tracker-repository.js` (Task 2); `EmailProvider` from `@seovista/reports`; `Logger` from `../utils/logger.js`.
- Produces:
  - `interface AlertDigestDeps { repo: { listUnsentAlertsForDigest(): Promise<UnsentAlertRow[]>; markAlertsEmailed(ids: string[]): Promise<void> }; email: EmailProvider; logger: Logger; siteUrl: string; fromEmail: string; }`
  - `interface AlertDigestResult { sessionsNotified: number; alertsEmailed: number; failures: number; }`
  - `async function runAlertDigest(deps: AlertDigestDeps): Promise<AlertDigestResult>`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/__tests__/alert-digest.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createMockEmail } from "@seovista/reports";
import { noopLogger } from "../utils/logger.js";
import { runAlertDigest } from "../alerts/alert-digest.js";
import type { UnsentAlertRow } from "../db/tracker-repository.js";

function row(overrides: Partial<UnsentAlertRow>): UnsentAlertRow {
  return {
    alertId: "a1",
    sessionId: "s1",
    email: "user@example.com",
    token: "************************************",
    created_at: new Date("2026-08-03T03:00:00.000Z"),
    kind: "dropped_out_of_top10",
    from_position: 4,
    to_position: 0,
    keyword: "seo denetimi",
    domain: "example.com",
    alert_consent_updated_at: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("runAlertDigest", () => {
  it("groups alerts by session into one email and marks them emailed", async () => {
    const email = createMockEmail();
    const markAlertsEmailed = vi.fn().mockResolvedValue(undefined);
    const rows = [
      row({ alertId: "a1", sessionId: "s1", email: "a@example.com", kind: "dropped_out_of_top10", from_position: 4, to_position: 0, keyword: "seo", domain: "a.com" }),
      row({ alertId: "a2", sessionId: "s1", email: "a@example.com", kind: "significant_rise", from_position: 8, to_position: 3, keyword: "sem", domain: "a.com" }),
      row({ alertId: "a3", sessionId: "s2", email: "b@example.com", kind: "entered_top10", from_position: 0, to_position: 2, keyword: "seo", domain: "b.com" }),
    ];
    const result = await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => rows, markAlertsEmailed },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });

    expect(result.sessionsNotified).toBe(2);
    expect(result.alertsEmailed).toBe(3);
    expect(markAlertsEmailed).toHaveBeenCalledWith(["a1", "a2", "a3"]);
    expect(email.getSideEffectCounts().successful).toBe(2);
  });

  it("builds Turkish text body with the panel link", async () => {
    const email = createMockEmail();
    const captured: string[] = [];
    const originalSend = email.send.bind(email);
    email.send = async (payload) => {
      captured.push(payload.textBody);
      return originalSend(payload);
    };
    await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => [row({ kind: "dropped_out_of_top10", from_position: 4, to_position: 0, keyword: "seo", domain: "a.com" })], markAlertsEmailed: vi.fn() },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(captured[0]).toContain('"seo" (a.com): İlk 10dan düştü (önceki #4)');
    expect(captured[0]).toContain("https://seovista.example/tracker/11111111-1111-1111-1111-111111111111");
  });

  it("does not send when there are no unsent alerts", async () => {
    const email = createMockEmail();
    const result = await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => [], markAlertsEmailed: vi.fn() },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(result.sessionsNotified).toBe(0);
    expect(email.getSideEffectCounts().attempted).toBe(0);
  });

  it("keeps emailed_at NULL and counts a failure when the provider errors", async () => {
    const email = createMockEmail({ capability: "unconfigured" }); // always fails
    const markAlertsEmailed = vi.fn().mockResolvedValue(undefined);
    const result = await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => [row()], markAlertsEmailed },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(result.failures).toBe(1);
    expect(markAlertsEmailed).not.toHaveBeenCalled();
  });
});
```

Note: `EmailProvider.send` is a readonly method on the interface; reassigning it in the test above works because `createMockEmail()` returns a plain object. If the type refuses assignment, instead capture via a `send` wrapper returned by a small helper (see Step 3 for the subject format) — the simplest robust approach is to assert on the mock's `getSideEffectCounts()` and to build the digest to include the panel link, then assert the link string is present in the payload by wrapping `send` before running. If the TS build complains about the reassignment, replace the `email.send = ...` block with:

```ts
    const send = email.send.bind(email);
    const email2: typeof email = { ...email, send: async (payload) => { captured.push(payload.textBody); return send(payload); } };
```

and pass `email2` to `runAlertDigest`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/worker test -- alert-digest`

Expected: FAIL — module not found (`../alerts/alert-digest.js`).

- [ ] **Step 3: Write the implementation**

Create `apps/worker/src/alerts/alert-digest.ts`:

```ts
import type { EmailProvider, EmailPayload } from "@seovista/reports";
import type { Logger } from "../utils/logger.js";
import type { UnsentAlertRow } from "../db/tracker-repository.js";

export interface AlertDigestRepo {
  listUnsentAlertsForDigest(): Promise<UnsentAlertRow[]>;
  markAlertsEmailed(alertIds: string[]): Promise<void>;
}

export interface AlertDigestDeps {
  repo: AlertDigestRepo;
  email: EmailProvider;
  logger: Logger;
  /** Trusted public origin, e.g. NEXT_PUBLIC_SITE_URL. Used to build the panel link. */
  siteUrl: string;
  /** From address for the digest email. */
  fromEmail: string;
}

export interface AlertDigestResult {
  sessionsNotified: number;
  alertsEmailed: number;
  failures: number;
}

const KIND_LABEL: Record<UnsentAlertRow["kind"], string> = {
  dropped_out_of_top10: "İlk 10'dan düştü",
  entered_top10: "İlk 10'a girdi",
  significant_drop: "Belirgin düşüş",
  significant_rise: "Belirgin yükseliş",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function lineText(alert: UnsentAlertRow): string {
  const base = `"${alert.keyword}" (${alert.domain}): ${KIND_LABEL[alert.kind]}`;
  if (alert.kind === "dropped_out_of_top10") return `${base} (önceki #${alert.from_position})`;
  if (alert.kind === "entered_top10") return `${base} (#${alert.to_position})`;
  return `${base} (#${alert.from_position} → #${alert.to_position})`;
}

function groupBySession(rows: UnsentAlertRow[]): Map<string, UnsentAlertRow[]> {
  const groups = new Map<string, UnsentAlertRow[]>();
  for (const r of rows) {
    const list = groups.get(r.sessionId) ?? [];
    list.push(r);
    groups.set(r.sessionId, list);
  }
  return groups;
}

/**
 * Send one digest email per consenting session that has unsent alerts, then
 * mark those alerts as emailed. Runs inside the daily tracker_scan job after
 * the scan loop. A provider failure for one session leaves its alerts
 * `emailed_at` NULL so the next day's digest naturally retries them.
 */
export async function runAlertDigest(deps: AlertDigestDeps): Promise<AlertDigestResult> {
  const rows = await deps.repo.listUnsentAlertsForDigest();
  if (rows.length === 0) {
    return { sessionsNotified: 0, alertsEmailed: 0, failures: 0 };
  }

  const groups = groupBySession(rows);
  let sessionsNotified = 0;
  let alertsEmailed = 0;
  let failures = 0;
  const allEmailedIds: string[] = [];

  for (const [sessionId, alerts] of groups) {
    const first = alerts[0]!;
    const subject = `SeoVista takip uyarıları — ${formatDate(new Date())}`;
    const bodyLines = alerts.map(lineText);
    const panelUrl = `${deps.siteUrl.replace(/\/$/, "")}/tracker/${first.token}`;
    const textBody = `${bodyLines.join("\n")}\n\nUyarılarınızı görmek için: ${panelUrl}`;

    const payload: EmailPayload = {
      to: { email: first.email },
      from: { email: deps.fromEmail },
      subject,
      textBody,
      consent: {
        marketing: true,
        analytics: false,
        timestamp: first.alert_consent_updated_at?.toISOString() ?? new Date().toISOString(),
      },
      source: "tracker-alerts",
      scenario: "success",
    };

    const outcome = await deps.email.send(payload);
    if (outcome.success) {
      sessionsNotified += 1;
      alertsEmailed += alerts.length;
      allEmailedIds.push(...alerts.map((a) => a.alertId));
    } else {
      failures += 1;
      deps.logger(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-alerts",
          event: "digest_send_failed",
          sessionId,
          code: outcome.error?.code,
          message: outcome.error?.message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  if (allEmailedIds.length > 0) {
    await deps.repo.markAlertsEmailed(allEmailedIds);
  }

  deps.logger(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "tracker-alerts",
      event: "digest_complete",
      sessionsNotified,
      alertsEmailed,
      failures,
      timestamp: new Date().toISOString(),
    }),
  );

  return { sessionsNotified, alertsEmailed, failures };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seovista/worker test -- alert-digest`

Expected: PASS.

- [ ] **Step 5: Add `@seovista/reports` to the worker and wire the export**

Add `"@seovista/reports": "workspace:*"` to `"dependencies"` in `apps/worker/package.json` (alphabetical order, after `"@seovista/geo-engine"`). Then install:

Run: `pnpm install`

Then add the digest + evaluator to the worker's public API in `apps/worker/src/index.ts` (append to the existing export block):

```ts
export { evaluateTransition, type AlertKind } from "./alerts/alert-evaluator.js";
export { runAlertDigest, type AlertDigestDeps, type AlertDigestResult } from "./alerts/alert-digest.js";
```

- [ ] **Step 6: Typecheck and lint the worker**

Run: `pnpm --filter @seovista/worker typecheck` and `pnpm --filter @seovista/worker lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/alerts/alert-digest.ts apps/worker/src/__tests__/alert-digest.test.ts apps/worker/package.json pnpm-lock.yaml apps/worker/src/index.ts
git commit -m "feat(worker): add alert digest email builder and sender"
```
