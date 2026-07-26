import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workerRoot = resolve(import.meta.dirname, "../..");

function readWorkerFile(relativePath: string): string {
  return readFileSync(resolve(workerRoot, relativePath), "utf8");
}

describe("worker Sentry removal contract", () => {
  it("does not package or import the Sentry runtime", () => {
    const packageJson = JSON.parse(readWorkerFile("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const runtimeSources = [
      "src/worker.ts",
      "src/queue/geo-submission.ts",
      "src/queue/geo-worker.ts",
    ];

    expect(packageJson.dependencies?.["@sentry/node"]).toBeUndefined();
    expect(existsSync(resolve(workerRoot, "src/utils/sentry.ts"))).toBe(false);
    expect(existsSync(resolve(workerRoot, "src/__tests__/sentry.test.ts"))).toBe(false);
    for (const source of runtimeSources) {
      expect(readWorkerFile(source)).not.toMatch(/@sentry|SENTRY_DSN|utils\/sentry|emitAudit(?:Submitted|Completed)|emitCrewFailureBreadcrumb/i);
    }
  });
});
