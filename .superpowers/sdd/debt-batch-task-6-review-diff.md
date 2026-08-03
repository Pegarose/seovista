BASE: af9be3b
HEAD: 5aa87e5

STAT:
 apps/worker/src/db/admin-seed.ts |  5 +++--
 apps/worker/src/db/dev-seed.ts   | 25 +++++++++++++------------
 apps/worker/src/utils/fetcher.ts |  8 ++++++--
 apps/worker/src/utils/logger.ts  | 17 +++++++++++++++++
 4 files changed, 39 insertions(+), 16 deletions(-)

DIFF:
diff --git a/apps/worker/src/db/admin-seed.ts b/apps/worker/src/db/admin-seed.ts
index 287856b..80fed55 100644
--- a/apps/worker/src/db/admin-seed.ts
+++ b/apps/worker/src/db/admin-seed.ts
@@ -1,40 +1,41 @@
 import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
 import { createDbClient, type DbClient } from "./client.js";
 import { createMigrationRunner, defaultMigrationsDir, type Migration } from "./migrations.js";
+import { stdoutLogger, type Logger } from "../utils/logger.js";
 
 export const DEFAULT_ADMIN_EMAIL = "admin@seovista.local";
 export const DEFAULT_ADMIN_DISPLAY_NAME = "SeoVista Local Operator";
 
 export interface AdminBootstrapResult {
   id: string;
   email: string;
   display_name: string;
   status: "active";
 }
 
 export type AdminBootstrapIdentity = Pick<AdminBootstrapResult, "id"> &
   Partial<Omit<AdminBootstrapResult, "id">>;
 
 export interface LocalAdminBootstrapEnvironment {
   NODE_ENV?: string;
   DATABASE_URL?: string;
   SEOVISTA_ADMIN_PASSWORD?: string;
 }
 
 export interface LocalAdminBootstrapDependencies {
   createClient?: (options: { connectionString: string; max: number }) => DbClient;
   applyMigrations?: (client: DbClient) => Promise<Migration[]>;
   ensureAdmin?: (client: DbClient, password: string) => Promise<AdminBootstrapIdentity>;
-  logger?: (...values: unknown[]) => void;
+  logger?: Logger;
 }
 
 export interface LocalAdminBootstrapResult {
   status: "skipped" | "created";
   admin?: AdminBootstrapIdentity;
 }
 
 function createAdminPasswordHash(password: string): string {
   const salt = randomBytes(16).toString("hex");
   return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
 }
 
