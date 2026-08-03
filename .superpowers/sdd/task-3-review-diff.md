58ac77b test(worker): fix off-by-one in alert evaluator custom minDelta test
2c7c27d feat(worker): add tracker alert transition evaluator

 apps/worker/src/__tests__/alert-evaluator.test.ts | 48 +++++++++++++++++++++++
 apps/worker/src/alerts/alert-evaluator.ts         | 31 +++++++++++++++
 2 files changed, 79 insertions(+)

diff --git a/apps/worker/src/__tests__/alert-evaluator.test.ts b/apps/worker/src/__tests__/alert-evaluator.test.ts
new file mode 100644
index 0000000..e83873d
--- /dev/null
+++ b/apps/worker/src/__tests__/alert-evaluator.test.ts
@@ -0,0 +1,48 @@
+import { describe, it, expect } from "vitest";
+import { evaluateTransition } from "../alerts/alert-evaluator.js";
+
+const MIN = 3;
+
+describe("evaluateTransition", () => {
+  it("returns null for the first observation (no baseline)", () => {
+    expect(evaluateTransition(null, 1, MIN)).toBeNull();
+    expect(evaluateTransition(null, 0, MIN)).toBeNull();
+  });
+
+  it("detects dropped_out_of_top10", () => {
+    expect(evaluateTransition(4, 0, MIN)).toBe("dropped_out_of_top10");
+    expect(evaluateTransition(10, 0, MIN)).toBe("dropped_out_of_top10");
+  });
+
+  it("detects entered_top10", () => {
+    expect(evaluateTransition(0, 4, MIN)).toBe("entered_top10");
+    expect(evaluateTransition(0, 1, MIN)).toBe("entered_top10");
+  });
+
+  it("detects significant_drop at exactly the boundary delta", () => {
+    expect(evaluateTransition(1, 4, MIN)).toBe("significant_drop");
+    expect(evaluateTransition(2, 5, MIN)).toBe("significant_drop");
+  });
+
+  it("detects significant_rise at exactly the boundary delta", () => {
+    expect(evaluateTransition(4, 1, MIN)).toBe("significant_rise");
+    expect(evaluateTransition(7, 4, MIN)).toBe("significant_rise");
+  });
+
+  it("returns null for small movement and equality", () => {
+    expect(evaluateTransition(1, 3, MIN)).toBeNull(); // delta 2 < 3
+    expect(evaluateTransition(3, 1, MIN)).toBeNull(); // delta 2 < 3
+    expect(evaluateTransition(5, 5, MIN)).toBeNull();
+    expect(evaluateTransition(0, 0, MIN)).toBeNull();
+  });
+
+  it("respects a custom minDelta", () => {
+    expect(evaluateTransition(1, 6, 5)).toBe("significant_drop");
+    expect(evaluateTransition(1, 4, 5)).toBeNull();
+  });
+
+  it("does not treat 0-crossing as significant_drop/rise", () => {
+    expect(evaluateTransition(3, 0, MIN)).toBe("dropped_out_of_top10");
+    expect(evaluateTransition(0, 3, MIN)).toBe("entered_top10");
+  });
+});
diff --git a/apps/worker/src/alerts/alert-evaluator.ts b/apps/worker/src/alerts/alert-evaluator.ts
new file mode 100644
index 0000000..4724654
--- /dev/null
+++ b/apps/worker/src/alerts/alert-evaluator.ts
@@ -0,0 +1,31 @@
+export type AlertKind =
+  | "dropped_out_of_top10"
+  | "entered_top10"
+  | "significant_drop"
+  | "significant_rise";
+
+/**
+ * Decide whether a position transition (previous observation -> new
+ * observation) fires an alert. `0` means the domain was not found in the
+ * top 10 results. Categories are mutually exclusive: a single transition
+ * yields at most one alert, so the return type is `AlertKind | null`.
+ *
+ * - First observation (prev === null): no alert — establishes the baseline.
+ * - 1..10 -> 0: dropped out of the top 10.
+ * - 0 -> 1..10: entered the top 10.
+ * - in-band movement of >= minDelta: significant_drop / significant_rise.
+ */
+export function evaluateTransition(
+  prev: number | null,
+  next: number,
+  minDelta: number,
+): AlertKind | null {
+  if (prev === null || prev === next) return null;
+  if (prev === 0) {
+    return next >= 1 && next <= 10 ? "entered_top10" : null;
+  }
+  if (next === 0) return "dropped_out_of_top10";
+  if (next - prev >= minDelta) return "significant_drop";
+  if (prev - next >= minDelta) return "significant_rise";
+  return null;
+}
