BASE: d4d71d6
HEAD: 1bc50ac

STAT:
 .../src/__tests__/crew-report-processor.test.ts      | 20 +++++++++++++++++---
 apps/worker/src/processors/crew-report.ts            |  4 +++-
 2 files changed, 20 insertions(+), 4 deletions(-)

DIFF:
diff --git a/apps/worker/src/__tests__/crew-report-processor.test.ts b/apps/worker/src/__tests__/crew-report-processor.test.ts
index d3483ad..b461730 100644
--- a/apps/worker/src/__tests__/crew-report-processor.test.ts
+++ b/apps/worker/src/__tests__/crew-report-processor.test.ts
@@ -194,28 +194,42 @@ describe("buildCrewReportRequest", () => {
       sourcePayload: {
         target: "https://example.com",
         scores: { overall: 42 },
         issues: [{ code: "huge", title: "x".repeat(6000), severity: "high" }],
       },
     });
 
     const body = request.body as { raw_data_context: string };
     expect(body.raw_data_context.length).toBeLessThanOrEqual(4000);
     expect(body.raw_data_context.endsWith("…")).toBe(true);
   });
 
-  it("throws for an unknown tool", () => {
+  it("buildCrewReportRequest throws a validation-coded error for an unknown tool", () => {
     expect(() =>
-      buildCrewReportRequest({ tool: "unknown-tool" as never, sourcePayload: {} }),
-    ).toThrow(/unknown/i);
+      buildCrewReportRequest({
+        tool: "bogus" as never,
+        sourcePayload: {},
+        sourceTarget: undefined,
+      }),
+    ).toThrow(/Unknown crew report tool/);
+
+    try {
+      buildCrewReportRequest({
+        tool: "bogus" as never,
+        sourcePayload: {},
+        sourceTarget: undefined,
+      });
+    } catch (err) {
+      expect((err as Error & { code?: string }).code).toBe("validation.crew_report");
+    }
   });
 });
 
 describe("buildCrewReportResultPayload", () => {
   it("builds the persisted crew-report payload without a score", () => {
     const payload = buildCrewReportResultPayload({
       sourceJobId: "source-job-1",
       tool: "geo-readiness",
       endpoint: "/api/rapor-uret",
       reportMarkdown: "# AI Strateji Raporu\n\nİçerik",
       crewJobId: "crew-job-1",
     });
diff --git a/apps/worker/src/processors/crew-report.ts b/apps/worker/src/processors/crew-report.ts
index cb855b4..d9563f9 100644
--- a/apps/worker/src/processors/crew-report.ts
+++ b/apps/worker/src/processors/crew-report.ts
@@ -82,25 +82,27 @@ export interface CrewReportRequest {
 
 /**
  * Builds the CrewAgency kickoff request for a tool. Keyword rank checks map
  * to `/api/seo-brief` with `{ konu, brand_context, dil }`; the audit tools
  * map to `/api/rapor-uret` with the live contract `{ rapor_konusu,
  * raw_data_context, brand_context?, dil }`. Unknown tools throw — the worker
  * maps that to a permanent failure.
  */
 export function buildCrewReportRequest(input: BuildCrewReportRequestInput): CrewReportRequest {
   const { tool, sourcePayload, sourceTarget } = input;
 
   if (!isCrewReportTool(tool)) {
-    throw new Error(`Unknown crew report tool: ${String(tool)}`);
+    // Validation-coded so the worker's terminal-status mapper treats this as
+    // 'permanent' (an unknown tool will never become valid on retry).
+    throw validationCrewReportError(`Unknown crew report tool: ${String(tool)}`);
   }
 
   const record = isRecord(sourcePayload) ? sourcePayload : {};
 
   if (tool === "keyword-rank") {
     const keyword = pickString(record, ["keyword"]);
     const domain = pickString(record, ["domain"]);
     if (!keyword || !domain) {
       // Validation-coded so the worker maps it to 'permanent': a malformed
       // source payload will never change, so retrying is pointless.
       throw validationCrewReportError(
         "keyword-rank source payload must include non-empty keyword and domain strings",