@@ -112,25 +113,25 @@ export async function runLocalAdminBootstrap(
   environment: LocalAdminBootstrapEnvironment = process.env,
   dependencies: LocalAdminBootstrapDependencies = {},
 ): Promise<LocalAdminBootstrapResult> {
   const password = environment.SEOVISTA_ADMIN_PASSWORD;
   if (!password?.trim()) return { status: "skipped" };
 
   const connectionString = assertLocalBootstrapTarget(environment);
   const createClient = dependencies.createClient ?? ((options) => createDbClient(options));
   const client = createClient({ connectionString, max: 5 });
   const applyMigrations = dependencies.applyMigrations ?? ((db) =>
     createMigrationRunner(db, defaultMigrationsDir()).applyAll());
   const ensureAdmin = dependencies.ensureAdmin ?? ensureAdminBootstrap;
-  const logger = dependencies.logger ?? console.log;
+  const logger = dependencies.logger ?? stdoutLogger;
 
   try {
     const appliedMigrations = await applyMigrations(client);
     const admin = await ensureAdmin(client, password);
     logger("Local admin bootstrap completed", {
       adminId: admin.id,
       appliedMigrations: appliedMigrations.length,
     });
     return { status: "created", admin };
   } finally {
     await client.close();
   }
diff --git a/apps/worker/src/db/dev-seed.ts b/apps/worker/src/db/dev-seed.ts
index 576acfe..40a251e 100644
--- a/apps/worker/src/db/dev-seed.ts
+++ b/apps/worker/src/db/dev-seed.ts
@@ -1,46 +1,47 @@
 import { createDbClient } from "./client.js";
 import { createAdminAuthRepository } from "./admin-auth.js";
 import { createCmsRepository } from "./cms-repository.js";
 import { createGeoAuditRepository } from "./geo-audit-repository.js";
+import { stdoutLogger, type Logger } from "../utils/logger.js";
 
-async function main() {
+async function main(logger: Logger = stdoutLogger) {
   const connectionString = 
     process.env.DATABASE_URL || "postgresql://seovista:seovista@127.0.0.1:8543/seovista";
 
-  console.log(`Connecting to database at ${connectionString}...`);
+  logger(`Connecting to database at ${connectionString}...`);
   const dbClient = createDbClient({ connectionString });
 
   try {
     // 1. connection check
     await dbClient.query("SELECT 1");
-    console.log("Database connection successful.");
+    logger("Database connection successful.");
 
     const adminRepo = createAdminAuthRepository(dbClient);
     const cmsRepo = createCmsRepository(dbClient);
     const geoRepo = createGeoAuditRepository(dbClient);
 
     // 4. Admin
     const adminEmail = "admin@seovista.example";
     const existingAdmin = await adminRepo.findUserByEmail(adminEmail);
     if (!existingAdmin) {
       await adminRepo.createUser({
         email: adminEmail,
         displayName: "Admin",
         passwordHash: "admin123", // Assuming fake unhashed for dev seeding based on requirements
         status: "active"
       });
-      console.log(`Inserted admin: ${adminEmail}`);
+      logger(`Inserted admin: ${adminEmail}`);
     } else {
-      console.log(`Admin ${adminEmail} already exists. Skipping.`);
+      logger(`Admin ${adminEmail} already exists. Skipping.`);
     }
 
     // 5. Insights - checking existence by slug
     const insights = [
       {
         title: "The Mechanics of AI Visibility",
         slug: "mechanics-of-ai-visibility",
         blocks: [{ type: "paragraph", data: { text: "AI visibility relies on structured and verifiable data citations..." } }]
       },
       {
         title: "Citations as Currency in 2026",
         slug: "citations-as-currency-2026",
@@ -64,60 +65,60 @@ async function main() {
           entry_id: entry.id,
           revision_number: 1,
           schema_version: '1.0.0',
           content: {
             title: insight.title,
             body: insight.blocks
           },
           content_checksum: 'dev-seed-checksum',
           created_by: 'dev-seed'
         });
 
         await cmsRepo.updatePublicationState(entry.id, 'published', revision.id);
-        console.log(`Inserted published insight: ${insight.slug}`);
+        logger(`Inserted published insight: ${insight.slug}`);
       } else {
-        console.log(`Insight ${insight.slug} already exists. Skipping.`);
+        logger(`Insight ${insight.slug} already exists. Skipping.`);
       }
     }
 
     // 6. Leads
     const existingLeads = await geoRepo.getAllLeadsForAdmin();
     
     // Finished Lead
     if (!existingLeads.some(l => l.domain === 'completed-lead.local')) {
       const finishedLead = await geoRepo.createLead({
         domain: "completed-lead.local",
         brandName: "Completed Brand",
         primaryMarket: "US"
       });
       await dbClient.query('UPDATE geo_audit_leads SET work_email = $1, marketing_consent = $2 WHERE id = $3', ["lead@completed-lead.local", true, finishedLead.id]);
-      console.log(`Inserted finished lead: ${finishedLead.domain}`);
+      logger(`Inserted finished lead: ${finishedLead.domain}`);
     } else {
-      console.log(`Finished lead completed-lead.local already exists. Skipping.`);
+      logger(`Finished lead completed-lead.local already exists. Skipping.`);
     }
 
     // Abandoned Halfway Lead
     if (!existingLeads.some(l => l.domain === 'abandoned-lead.local')) {
       const abandonedLead = await geoRepo.createLead({
         domain: "abandoned-lead.local",
         brandName: "Abandoned Brand",
         primaryMarket: "US"
       });
       // No email update
-      console.log(`Inserted abandoned lead: ${abandonedLead.domain}`);
+      logger(`Inserted abandoned lead: ${abandonedLead.domain}`);
     } else {
-       console.log(`Abandoned lead abandoned-lead.local already exists. Skipping.`);
+       logger(`Abandoned lead abandoned-lead.local already exists. Skipping.`);
     }
 
-    console.log("Seeding complete.");
+    logger("Seeding complete.");
 
   } catch (err) {
     console.error("Seeding failed:", err);
   } finally {
     await dbClient.close();
   }
 }
 
 if (import.meta.url === `file://${process.argv[1]}`) {
   main().catch(err => {
     console.error(err);
     process.exit(1);
diff --git a/apps/worker/src/utils/fetcher.ts b/apps/worker/src/utils/fetcher.ts
index 343f02a..0eb66bc 100644
--- a/apps/worker/src/utils/fetcher.ts
+++ b/apps/worker/src/utils/fetcher.ts
@@ -1,33 +1,36 @@
 import * as cheerio from "cheerio";
 import dns from "node:dns/promises";
 import ipaddr from "ipaddr.js";
 import { type ParsedPage } from "@seovista/geo-engine";
 import {
   computeCacheKey,
   getCachedRender,
   setCachedRender,
   incrementBrowseractCreditCounter,
 } from "./render-cache.js";
 import { getDailyCreditStatus } from "./credit-guard.js";
+import { stdoutLogger, type Logger } from "./logger.js";
 
 /**
  * Options passed to {@link fetchAndParseUrl}.
  *
  * `forceAudit: true` bypasses the render cache and triggers a fresh render
  * (the fresh result is written back to the cache so subsequent non-forced
  * audits benefit from it). See VAL-A-SPA-002.
  */
 export interface FetchAndParseUrlOptions {
   forceAudit?: boolean;
+  /** Injected stdout logger; defaults to the sanctioned stdoutLogger. */
+  logger?: Logger;
 }
 
 /**
  * Extended fetch result carrying render-cache metadata. `cacheHit` is `true`
  * when the parsed page was served from `geo:cache:{sha256(canonicalUrl)}`
  * without invoking Browseract / Cheerio (VAL-A-SPA-001). Callers that need the
  * cache-hit flag for telemetry (e.g. the `audit_completed` Sentry event,
  * VAL-A-OBS-002) should use {@link fetchAndParseUrlWithMeta}; callers that
  * only need the page can keep using {@link fetchAndParseUrl}.
  */
 export interface FetchAndParseUrlResult {
   parsedPage: ParsedPage;
@@ -682,31 +685,32 @@ export async function fetchAndParseUrl(
  * came from the render cache (`cacheHit: true`) or a fresh network render
  * (`cacheHit: false`). The geo-worker uses this flag to populate the
  * `cache_hit` field of the `audit_completed` Sentry event (VAL-A-OBS-002).
  */
 export async function fetchAndParseUrlWithMeta(
   targetUrl: string,
   options: FetchAndParseUrlOptions = {},
 ): Promise<FetchAndParseUrlResult> {
   // 1. Validate against SSRF
   await validateSSRF(targetUrl);
 
   const forceAudit = options.forceAudit === true;
+  const logger = options.logger ?? stdoutLogger;
   const cacheKey = computeCacheKey(targetUrl);
 
   // 2. Cache lookup (skipped on forceAudit bypass)
   if (!forceAudit) {
     const cached = await getCachedRender(cacheKey);
     if (cached) {
-      console.log(
+      logger(
         JSON.stringify({
           name: "@seovista/worker",
           layer: "fetcher",
           event: "render_cache_hit",
           cache: true,
           cacheKey,
           canonicalUrl: targetUrl,
           timestamp: new Date().toISOString(),
         })
       );
       return { parsedPage: cached, cacheHit: true };
     }
@@ -736,25 +740,25 @@ export async function fetchAndParseUrlWithMeta(
         canonicalUrl: targetUrl,
         timestamp: new Date().toISOString(),
       })
     );
   } else {
     // Under the daily limit → consume a credit and proceed with a fresh
     // render decision. The counter increments once per miss/bypass regardless
     // of whether Browseract ultimately succeeds or falls back to Cheerio
     // (VAL-A-SPA-001 evidence: credit counter increments on miss/bypass).
     await incrementBrowseractCreditCounter();
   }
 
-  console.log(
+  logger(
     JSON.stringify({
       name: "@seovista/worker",
       layer: "fetcher",
       event: "render_cache_miss",
       cache: false,
       forceAudit,
       cacheKey,
       canonicalUrl: targetUrl,
       browseractSkippedByCreditGuard: creditExhausted,
       timestamp: new Date().toISOString(),
     })
   );
diff --git a/apps/worker/src/utils/logger.ts b/apps/worker/src/utils/logger.ts
new file mode 100644
index 0000000..6227816
--- /dev/null
+++ b/apps/worker/src/utils/logger.ts
@@ -0,0 +1,17 @@
+/**
+ * Injected logger contract for CLI scripts and worker diagnostics.
+ *
+ * The ESLint `no-console` rule (`allow: ["error", "warn"]`) flags every
+ * `console.log` call site. Instead of scattering `eslint-disable` comments,
+ * every call site injects a `Logger` and the single sanctioned `console.log`
+ * lives here in {@link stdoutLogger}. Tests inject {@link noopLogger} or a
+ * `vi.fn()` to assert/suppress output.
+ */
+export type Logger = (...values: unknown[]) => void;
+
+export const stdoutLogger: Logger = (...values) => {
+  // eslint-disable-next-line no-console -- single sanctioned stdout wrapper; all other call sites inject a Logger so the no-console rule stays clean.
+  console.log(...values);
+};
+
+export const noopLogger: Logger = () => {};
