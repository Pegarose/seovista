4f2c354 feat(web): add tracker alert consent validation and actions

 apps/web/src/lib/tracker/__tests__/actions.test.ts | 87 +++++++++++++++++++++-
 apps/web/src/lib/tracker/actions.ts                | 26 ++++++-
 apps/web/src/lib/tracker/validation.ts             | 15 +++-
 3 files changed, 123 insertions(+), 5 deletions(-)

diff --git a/apps/web/src/lib/tracker/__tests__/actions.test.ts b/apps/web/src/lib/tracker/__tests__/actions.test.ts
index 5eb1e26..38e8dc1 100644
--- a/apps/web/src/lib/tracker/__tests__/actions.test.ts
+++ b/apps/web/src/lib/tracker/__tests__/actions.test.ts
@@ -24,24 +24,25 @@ const {
   mockDeactivateTarget: vi.fn(),
   mockFindSessionByToken: vi.fn(),
 }));
 
 vi.mock("../../admin/db", () => ({ getAdminDb: mockGetAdminDb }));
 vi.mock("@seovista/worker", () => ({
   checkIpRateLimit: mockCheckIpRateLimit,
   createTrackerRepository: mockCreateTrackerRepository,
 }));
 vi.mock("next/headers", () => ({ headers: mockHeaders }));
+vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
 
 import { createTrackerTargetAction, listTrackerTargetsAction, deactivateTrackerTargetAction } from "../actions";
 
