BASE: 5718ae3
HEAD: d4d71d6

STAT:
 apps/worker/src/processors/ai-crawler-audit.ts | 33 ++------------------------
 packages/seo-core/src/__tests__/robots.test.ts | 17 +++++++++++++
 packages/seo-core/src/index.ts                 |  1 +
 packages/seo-core/src/robots.ts                | 13 +++++++++-
 4 files changed, 32 insertions(+), 32 deletions(-)

DIFF:
diff --git a/apps/worker/src/processors/ai-crawler-audit.ts b/apps/worker/src/processors/ai-crawler-audit.ts
index 1115b42..0e175a6 100644
--- a/apps/worker/src/processors/ai-crawler-audit.ts
+++ b/apps/worker/src/processors/ai-crawler-audit.ts
@@ -1,19 +1,19 @@
 import {
+  detectContradictoryRuleConflicts,
   detectRuleConflicts,
   evaluateAllCrawlers,
   parseRobotsTxt,
   type CrawlerCategory,
   type CrawlerAccessStatus,
-  type RobotsTxtDocument,
   type RuleConflict,
 } from "@seovista/seo-core";
 
 export interface AiCrawlerAuditResultPayload {
   readonly score: number;
   readonly robotsTxtFound: boolean;
   readonly robotsTxtUrl: string;
   readonly sitemaps: readonly string[];
   readonly crawlers: ReadonlyArray<{
     userAgent: string;
     label: string;
     category: CrawlerCategory;
@@ -21,62 +21,33 @@ export interface AiCrawlerAuditResultPayload {
   }>;
   readonly conflicts: readonly RuleConflict[];
   readonly recommendations: readonly string[];
   readonly parseErrors: readonly string[];
 }
 
 const BLOCK_PENALTY_SEARCH = 12;
 const CONFLICT_PENALTY = 8;
 const CONFLICT_PENALTY_CAP = 24;
 const MISSING_ROBOTS_CAP = 60;
 const MISSING_SITEMAP_PENALTY = 5;
 
-/**
- * Detects genuine rule contradictions: the same path carrying both an Allow
- * and a Disallow rule inside one group.
- *
- * Deliberately NOT counted here: the `detectRuleConflicts` notices about a
- * user-agent-specific full block while the wildcard group stays open. Those
- * describe intentional per-bot policies (e.g. `GPTBot: Disallow /`), not
- * misconfigurations — the PRD honesty rules state that blocking AI training
- * bots is a legitimate policy choice and must never be scored or surfaced as
- * a defect, so only true Allow/Disallow contradictions carry a penalty.
- */
-function findContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
-  const conflicts: RuleConflict[] = [];
-  for (const group of doc.groups) {
-    const allows = new Set(
-      group.rules.filter((r) => r.type === "allow").map((r) => r.pattern),
-    );
-    for (const rule of group.rules) {
-      if (rule.type === "disallow" && allows.has(rule.pattern)) {
-        conflicts.push({
-          description: `Aynı yol için hem Allow hem Disallow kuralı tanımlı: ${rule.pattern}`,
-          lines: [`user-agent: ${group.userAgents.join(", ")} (satır ${group.line})`],
-        });
-      }
-    }
-  }
-  return conflicts;
-}
-
 export function processAiCrawlerAuditPayload(
   robotsTxtContent: string | null,
   robotsTxtUrl: string,
 ): AiCrawlerAuditResultPayload {
   const found = robotsTxtContent !== null;
   const doc = parseRobotsTxt(robotsTxtContent ?? "");
   const crawlers = evaluateAllCrawlers(doc);
   const conflicts = found ? detectRuleConflicts(doc) : [];
-  const contradictoryConflicts = found ? findContradictoryRuleConflicts(doc) : [];
+  const contradictoryConflicts = found ? detectContradictoryRuleConflicts(doc) : [];
   const recommendations: string[] = [];
 
   let penalty = 0;
   for (const crawler of crawlers) {
     if (crawler.status === "blocked" && crawler.category !== "ai-training") {
       penalty += BLOCK_PENALTY_SEARCH;
       if (crawler.category === "search") {
         recommendations.push(
           `${crawler.label} tamamen engellenmiş — geleneksel arama sonuçlarında görünürlüğünüz azalır. Engellemek istemiyorsanız ilgili Disallow kuralını kaldırın.`,
         );
       } else {
         recommendations.push(
diff --git a/packages/seo-core/src/__tests__/robots.test.ts b/packages/seo-core/src/__tests__/robots.test.ts
index 6eac805..6e23b65 100644
--- a/packages/seo-core/src/__tests__/robots.test.ts
+++ b/packages/seo-core/src/__tests__/robots.test.ts
@@ -1,15 +1,16 @@
 import { describe, expect, it } from "vitest";
 import {
   detectRuleConflicts,
+  detectContradictoryRuleConflicts,
   evaluateCrawlerAccess,
   isPathAllowed,
   parseRobotsTxt,
 } from "../robots";
 
 const SAMPLE = `
 # comment line
 User-agent: *
 Disallow: /admin
 Allow: /admin/public
 Sitemap: https://example.com/sitemap.xml
 
@@ -138,12 +139,28 @@ describe("parseRobotsTxt edge cases", () => {
   it("skips an empty Sitemap value", () => {
     const doc = parseRobotsTxt("User-agent: *\nDisallow:\nSitemap:\n");
     expect(doc.sitemaps).toHaveLength(0);
   });
 });
 
 describe("isPathAllowed tie-break", () => {
   it("allow wins when Allow and Disallow patterns have equal length", () => {
     const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
     expect(isPathAllowed(doc, "Googlebot", "/x")).toBe(true);
   });
 });
+
+describe("detectContradictoryRuleConflicts", () => {
+  it("detects same-pattern allow+disallow in one group", () => {
+    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
+    const conflicts = detectContradictoryRuleConflicts(doc);
+    expect(conflicts).toHaveLength(1);
+    expect(conflicts[0]?.description).toContain("/x");
+  });
+
+  it("does NOT report the wildcard-policy-vs-UA-full-block conflict (that stays in detectRuleConflicts)", () => {
+    const doc = parseRobotsTxt("User-agent: *\nDisallow:\nUser-agent: GPTBot\nDisallow: /\n");
+    expect(detectContradictoryRuleConflicts(doc)).toHaveLength(0);
+    // The full detectRuleConflicts DOES report it:
+    expect(detectRuleConflicts(doc).length).toBeGreaterThan(0);
+  });
+});
diff --git a/packages/seo-core/src/index.ts b/packages/seo-core/src/index.ts
index 76c0877..d36c2e7 100644
--- a/packages/seo-core/src/index.ts
+++ b/packages/seo-core/src/index.ts
@@ -58,24 +58,25 @@ export type {
   RobotsGroup as RobotsTxtGroup,
   RobotsTxtDocument,
   CrawlerAccessStatus,
   RuleConflict,
 } from "./robots.js";
 
 export {
   parseRobotsTxt,
   robotsPatternMatches,
   isPathAllowed,
   evaluateCrawlerAccess,
   detectRuleConflicts,
+  detectContradictoryRuleConflicts,
 } from "./robots.js";
 
 export type {
   CrawlerCategory,
   CrawlerDescriptor,
   CrawlerEvaluation,
 } from "./ai-crawlers.js";
 
 export {
   AI_CRAWLER_REGISTRY,
   evaluateAllCrawlers,
 } from "./ai-crawlers.js";
diff --git a/packages/seo-core/src/robots.ts b/packages/seo-core/src/robots.ts
index 5310b2d..f10f437 100644
--- a/packages/seo-core/src/robots.ts
+++ b/packages/seo-core/src/robots.ts
@@ -122,37 +122,48 @@ export function evaluateCrawlerAccess(doc: RobotsTxtDocument, userAgent: string)
     g.rules.some((r) => r.type === "disallow"),
   );
   return restricted ? "partial" : "allowed";
 }
 
 export interface RuleConflict {
   readonly description: string;
   readonly lines: string[];
 }
 
 const FULL_BLOCK_PATTERNS = new Set(["/", "/*"]);
 
-export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
+/**
+ * Detects genuine rule contradictions: the same path carrying both an Allow
+ * and a Disallow rule inside one group. This is the narrow, penalty-relevant
+ * subset of {@link detectRuleConflicts} — the worker's AI-crawler audit uses
+ * it directly so it does not duplicate the logic (M1(a) drift fix).
+ */
+export function detectContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
   const conflicts: RuleConflict[] = [];
   for (const group of doc.groups) {
     const allows = new Set(group.rules.filter((r) => r.type === "allow").map((r) => r.pattern));
     for (const rule of group.rules) {
       if (rule.type === "disallow" && allows.has(rule.pattern)) {
         conflicts.push({
           description: `Aynı yol için hem Allow hem Disallow kuralı tanımlı: ${rule.pattern}`,
           lines: [`user-agent: ${group.userAgents.join(", ")} (satır ${group.line})`],
         });
       }
     }
   }
+  return conflicts;
+}
+
+export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
+  const conflicts: RuleConflict[] = detectContradictoryRuleConflicts(doc);
   const wildcards = doc.groups.filter((g) => g.userAgents.includes("*"));
   const wildcardFullBlock = wildcards.some((g) =>
     g.rules.some((r) => r.type === "disallow" && FULL_BLOCK_PATTERNS.has(r.pattern)),
   );
   if (wildcards.length > 0 && !wildcardFullBlock) {
     for (const group of doc.groups) {
       if (group.userAgents.includes("*")) continue;
       const fullBlock = group.rules.some(
         (r) => r.type === "disallow" && FULL_BLOCK_PATTERNS.has(r.pattern),
       );
       if (fullBlock) {
         conflicts.push({
