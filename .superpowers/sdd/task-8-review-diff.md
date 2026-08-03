91c90e5 feat(web): render tracker alerts section and consent toggle on dashboard

 apps/web/app/tracker/[token]/page.tsx              | 11 ++++-
 apps/web/src/__tests__/tracker-alerts-list.test.ts | 36 +++++++++++++++++
 apps/web/src/__tests__/tracker-pages.test.ts       |  8 +++-
 apps/web/src/components/tracker/alerts-list.tsx    | 47 ++++++++++++++++++++++
 apps/web/src/components/tracker/consent-toggle.tsx | 39 ++++++++++++++++++
 apps/web/src/lib/tracker/actions.ts                | 26 ++++++++++--
 apps/worker/src/db/index.ts                        |  1 +
 7 files changed, 163 insertions(+), 5 deletions(-)

diff --git a/apps/web/app/tracker/[token]/page.tsx b/apps/web/app/tracker/[token]/page.tsx
index 0a88f23..cd6adde 100644
--- a/apps/web/app/tracker/[token]/page.tsx
+++ b/apps/web/app/tracker/[token]/page.tsx
@@ -1,14 +1,16 @@
 import { notFound } from "next/navigation";
-import { listTrackerTargetsAction } from "../../../src/lib/tracker/actions";
+import { listTrackerTargetsAction, listAlertsAction } from "../../../src/lib/tracker/actions";
 import { TrackerTargetCard } from "../../../src/components/tracker/tracker-target-card";
 import { AddTargetForm } from "../../../src/components/tracker/add-target-form";