-const SESSION_REF = "fixture-session-ref";
+const SESSION_REF = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
 const SESSION_ID = "fixture-session-id";
 const TARGET_ID = "fixture-target-id";
 
 function setupRepoMock() {
   const repo = {
     findOrCreateSession: mockFindOrCreateSession,
     createTarget: mockCreateTarget,
     countActiveTargets: mockCountActiveTargets,
     listTargetsByToken: mockListTargetsByToken,
     deactivateTarget: mockDeactivateTarget,
@@ -102,21 +103,21 @@ describe("createTrackerTargetAction", () => {
     vi.clearAllMocks();
     delete process.env.REDIS_URL;
   });
 
   it("creates a session and target, returns the token", async () => {
     const result = await createTrackerTargetAction({ status: "idle" }, buildFormData({
       email: "user@example.com", keyword: "seo denetimi", domain: "example.com",
     }));
     expect(result.status).toBe("success");
     expect(result.token).toBe(SESSION_REF);
-    expect(mockFindOrCreateSession).toHaveBeenCalledWith("user@example.com");
+    expect(mockFindOrCreateSession).toHaveBeenCalledWith("user@example.com", false);
     expect(mockCreateTarget).toHaveBeenCalled();
   });
 
   it("returns error when rate limited", async () => {
     mockCheckIpRateLimit.mockResolvedValue({ success: false, remaining: 0, resetSeconds: 3600 });
     const result = await createTrackerTargetAction({ status: "idle" }, buildFormData({
       email: "user@example.com", keyword: "seo", domain: "example.com",
     }));
     expect(result.status).toBe("error");
     expect(result.errors?.form).toBeDefined();
@@ -186,10 +187,92 @@ describe("deactivateTrackerTargetAction", () => {
     expect(result.success).toBe(true);
     expect(mockDeactivateTarget).toHaveBeenCalledWith(SESSION_REF, TARGET_ID);
   });
 
   it("returns failure when target not owned by token", async () => {
     mockDeactivateTarget.mockResolvedValue(false);
     const result = await deactivateTrackerTargetAction(SESSION_REF, TARGET_ID);
     expect(result.success).toBe(false);
   });
 });
+
+// --- B3: consent ---
+
+describe("validateTrackerTargetInput consent", () => {
+  it("preprocesses consent from 'on' to true", () => {
+    const fd = new FormData();
+    fd.set("email", "user@example.com");
+    fd.set("keyword", "seo");
+    fd.set("domain", "example.com");
+    fd.set("consent", "on");
+    const result = validateTrackerTargetInput({ email: "user@example.com", keyword: "seo", domain: "example.com", consent: fd.get("consent")?.toString() ?? "" });
+    expect(result.success).toBe(true);
+    if (result.success) expect(result.data.consent).toBe(true);
+  });
+
+  it("preprocesses missing consent to false", () => {
+    const result = validateTrackerTargetInput({ email: "user@example.com", keyword: "seo", domain: "example.com", consent: "" });
+    expect(result.success).toBe(true);
+    if (result.success) expect(result.data.consent).toBe(false);
+  });
+});
+
+describe("createTrackerTargetAction consent", () => {
+  beforeEach(() => {
+    process.env.REDIS_URL = "redis://localhost:8637";
+    mockGetAdminDb.mockReturnValue({ query: vi.fn() });
+    mockCheckIpRateLimit.mockResolvedValue({ success: true, remaining: 2, resetSeconds: 3600 });
+    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "127.0.0.1" }));
+    mockFindOrCreateSession.mockResolvedValue({ id: SESSION_ID, token: SESSION_REF });
+    mockCountActiveTargets.mockResolvedValue(0);
+    mockCreateTarget.mockResolvedValue({ id: TARGET_ID });
+  });
+
+  afterEach(() => {
+    vi.clearAllMocks();
+    delete process.env.REDIS_URL;
+  });
+
+  it("passes consent=true to findOrCreateSession for a new session", async () => {
+    setupRepoMock();
+    const fd = buildFormData({ email: "user@example.com", keyword: "seo", domain: "example.com" });
+    fd.set("consent", "on");
+    await createTrackerTargetAction({ status: "idle" }, fd);
+    expect(mockFindOrCreateSession).toHaveBeenCalledWith("user@example.com", true);
+  });
+
+  it("passes consent=false when the checkbox is absent", async () => {
+    setupRepoMock();
+    const fd = buildFormData({ email: "user@example.com", keyword: "seo", domain: "example.com" });
+    await createTrackerTargetAction({ status: "idle" }, fd);
+    expect(mockFindOrCreateSession).toHaveBeenCalledWith("user@example.com", false);
+  });
+});
+
+describe("updateAlertConsentAction", () => {
+  it("rejects a malformed token", async () => {
+    const { updateAlertConsentAction } = await import("../actions");
+    const result = await updateAlertConsentAction("not-a-uuid", true);
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects an unknown token", async () => {
+    mockFindSessionByToken.mockResolvedValue(null);
+    const { updateAlertConsentAction } = await import("../actions");
+    const result = await updateAlertConsentAction(SESSION_REF, true);
+    expect(result.success).toBe(false);
+    expect(result.error).toBe("Takip paneli bulunamadı.");
+  });
+
+  it("updates consent for a valid token", async () => {
+    mockFindSessionByToken.mockResolvedValue({ id: SESSION_ID, email: "user@example.com" });
+    const mockUpdateAlertConsent = vi.fn().mockResolvedValue(undefined);
+    mockCreateTrackerRepository.mockReturnValue({
+      findSessionByToken: mockFindSessionByToken,
+      updateAlertConsent: mockUpdateAlertConsent,
+    });
+    const { updateAlertConsentAction } = await import("../actions");
+    const result = await updateAlertConsentAction(SESSION_REF, true);
+    expect(result.success).toBe(true);
+    expect(mockUpdateAlertConsent).toHaveBeenCalledWith(SESSION_ID, true);
+  });
+});
diff --git a/apps/web/src/lib/tracker/actions.ts b/apps/web/src/lib/tracker/actions.ts
index 9a8aafa..5b28b12 100644
--- a/apps/web/src/lib/tracker/actions.ts
+++ b/apps/web/src/lib/tracker/actions.ts
@@ -61,21 +61,22 @@ export async function createTrackerTargetAction(
     if (!rateLimit.success) {
       return {
         status: "error",
         errors: {
           form: [`Saatlik takip limitine (${limit}) ulaştınız. Lütfen daha sonra tekrar deneyiniz.`],
         },
       };
     }
 
     const repo = createTrackerRepository(db);
-    const session = await repo.findOrCreateSession(email);
+    const consent = formData.get("consent")?.toString() ?? "";
+    const session = await repo.findOrCreateSession(email, consent === "on");
 
     const maxTargets = Number(process.env.TRACKER_MAX_TARGETS_PER_EMAIL) || 5;
     const currentCount = await repo.countActiveTargets(session.id);
     if (currentCount >= maxTargets) {
       return {
         status: "error",
         errors: {
           form: [`Bu e-posta için maksimum hedef sayısına (${maxTargets}) ulaştınız.`],
         },
       };
@@ -304,10 +305,33 @@ export async function createTrackerTargetForSessionAction(
     }
     console.error("Tracker session target creation error:", error);
     return {
       status: "error",
       errors: {
         form: ["Sistem hatası nedeniyle hedef eklenemedi. Lütfen daha sonra tekrar deneyiniz."],
       },
     };
   }
 }
