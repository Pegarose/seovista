4e2fe25 test(web): assert full alert consent label text
cba48dd feat(web): add alert consent checkbox to tracker forms

 apps/web/src/__tests__/tracker-track-this-button.test.ts | 11 +++++++++++
 apps/web/src/components/tracker/track-this-button.tsx    | 12 ++++++++++++
 apps/web/src/components/tracker/tracker-form.tsx         | 13 +++++++++++++
 3 files changed, 36 insertions(+)

diff --git a/apps/web/src/__tests__/tracker-track-this-button.test.ts b/apps/web/src/__tests__/tracker-track-this-button.test.ts
index cc4f96e..f1e751a 100644
--- a/apps/web/src/__tests__/tracker-track-this-button.test.ts
+++ b/apps/web/src/__tests__/tracker-track-this-button.test.ts
@@ -13,10 +13,21 @@ vi.mock("@/lib/tracker/actions", () => ({
 
 describe("TrackThisButton", () => {
   it("renders the track-this CTA with Turkish text in collapsed state", async () => {
     const { TrackThisButton } = await import("../components/tracker/track-this-button");
     const markup = renderToStaticMarkup(
       React.createElement(TrackThisButton, { keyword: "seo denetimi", domain: "example.com" }),
     );
     expect(markup).toContain("Bu Anahtarı Takip Et");
   });
 });
+
+describe("TrackerForm", () => {
+  it("renders the alert consent checkbox with Turkish label", async () => {
+    const { TrackerForm } = await import("../components/tracker/tracker-form");
+    const markup = renderToStaticMarkup(React.createElement(TrackerForm));
+    expect(markup).toContain('name="consent"');
+    expect(markup).toContain(
+      "Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)",
+    );
+  });
+});
diff --git a/apps/web/src/components/tracker/track-this-button.tsx b/apps/web/src/components/tracker/track-this-button.tsx
index 7dddbf4..37c2ba9 100644
--- a/apps/web/src/components/tracker/track-this-button.tsx
+++ b/apps/web/src/components/tracker/track-this-button.tsx
@@ -67,20 +67,32 @@ export function TrackThisButton({ keyword, domain }: { keyword: string; domain:
             placeholder="ornek@email.com"
             className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
           />
           {state.errors?.email && (
             <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.email[0]}</p>
           )}
         </div>
         {state.errors?.form && (
           <p className="text-sm text-red-600" role="alert">{state.errors.form[0]}</p>
         )}
+        <div>
+          <label className="flex items-start gap-2 text-sm text-slate-700">
+            <input
+              type="checkbox"
+              name="consent"
+              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
+            />
+            <span>
+              Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)
+            </span>
+          </label>
+        </div>
         <button
           type="submit"
           disabled={isPending}
           className="w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
         >
           {isPending ? "Ekleniyor..." : "Takibe Başla"}
         </button>
       </form>
     </div>
   );
diff --git a/apps/web/src/components/tracker/tracker-form.tsx b/apps/web/src/components/tracker/tracker-form.tsx
index 90a326e..0c28b16 100644
--- a/apps/web/src/components/tracker/tracker-form.tsx
+++ b/apps/web/src/components/tracker/tracker-form.tsx
@@ -62,20 +62,33 @@ export function TrackerForm() {
           />
           {state.errors?.domain && (
             <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.domain[0]}</p>
           )}
         </div>
 
         {state.errors?.form && (
           <p className="text-sm text-red-600" role="alert">{state.errors.form[0]}</p>
         )}
 
+        <div>
+          <label className="flex items-start gap-2 text-sm text-slate-700">
+            <input
+              type="checkbox"
+              name="consent"
+              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
+            />
+            <span>
+              Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)
+            </span>
+          </label>
+        </div>
+
         <button
           type="submit"
           disabled={isPending}
           className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
         >
           {isPending ? "Ekleniyor..." : "Takibe Başla"}
         </button>
       </form>
 
       {state.status === "success" && state.token && (
