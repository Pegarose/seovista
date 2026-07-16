import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runLifecycleCli } from "../../scripts/infrastructure-lifecycle-entry.js";
import { createRunContext, getContextPath, writeLifecycleContext } from "../../scripts/infrastructure-lifecycle-core.js";

function createController() {
  const calls: string[][] = [];
  return {
    calls,
    controller: {
      start: async (...args: string[]) => {
        calls.push(["start", ...args]);
        return "context";
      },
      teardown: async (...args: string[]) => {
        calls.push(["teardown", ...args]);
      },
      health: async (...args: string[]) => {
        calls.push(["health", ...args]);
      },
    },
  };
}

describe("lifecycle CLI entry", () => {
  it("forwards the third start argument as the lifecycle nonce", async () => {
    const { calls, controller } = createController();
    const output: string[] = [];

    await runLifecycleCli(["start", "seovista-dev", "nonce123456"], { write: (value: string) => output.push(value) } as NodeJS.WritableStream, (ready) => {
      Object.assign(ready, controller);
    });

    expect(calls).toEqual([["start", "seovista-dev", "nonce123456"]]);
    expect(output).toEqual(["context\n"]);
  });

  it("forwards the health service argument", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-entry-"));
    const context = createRunContext({ root, runId: "entry-health", nonce: "abcdef123456" });
    const contextPath = getContextPath(context, root);
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeLifecycleContext(context, contextPath, { root });
    const { calls, controller } = createController();

    await runLifecycleCli(["health", contextPath, "redis"], undefined, (ready) => {
      Object.assign(ready, controller);
    });

    expect(calls).toEqual([["health", contextPath, "redis"]]);
    rmSync(root, { recursive: true, force: true });
  });
});