+import { ConsentToggle } from "../../../src/components/tracker/consent-toggle";
+import { AlertsList } from "../../../src/components/tracker/alerts-list";
 
 export const dynamic = "force-dynamic";
 
 const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 
 export async function generateMetadata() {
   return {
     title: "Takip Paneli - SeoVista",
     robots: { index: false, follow: false, nocache: true },
   };
@@ -17,20 +19,22 @@ export async function generateMetadata() {
 export default async function TrackerTokenPage({
   params,
 }: {
   params: Promise<{ token: string }>;
 }) {
   const { token } = await params;
 
   if (!TOKEN_RE.test(token)) notFound();
 
   const result = await listTrackerTargetsAction(token);
+  const alertsResult = await listAlertsAction(token);
+  const alerts = alertsResult.success ? alertsResult.alerts : [];
 
   if (!result.success) {
     notFound();
   }
 
   return (
     <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
       <div className="max-w-4xl mx-auto space-y-6">
         <div className="flex items-start justify-between gap-4">
           <div>
@@ -52,20 +56,25 @@ export default async function TrackerTokenPage({
         </div>
 
         <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
           <p className="text-sm text-slate-600">
             Hesap: <span className="font-mono font-medium text-slate-800">{result.email}</span>
           </p>
         </div>
 
         <AddTargetForm token={token} />
 
+        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
+          <ConsentToggle token={token} current={result.consent} />
+          <AlertsList alerts={alerts} email={result.email} token={token} />
+        </div>
+
         {result.targets.length === 0 ? (
           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
             <p className="text-slate-600">
               Henüz takip edilen anahtar kelime yok. Yukarıdaki formdan yeni bir hedef ekleyebilirsiniz.
             </p>
           </div>
         ) : (
           <div className="space-y-4">
             {result.targets.map((target) => (
               <TrackerTargetCard key={target.id} target={target} token={token} />
diff --git a/apps/web/src/__tests__/tracker-alerts-list.test.ts b/apps/web/src/__tests__/tracker-alerts-list.test.ts
new file mode 100644
index 0000000..fc64d86
--- /dev/null
+++ b/apps/web/src/__tests__/tracker-alerts-list.test.ts
@@ -0,0 +1,36 @@
+import { describe, it, expect } from "vitest";
+import React from "react";
+import { renderToStaticMarkup } from "react-dom/server";
+import { AlertsList } from "../../src/components/tracker/alerts-list";
+
+describe("AlertsList", () => {
+  it("renders the alerts heading and kind labels", () => {
+    const el = React.createElement(AlertsList, {
+      alerts: [
+        { id: "a1", kind: "dropped_out_of_top10", fromPosition: 4, toPosition: 0, observedAt: "2026-08-03T03:00:00.000Z", keyword: "seo", domain: "a.com" },
+        { id: "a2", kind: "significant_rise", fromPosition: 8, toPosition: 3, observedAt: "2026-08-02T03:00:00.000Z", keyword: "sem", domain: "a.com" },
+      ],
+      email: "user@example.com",
+      token: "************************************",
+    });
+    const markup = decodeEntities(renderToStaticMarkup(el));
+    expect(markup).toContain("Uyarılar");
+    expect(markup).toContain("İlk 10'dan düştü");
+    expect(markup).toContain("Belirgin yükseliş");
+    expect(countTag(markup, "h2")).toBe(1);
+  });
+
+  it("renders the empty state when there are no alerts", () => {
+    const el = React.createElement(AlertsList, { alerts: [], email: "a@example.com", token: "************************************" });
+    const markup = decodeEntities(renderToStaticMarkup(el));
+    expect(markup).toContain("Henüz uyarı yok");
+  });
+});
+
+function countTag(markup: string, tag: string): number {
+  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
+}
+
+function decodeEntities(markup: string): string {
+  return markup.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
+}
diff --git a/apps/web/src/__tests__/tracker-pages.test.ts b/apps/web/src/__tests__/tracker-pages.test.ts
index 1b2d802..5a2aebe 100644
--- a/apps/web/src/__tests__/tracker-pages.test.ts
+++ b/apps/web/src/__tests__/tracker-pages.test.ts
@@ -6,34 +6,37 @@
  * Follows the keyword-rank-result-states.test.ts pattern: async page
  * components are awaited to resolve their RSC promises, then the resulting
  * React element is passed to renderToStaticMarkup.
  */
 import { describe, it, expect, vi, beforeAll } from "vitest";
 import { randomUUID } from "node:crypto";
 import React from "react";
 import { renderToStaticMarkup } from "react-dom/server";
 
 const mockListTrackerTargets = vi.fn();
+const mockListAlerts = vi.fn();
 
 vi.mock("@seovista/worker", () => ({
   createTrackerRepository: vi.fn(),
 }));
 
 vi.mock("@/lib/admin/db", () => ({
   getAdminDb: vi.fn(),
 }));
 
 vi.mock("@/lib/tracker/actions", () => ({
   createTrackerTargetAction: vi.fn(),
   createTrackerTargetForSessionAction: vi.fn(),
   listTrackerTargetsAction: mockListTrackerTargets,
+  listAlertsAction: mockListAlerts,
   deactivateTrackerTargetAction: vi.fn(),
+  updateAlertConsentAction: vi.fn(),
 }));
 
 vi.mock("next/navigation", () => ({
   notFound: () => {
     throw new Error("NEXT_NOT_FOUND");
   },
   useRouter: () => ({ refresh: vi.fn() }),
 }));
 
 // ---------------------------------------------------------------------------
@@ -54,21 +57,22 @@ let TrackerPage: () => React.ReactElement;
 let TrackerTokenPage: (props: { params: Promise<{ token: string }> }) => Promise<React.ReactElement>;
 
 beforeAll(async () => {
   const trackerMod = await import("../../app/tracker/page");
   TrackerPage = trackerMod.default;
 
   const tokenMod = await import("../../app/tracker/[token]/page");
   TrackerTokenPage = tokenMod.default;
 
   // Mock listTrackerTargetsAction to return an empty list by default
-  mockListTrackerTargets.mockResolvedValue({ success: true, targets: [], email: "user@example.com" });
+  mockListTrackerTargets.mockResolvedValue({ success: true, targets: [], email: "user@example.com", consent: true });
+  mockListAlerts.mockResolvedValue({ success: true, alerts: [] });
 });
 
 describe("Tracker pages landmark contract", () => {
   it("/tracker page renders one main landmark with id=main and one h1", () => {
     const markup = renderToStaticMarkup(React.createElement(TrackerPage));
     expect(countTag(markup, "main")).toBe(1);
     expect(markup).toContain('id="main"');
     expect(countTag(markup, "h1")).toBe(1);
   });
 
@@ -115,20 +119,21 @@ describe("Tracker [token] page card layout", () => {
     const markup = renderToStaticMarkup(el);
     expect(markup).toContain('name="keyword"');
     expect(markup).toContain('name="domain"');
   });
 
   it("renders empty state text when no targets", async () => {
     mockListTrackerTargets.mockResolvedValueOnce({
       success: true,
       targets: [],
       email: "user@example.com",
+      consent: false,
     });
     const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
     const markup = renderToStaticMarkup(el);
     expect(markup).toContain("Henüz takip edilen anahtar kelime yok");
   });
 
   it("renders an h2 for each target card when targets exist", async () => {
     mockListTrackerTargets.mockResolvedValueOnce({
       success: true,
       targets: [
@@ -142,19 +147,20 @@ describe("Tracker [token] page card layout", () => {
           lastCheckedAt: new Date("2026-08-01"),
           latestPosition: 3,
           latestCheckedAt: "2026-08-01T03:00:00.000Z",
           recentObservations: [
             { position: 5, checkedAt: "2026-07-31T03:00:00.000Z", topCompetitors: [] },
             { position: 3, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [] },
           ],
         },
       ],
       email: "user@example.com",
+      consent: true,
     });
     const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
     const markup = renderToStaticMarkup(el);
     expect(markup).toContain("seo test");
     expect(countTag(markup, "h2")).toBeGreaterThanOrEqual(1);
     // Still only one h1
     expect(countTag(markup, "h1")).toBe(1);
   });
 });
diff --git a/apps/web/src/components/tracker/alerts-list.tsx b/apps/web/src/components/tracker/alerts-list.tsx
new file mode 100644
index 0000000..9d47977
--- /dev/null
+++ b/apps/web/src/components/tracker/alerts-list.tsx
@@ -0,0 +1,47 @@
+import type { AlertSummary } from "@seovista/worker";
+
+const KIND_LABEL: Record<string, string> = {
+  dropped_out_of_top10: "İlk 10'dan düştü",
+  entered_top10: "İlk 10'a girdi",
+  significant_drop: "Belirgin düşüş",
+  significant_rise: "Belirgin yükseliş",
+};
+
+function formatDate(iso: string): string {
+  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
+}
+
+function detailText(alert: AlertSummary): string {
+  if (alert.kind === "dropped_out_of_top10") return `#${alert.fromPosition} → İlk 10'da yok`;
+  if (alert.kind === "entered_top10") return `İlk 10'da yok → #${alert.toPosition}`;
+  return `#${alert.fromPosition} → #${alert.toPosition}`;
+}
+
+export function AlertsList({ alerts }: { alerts: AlertSummary[]; email: string; token: string }) {
+  return (
+    <section>
+      <h2 className="text-lg font-semibold text-slate-900">Uyarılar</h2>
+      {alerts.length === 0 ? (
+        <p className="text-sm text-slate-600 mt-2">
+          Henüz uyarı yok. Pozisyon değişikliklerinde burada görünecek.
+        </p>
+      ) : (
+        <ul className="mt-2 space-y-2">
+          {alerts.map((alert) => (
+            <li key={alert.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
+              <div className="flex items-center justify-between gap-2">
+                <span className="font-medium text-slate-900">{alert.keyword}</span>
+                <span className="font-mono text-slate-500">{alert.domain}</span>
+              </div>
+              <div className="mt-1 text-slate-700">
+                <span className="font-semibold">{KIND_LABEL[alert.kind] ?? alert.kind}</span>
+                <span className="text-slate-500"> · {detailText(alert)}</span>
+              </div>
+              <p className="mt-1 text-xs text-slate-400">{formatDate(alert.observedAt)}</p>
+            </li>
+          ))}
+        </ul>
+      )}
+    </section>
+  );
+}
diff --git a/apps/web/src/components/tracker/consent-toggle.tsx b/apps/web/src/components/tracker/consent-toggle.tsx
new file mode 100644
index 0000000..a97cdda
--- /dev/null
+++ b/apps/web/src/components/tracker/consent-toggle.tsx
@@ -0,0 +1,39 @@
+"use client";
+
+import { useState, useTransition } from "react";
+import { useRouter } from "next/navigation";
+import { updateAlertConsentAction } from "../../lib/tracker/actions";
+
+export function ConsentToggle({ token, current }: { token: string; current: boolean }) {
+  const router = useRouter();
+  const [isPending, startTransition] = useTransition();
+  const [error, setError] = useState<string | null>(null);
+
+  async function handleChange(next: boolean) {
+    setError(null);
+    startTransition(async () => {
+      const result = await updateAlertConsentAction(token, next);
+      if (!result.success) {
+        setError(result.error ?? "E-posta uyarı tercihi güncellenemedi.");
+        return;
+      }
+      router.refresh();
+    });
+  }
+
+  return (
+    <div className="flex items-center gap-3">
+      <label className="flex items-center gap-2 text-sm text-slate-700">
+        <input
+          type="checkbox"
+          checked={current}
+          disabled={isPending}
+          onChange={(e) => handleChange(e.target.checked)}
+          className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
+        />
+        E-posta uyarıları: {current ? "Açık" : "Kapalı"}
+      </label>
+      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
+    </div>
+  );
+}
diff --git a/apps/web/src/lib/tracker/actions.ts b/apps/web/src/lib/tracker/actions.ts
index 5b28b12..37085a2 100644
--- a/apps/web/src/lib/tracker/actions.ts
+++ b/apps/web/src/lib/tracker/actions.ts
@@ -1,16 +1,16 @@
 "use server";
 
 import { headers } from "next/headers";
 import { revalidatePath } from "next/cache";
 import { getAdminDb } from "../admin/db";
-import { checkIpRateLimit, createTrackerRepository, type TargetWithObservations } from "@seovista/worker";
+import { checkIpRateLimit, createTrackerRepository, type TargetWithObservations, type AlertSummary } from "@seovista/worker";
 import { extractClientIp } from "../geo-checker/ip";
 import { validateTrackerTargetInput, validateTrackerSessionTargetInput } from "./validation";
 
 export type TrackerTargetActionState = {
   status: "idle" | "error" | "success";
   token?: string;
   errors?: {
     email?: string[];
     keyword?: string[];
     domain?: string[];
@@ -129,44 +129,64 @@ export async function createTrackerTargetAction(
     return {
       status: "error",
       errors: {
         form: ["Sistem hatası nedeniyle hedef eklenemedi. Lütfen daha sonra tekrar deneyiniz."],
       },
     };
   }
 }
 
 export type TrackerTargetsResult =
-  | { success: true; targets: TargetWithObservations[]; email: string }
+  | { success: true; targets: TargetWithObservations[]; email: string; consent: boolean }
   | { success: false; error: string };
 
 export async function listTrackerTargetsAction(token: string): Promise<TrackerTargetsResult> {
   try {
     // getAdminDb() throws when DATABASE_URL is unset; keep the call inside
     // the try so the catch below returns the documented failure contract
     // instead of an unhandled 500.
     const db = getAdminDb();
     const repo = createTrackerRepository(db);
 
     const session = await repo.findSessionByToken(token);
     if (!session) {
       return { success: false, error: "Takip paneli bulunamadı." };
     }
 
     const targets = await repo.listTargetsByToken(token);
-    return { success: true, targets, email: session.email };
+    return { success: true, targets, email: session.email, consent: session.alert_consent };
   } catch (error) {
     console.error("Failed to list tracker targets:", error);
     return { success: false, error: "Takip paneli yüklenemedi." };
   }
 }
 
+export type AlertsResult =
+  | { success: true; alerts: AlertSummary[] }
+  | { success: false; error: string };
+
+export async function listAlertsAction(token: string, limit = 30): Promise<AlertsResult> {
+  try {
+    const db = getAdminDb();
+    const repo = createTrackerRepository(db);
+    const session = await repo.findSessionByToken(token);
+    if (!session) {
+      return { success: false, error: "Takip paneli bulunamadı." };
+    }
+    const alerts = await repo.listAlertsByToken(token, limit);
+    return { success: true, alerts };
+  } catch (error) {
+    console.error("Failed to list tracker alerts:", error);
+    return { success: false, error: "Uyarılar yüklenemedi." };
+  }
+}
+
 export async function deactivateTrackerTargetAction(
   token: string,
   targetId: string,
 ): Promise<{ success: boolean; error?: string }> {
   try {
     const db = getAdminDb();
     const repo = createTrackerRepository(db);
     const result = await repo.deactivateTarget(token, targetId);
     if (!result) {
       return { success: false, error: "Hedef bulunamadı veya bu panel tarafından sahiplenilmiyor." };
diff --git a/apps/worker/src/db/index.ts b/apps/worker/src/db/index.ts
index 222daf5..3e62f6b 100644
--- a/apps/worker/src/db/index.ts
+++ b/apps/worker/src/db/index.ts
@@ -67,11 +67,12 @@ export {
   type AdminSessionWithUser,
   type AdminUserStatus,
   type CreateAdminUser,
   type CreateAdminSession,
 } from "./admin-auth.js";
 export {
   createTrackerRepository,
   type ActiveTarget,
   type TargetWithObservations,
   type SessionInfo,
+  type AlertSummary,
 } from "./tracker-repository.js";
