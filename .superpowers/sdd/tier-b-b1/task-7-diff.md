## Commits
848ad78 feat(web): 'takip et' button on keyword-rank result page

## Stat
 .../keyword-rank-checker/result/[jobId]/page.tsx   |  6 ++
 .../__tests__/tracker-track-this-button.test.ts    | 22 ++++++
 .../src/components/tracker/track-this-button.tsx   | 87 ++++++++++++++++++++++
 3 files changed, 115 insertions(+)

## Full Diff
diff --git a/apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx b/apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx
index b43424f..56b2f54 100644
--- a/apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx
+++ b/apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx
@@ -1,15 +1,16 @@
 import { SERP_LOCALES } from "@seovista/seo-core";
 import type { KeywordRankResultPayload } from "@seovista/worker";
 import { getAdminDb } from "../../../../../src/lib/admin/db";
 import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
 import { CrewReportSection } from "../../../../../src/components/crew-report/crew-report-section";
+import { TrackThisButton } from "../../../../../src/components/tracker/track-this-button";
 import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";
 import {
   normalizeJobResultStatus,
   UnknownJobStatusView,
 } from "../../../../../src/lib/admin/job-result-guard";
 
 export const dynamic = "force-dynamic";
 
 const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 
@@ -286,20 +287,25 @@ export default async function KeywordRankJobResultPage({
                       )}
                     </td>
                     <td className="py-2 font-mono text-xs text-slate-600 break-all">{entry.url}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         </div>
 
+        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
+          <h2 className="text-lg font-bold text-slate-900 mb-4">Günlük Takip</h2>
+          <TrackThisButton keyword={safePayload.keyword} domain={safePayload.domain} />
+        </div>
+
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
           <a
             href="/tools/geo-readiness-checker/"
             className="block text-sm font-semibold text-slate-900 hover:text-slate-600 transition-colors"
           >
             GEO Hazırlık Denetimi ile sitenizi AI aramaya hazırlayın →
           </a>
         </div>
 
         <CrewReportSection sourceJobId={jobId} tool="keyword-rank" />
diff --git a/apps/web/src/__tests__/tracker-track-this-button.test.ts b/apps/web/src/__tests__/tracker-track-this-button.test.ts
new file mode 100644
index 0000000..cc4f96e
--- /dev/null
+++ b/apps/web/src/__tests__/tracker-track-this-button.test.ts
@@ -0,0 +1,22 @@
+/**
+ * TrackThisButton contract test — verifies the component renders the
+ * "Bu anahtarı takip et" CTA in its initial (collapsed) state.
+ * The expanded form with email input is tested via e2e (B1 minimal).
+ */
+import { describe, it, expect, vi } from "vitest";
+import React from "react";
+import { renderToStaticMarkup } from "react-dom/server";
+
+vi.mock("@/lib/tracker/actions", () => ({
+  createTrackerTargetAction: vi.fn(),
+}));
+
+describe("TrackThisButton", () => {
+  it("renders the track-this CTA with Turkish text in collapsed state", async () => {
+    const { TrackThisButton } = await import("../components/tracker/track-this-button");
+    const markup = renderToStaticMarkup(
+      React.createElement(TrackThisButton, { keyword: "seo denetimi", domain: "example.com" }),
+    );
+    expect(markup).toContain("Bu Anahtarı Takip Et");
+  });
+});
diff --git a/apps/web/src/components/tracker/track-this-button.tsx b/apps/web/src/components/tracker/track-this-button.tsx
new file mode 100644
index 0000000..7dddbf4
--- /dev/null
+++ b/apps/web/src/components/tracker/track-this-button.tsx
@@ -0,0 +1,87 @@
+"use client";
+
+import { useState, useActionState } from "react";
+import {
+  createTrackerTargetAction,
+  type TrackerTargetActionState,
+} from "../../lib/tracker/actions";
+
+const initialState: TrackerTargetActionState = { status: "idle" };
+
+export function TrackThisButton({ keyword, domain }: { keyword: string; domain: string }) {
+  const [expanded, setExpanded] = useState(false);
+  const [state, formAction, isPending] = useActionState(
+    createTrackerTargetAction,
+    initialState,
+  );
+
+  if (state.status === "success" && state.token) {
+    return (
+      <div className="rounded-lg border border-green-200 bg-green-50 p-4" role="status">
+        <p className="text-sm font-semibold text-green-800 mb-2">
+          Takibe alındı! Günlük olarak kontrol edilecek.
+        </p>
+        <a
+          href={`/tracker/${state.token}`}
+          className="text-sm font-semibold text-green-700 underline hover:text-green-800"
+        >
+          Takip panelinize gidin →
+        </a>
+      </div>
+    );
+  }
+
+  if (!expanded) {
+    return (
+      <button
+        type="button"
+        onClick={() => setExpanded(true)}
+        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
+      >
+        Bu Anahtarı Takip Et
+      </button>
+    );
+  }
+
+  return (
+    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
+      <p className="text-sm font-semibold text-slate-900">
+        Bu anahtarı günlük takibe alın
+      </p>
+      <p className="text-xs text-slate-600">
+        Anahtar kelime: <span className="font-medium">{keyword}</span> · Alan adı:{" "}
+        <span className="font-mono">{domain}</span>
+      </p>
+      <form action={formAction} className="space-y-3">
+        <input type="hidden" name="keyword" value={keyword} />
+        <input type="hidden" name="domain" value={domain} />
+        <div>
+          <label htmlFor="track-email" className="block text-sm font-medium text-slate-700 mb-1">
+            E-posta
+          </label>
+          <input
+            id="track-email"
+            name="email"
+            type="email"
+            required
+            placeholder="ornek@email.com"
+            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
+          />
+          {state.errors?.email && (
+            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.email[0]}</p>
+          )}
+        </div>
+        {state.errors?.form && (
+          <p className="text-sm text-red-600" role="alert">{state.errors.form[0]}</p>
+        )}
+        <button
+          type="submit"
+          disabled={isPending}
+          className="w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
+        >
+          {isPending ? "Ekleniyor..." : "Takibe Başla"}
+        </button>
+      </form>
+    </div>
+  );
+}
