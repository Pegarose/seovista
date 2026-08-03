c755388 refactor(worker): type KIND_LABEL with UnsentAlertRow kind
e09e121 fix(worker): align alert digest Turkish labels with spec
e1f9dac feat(worker): add alert digest email builder and sender

 apps/worker/package.json                       |   1 +
 apps/worker/src/__tests__/alert-digest.test.ts |  92 +++++++++++++++++
 apps/worker/src/alerts/alert-digest.ts         | 131 +++++++++++++++++++++++++
 apps/worker/src/index.ts                       |   2 +
 pnpm-lock.yaml                                 |   3 +
 5 files changed, 229 insertions(+)

diff --git a/apps/worker/package.json b/apps/worker/package.json
index 2cd5e76..ef8a9bf 100644
--- a/apps/worker/package.json
+++ b/apps/worker/package.json
@@ -21,20 +21,21 @@
     "healthcheck": "node dist/healthcheck.js",
     "dev": "node dist/worker.js",
     "build": "tsc -p tsconfig.build.json",
     "db:bootstrap": "tsx src/db/admin-seed.ts",
     "seed": "corepack pnpm@10.30.1 run db:bootstrap"
   },
   "dependencies": {
     "@seovista/audit-core": "workspace:*",
     "@seovista/content-models": "workspace:*",
     "@seovista/geo-engine": "workspace:*",
+    "@seovista/reports": "workspace:*",
     "@seovista/schema": "workspace:*",
     "@seovista/search-visibility": "workspace:*",
     "@seovista/seo-core": "workspace:*",
     "bullmq": "^5.43.1",
     "cheerio": "^1.2.0",
     "ioredis": "^5.6.0",
     "ipaddr.js": "^2.4.0",
     "pg": "^8.14.0",
     "zod": "3.24.4"
   },