+
+export async function updateAlertConsentAction(
+  token: string,
+  consent: boolean,
+): Promise<{ success: boolean; error?: string }> {
+  try {
+    if (!TOKEN_RE.test(token)) {
+      return { success: false, error: "Takip paneli bulunamadı." };
+    }
+    const db = getAdminDb();
+    const repo = createTrackerRepository(db);
+    const session = await repo.findSessionByToken(token);
+    if (!session) {
+      return { success: false, error: "Takip paneli bulunamadı." };
+    }
+    await repo.updateAlertConsent(session.id, consent);
+    revalidatePath(`/tracker/${token}`);
+    return { success: true };
+  } catch (error) {
+    console.error("Failed to update alert consent:", error);
+    return { success: false, error: "E-posta uyarı tercihi güncellenemedi." };
+  }
+}
diff --git a/apps/web/src/lib/tracker/validation.ts b/apps/web/src/lib/tracker/validation.ts
index 6d20c54..b012110 100644
--- a/apps/web/src/lib/tracker/validation.ts
+++ b/apps/web/src/lib/tracker/validation.ts
@@ -1,27 +1,38 @@
 import { z } from "zod";
 
 /**
  * Form-level input validation for the recurring keyword rank tracker.
  *
  * This module intentionally has NO "use server" directive: Next.js rejects
  * non-async exports from server-action files, and `validateTrackerTargetInput`
  * is a synchronous helper shared between the server action and unit tests.
  */
+const consentPreprocess = z.preprocess(
+  (v) => ({ on: true, "": false, false: false, true: true })[String(v)] ?? false,
+  z.boolean(),
+);
+
 export const TrackerTargetFormSchema = z.object({
   email: z.string().trim().email("Geçerli bir e-posta giriniz."),
   keyword: z.string().trim().min(1, "Anahtar kelime gereklidir.").max(200, "Anahtar kelime 200 karakteri geçemez."),
   domain: z.string().trim().min(1, "Alan adı gereklidir.").max(253, "Alan adı 253 karakteri geçemez."),
+  consent: consentPreprocess,
 });
 
-export function validateTrackerTargetInput(input: { email: string; keyword: string; domain: string }) {
-  return TrackerTargetFormSchema.safeParse(input);
+export function validateTrackerTargetInput(input: { email: string; keyword: string; domain: string; consent?: string }) {
+  return TrackerTargetFormSchema.safeParse({
+    email: input.email,
+    keyword: input.keyword,
+    domain: input.domain,
+    consent: input.consent ?? "",
+  });
 }
 
 /**
  * Session-based target validation — used by the inline AddTargetForm on the
  * /tracker/[token] dashboard. Unlike TrackerTargetFormSchema, this schema
  * omits email because the session is resolved from the URL token.
  */
 export const TrackerSessionTargetSchema = z.object({
   keyword: z.string().trim().min(1, "Anahtar kelime gereklidir.").max(200, "Anahtar kelime 200 karakteri geçemez."),
   domain: z.string().trim().min(1, "Alan adı gereklidir.").max(253, "Alan adı 253 karakteri geçemez."),