diff --git a/apps/worker/src/__tests__/alert-digest.test.ts b/apps/worker/src/__tests__/alert-digest.test.ts
new file mode 100644
index 0000000..45da833
--- /dev/null
+++ b/apps/worker/src/__tests__/alert-digest.test.ts
@@ -0,0 +1,92 @@
+import { describe, it, expect, vi } from "vitest";
+import { createMockEmail } from "@seovista/reports";
+import { noopLogger } from "../utils/logger.js";
+import { runAlertDigest } from "../alerts/alert-digest.js";
+import type { UnsentAlertRow } from "../db/tracker-repository.js";
+
+function row(overrides: Partial<UnsentAlertRow> = {}): UnsentAlertRow {
+  return {
+    alertId: "a1",
+    sessionId: "s1",
+    email: "user@example.com",
+    token: "11111111-1111-1111-1111-111111111111",
+    created_at: new Date("2026-08-03T03:00:00.000Z"),
+    kind: "dropped_out_of_top10",
+    from_position: 4,
+    to_position: 0,
+    keyword: "seo denetimi",
+    domain: "example.com",
+    alert_consent_updated_at: new Date("2026-08-01T00:00:00.000Z"),
+    ...overrides,
+  };
+}
+
+describe("runAlertDigest", () => {
+  it("groups alerts by session into one email and marks them emailed", async () => {
+    const email = createMockEmail();
+    const markAlertsEmailed = vi.fn().mockResolvedValue(undefined);
+    const rows = [
+      row({ alertId: "a1", sessionId: "s1", email: "a@example.com", kind: "dropped_out_of_top10", from_position: 4, to_position: 0, keyword: "seo", domain: "a.com" }),
+      row({ alertId: "a2", sessionId: "s1", email: "a@example.com", kind: "significant_rise", from_position: 8, to_position: 3, keyword: "sem", domain: "a.com" }),
+      row({ alertId: "a3", sessionId: "s2", email: "b@example.com", kind: "entered_top10", from_position: 0, to_position: 2, keyword: "seo", domain: "b.com" }),
+    ];
+    const result = await runAlertDigest({
+      repo: { listUnsentAlertsForDigest: async () => rows, markAlertsEmailed },
+      email,
+      logger: noopLogger,
+      siteUrl: "https://seovista.example",
+      fromEmail: "noreply@seovista.example",
+    });
+
+    expect(result.sessionsNotified).toBe(2);
+    expect(result.alertsEmailed).toBe(3);
+    expect(markAlertsEmailed).toHaveBeenCalledWith(["a1", "a2", "a3"]);
+    expect(email.getSideEffectCounts().successful).toBe(2);
+  });
+
+  it("builds Turkish text body with the panel link", async () => {
+    const email = createMockEmail();
+    const captured: string[] = [];
+    const originalSend = email.send.bind(email);
+    email.send = async (payload) => {
+      captured.push(payload.textBody);
+      return originalSend(payload);
+    };
+    await runAlertDigest({
+      repo: { listUnsentAlertsForDigest: async () => [row({ kind: "dropped_out_of_top10", from_position: 4, to_position: 0, keyword: "seo", domain: "a.com" })], markAlertsEmailed: vi.fn() },
+      email,
+      logger: noopLogger,
+      siteUrl: "https://seovista.example",
+      fromEmail: "noreply@seovista.example",
+    });
+    expect(captured[0]).toContain('"seo" (a.com): İlk 10\'dan düştü (önceki #4)');
+    expect(captured[0]).toContain("https://seovista.example/tracker/11111111-1111-1111-1111-111111111111");
+  });
+
+  it("does not send when there are no unsent alerts", async () => {
+    const email = createMockEmail();
+    const result = await runAlertDigest({
+      repo: { listUnsentAlertsForDigest: async () => [], markAlertsEmailed: vi.fn() },
+      email,
+      logger: noopLogger,
+      siteUrl: "https://seovista.example",
+      fromEmail: "noreply@seovista.example",
+    });
+    expect(result.sessionsNotified).toBe(0);
+    expect(email.getSideEffectCounts().attempted).toBe(0);
+  });
+
+  it("keeps emailed_at NULL and counts a failure when the provider errors", async () => {
+    const email = createMockEmail({ capability: "unconfigured" }); // always fails
+    const markAlertsEmailed = vi.fn().mockResolvedValue(undefined);
+    const result = await runAlertDigest({
+      repo: { listUnsentAlertsForDigest: async () => [row()], markAlertsEmailed },
+      email,
+      logger: noopLogger,
+      siteUrl: "https://seovista.example",
+      fromEmail: "noreply@seovista.example",
+    });
+    expect(result.failures).toBe(1);
+    expect(markAlertsEmailed).not.toHaveBeenCalled();
+  });
+});
diff --git a/apps/worker/src/alerts/alert-digest.ts b/apps/worker/src/alerts/alert-digest.ts
new file mode 100644
index 0000000..9788cb1
--- /dev/null
+++ b/apps/worker/src/alerts/alert-digest.ts
@@ -0,0 +1,131 @@
+import type { EmailProvider, EmailPayload } from "@seovista/reports";
+import type { Logger } from "../utils/logger.js";
+import type { UnsentAlertRow } from "../db/tracker-repository.js";
+
+export interface AlertDigestRepo {
+  listUnsentAlertsForDigest(): Promise<UnsentAlertRow[]>;
+  markAlertsEmailed(alertIds: string[]): Promise<void>;
+}
+
+export interface AlertDigestDeps {
+  repo: AlertDigestRepo;
+  email: EmailProvider;
+  logger: Logger;
+  /** Trusted public origin, e.g. NEXT_PUBLIC_SITE_URL. Used to build the panel link. */
+  siteUrl: string;
+  /** From address for the digest email. */
+  fromEmail: string;
+}
+
+export interface AlertDigestResult {
+  sessionsNotified: number;
+  alertsEmailed: number;
+  failures: number;
+}
+
+const KIND_LABEL: Record<UnsentAlertRow["kind"], string> = {
+  dropped_out_of_top10: "İlk 10'dan düştü",
+  entered_top10: "İlk 10'a girdi",
+  significant_drop: "Belirgin düşüş",
+  significant_rise: "Belirgin yükseliş",
+};
+
+function formatDate(date: Date): string {
+  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
+}
+
+function lineText(alert: UnsentAlertRow): string {
+  const base = `"${alert.keyword}" (${alert.domain}): ${KIND_LABEL[alert.kind]}`;
+  if (alert.kind === "dropped_out_of_top10") return `${base} (önceki #${alert.from_position})`;
+  if (alert.kind === "entered_top10") return `${base} (#${alert.to_position})`;
+  return `${base} (#${alert.from_position} → #${alert.to_position})`;
+}
+
+function groupBySession(rows: UnsentAlertRow[]): Map<string, UnsentAlertRow[]> {
+  const groups = new Map<string, UnsentAlertRow[]>();
+  for (const r of rows) {
+    const list = groups.get(r.sessionId) ?? [];
+    list.push(r);
+    groups.set(r.sessionId, list);
+  }
+  return groups;
+}
+
+/**
+ * Send one digest email per consenting session that has unsent alerts, then
+ * mark those alerts as emailed. Runs inside the daily tracker_scan job after
+ * the scan loop. A provider failure for one session leaves its alerts
+ * `emailed_at` NULL so the next day's digest naturally retries them.
+ */
+export async function runAlertDigest(deps: AlertDigestDeps): Promise<AlertDigestResult> {
+  const rows = await deps.repo.listUnsentAlertsForDigest();
+  if (rows.length === 0) {
+    return { sessionsNotified: 0, alertsEmailed: 0, failures: 0 };
+  }
+
+  const groups = groupBySession(rows);
+  let sessionsNotified = 0;
+  let alertsEmailed = 0;
+  let failures = 0;
+  const allEmailedIds: string[] = [];
+
+  for (const [sessionId, alerts] of groups) {
+    const first = alerts[0]!;
+    const subject = `SeoVista takip uyarıları — ${formatDate(new Date())}`;
+    const bodyLines = alerts.map(lineText);
+    const panelUrl = `${deps.siteUrl.replace(/\/$/, "")}/tracker/${first.token}`;
+    const textBody = `${bodyLines.join("\n")}\n\nUyarılarınızı görmek için: ${panelUrl}`;
+
+    const payload: EmailPayload = {
+      to: { email: first.email },
+      from: { email: deps.fromEmail },
+      subject,
+      textBody,
+      consent: {
+        marketing: true,
+        analytics: false,
+        timestamp: first.alert_consent_updated_at?.toISOString() ?? new Date().toISOString(),
+      },
+      source: "tracker-alerts",
+      scenario: "success",
+    };
+
+    const outcome = await deps.email.send(payload);
+    if (outcome.success) {
+      sessionsNotified += 1;
+      alertsEmailed += alerts.length;
+      allEmailedIds.push(...alerts.map((a) => a.alertId));
+    } else {
+      failures += 1;
+      deps.logger(
+        JSON.stringify({
+          name: "@seovista/worker",
+          layer: "tracker-alerts",
+          event: "digest_send_failed",
+          sessionId,
+          code: outcome.error?.code,
+          message: outcome.error?.message,
+          timestamp: new Date().toISOString(),
+        }),
+      );
+    }
+  }
+
+  if (allEmailedIds.length > 0) {
+    await deps.repo.markAlertsEmailed(allEmailedIds);
+  }
+
+  deps.logger(
+    JSON.stringify({
+      name: "@seovista/worker",
+      layer: "tracker-alerts",
+      event: "digest_complete",
+      sessionsNotified,
+      alertsEmailed,
+      failures,
+      timestamp: new Date().toISOString(),
+    }),
+  );
+
+  return { sessionsNotified, alertsEmailed, failures };
+}
diff --git a/apps/worker/src/index.ts b/apps/worker/src/index.ts
index 0a2b45a..5465536 100644
--- a/apps/worker/src/index.ts
+++ b/apps/worker/src/index.ts
@@ -115,11 +115,13 @@ export {
   type CrewReportWorkerOptions,
 } from "./queue/crew-report-worker.js";
 export {
   CrewAgencyClient,
   CrewAgencyError,
   resolveCrewAgencyClient,
   type CrewAgencyErrorCode,
   type CrewAgencyClientOptions,
   type CrewJobStatus,
 } from "./utils/crew-agency-client.js";
+export { evaluateTransition, type AlertKind } from "./alerts/alert-evaluator.js";
+export { runAlertDigest, type AlertDigestDeps, type AlertDigestResult } from "./alerts/alert-digest.js";
 
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index f33db1a..7d8a460 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -166,20 +166,23 @@ importers:
     dependencies:
       '@seovista/audit-core':
         specifier: workspace:*
         version: link:../../packages/audit-core
       '@seovista/content-models':
         specifier: workspace:*
         version: link:../../packages/content-models
       '@seovista/geo-engine':
         specifier: workspace:*
         version: link:../../packages/geo-engine
+      '@seovista/reports':
+        specifier: workspace:*
+        version: link:../../packages/reports
       '@seovista/schema':
         specifier: workspace:*
         version: link:../../packages/schema
       '@seovista/search-visibility':
         specifier: workspace:*
         version: link:../../packages/search-visibility
       '@seovista/seo-core':
         specifier: workspace:*
         version: link:../../packages/seo-core
       bullmq:
