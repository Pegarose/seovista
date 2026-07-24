import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { InternalAxiosRequestConfig } from "axios";
import { runDryScore, buildDryRunContext } from "../dry-run.js";
import { nwClient } from "../providers/neuronwriter.js";
import type { ParsedPage } from "../types.js";

/**
 * Dry-run scoring surface — `VAL-A-VAR-001`.
 *
 *   - `pnpm score:dry <fixture>` exits 0 and emits JSON containing
 *     `overall`, `modules`, `issues`.
 *   - Repeated invocations on the same fixture produce byte-identical stdout.
 *   - Zero outbound HTTP requests (offline; no NeuronWriter / Browseract).
 */

function buildExamplePage(): ParsedPage {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=UTF-8" },
    title: "Example Domain",
    metaDescription: "Example domain for use in illustrative examples.",
    canonical: "https://example.com/",
    metaRobots: { noindex: false, nofollow: false },
    headings: [{ level: 1, text: "Example Domain" }],
    links: [
      {
        href: "https://www.iana.org/domains/example",
        text: "More information...",
        isInternal: false,
      },
    ],
    images: [],
    jsonLd: [],
    og: { title: "Example Domain", url: "https://example.com/" },
    rawHtml:
      "<!doctype html><html><head><title>Example Domain</title></head><body><div><h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents.</p><p><a href=\"https://www.iana.org/domains/example\">More information...</a></p></div></body></html>",
    textContent:
      "Example Domain This domain is for use in illustrative examples in documents. You may use this domain without prior coordination or asking for permission. More information...",
  };
}

describe("dry-run scoring — VAL-A-VAR-001 (offline + determinism + shape)", () => {
  const originalAdapter = nwClient.defaults.adapter;

  beforeEach(() => {
    // Tripwire: if any code path in the dry-run reaches NeuronWriter's axios
    // instance, this adapter throws immediately. The dry-run must never make
    // an outbound HTTP request.
    nwClient.defaults.adapter = async (_config: InternalAxiosRequestConfig) => {
      throw new Error("Dry-run must not make outbound HTTP requests");
    };
  });

  afterEach(() => {
    nwClient.defaults.adapter = originalAdapter as NonNullable<
      typeof nwClient.defaults.adapter
    >;
  });

  it("buildDryRunContext forces every network-gated option off", () => {
    const ctx = buildDryRunContext(buildExamplePage(), {
      url: "https://example.com/",
    });
    expect(ctx.options?.includeNeuronWriter).toBe(false);
    expect(ctx.options?.includePerformance).toBe(false);
    expect(ctx.options?.renderJavascript).toBe(false);
    expect(ctx.options?.storeSnapshot).toBe(false);
    expect(ctx.tenantId).toBe("dry-run");
  });

  it("returns overall / modules / issues with a valid 0-100 score and 7 modules", async () => {
    const out = await runDryScore(buildExamplePage(), {
      url: "https://example.com/",
    });

    expect(out.overall).toBeDefined();
    expect(typeof out.overall.score).toBe("number");
    expect(out.overall.score).toBeGreaterThanOrEqual(0);
    expect(out.overall.score).toBeLessThanOrEqual(100);
    expect(typeof out.overall.score_version).toBe("string");
    expect(out.overall.score_version.length).toBeGreaterThan(0);
    expect(out.overall.band).toBeDefined();

    expect(Array.isArray(out.modules)).toBe(true);
    expect(out.modules).toHaveLength(7);
    for (const m of out.modules) {
      expect(typeof m.key).toBe("string");
      expect(typeof m.label).toBe("string");
      expect(typeof m.score).toBe("number");
      expect(typeof m.maxScore).toBe("number");
    }

    expect(Array.isArray(out.issues)).toBe(true);
    for (const i of out.issues) {
      expect(typeof i.code).toBe("string");
      expect(typeof i.title).toBe("string");
      expect(typeof i.severity).toBe("string");
      expect(typeof i.module).toBe("string");
      expect(typeof i.confidence).toBe("number");
    }

    expect(out.platformReadiness).toBeDefined();
    expect(typeof out.platformReadiness.chatgpt).toBe("number");
  });

  it("produces byte-identical serialized output across 5 runs (offline)", async () => {
    const page = buildExamplePage();
    const serialized: string[] = [];
    for (let i = 0; i < 5; i++) {
      const out = await runDryScore(page, { url: "https://example.com/" });
      serialized.push(JSON.stringify(out, null, 2));
    }
    const first = serialized[0];
    expect(first).toBeDefined();
    expect(serialized.every((s) => s === first)).toBe(true);
  });

  it("makes no outbound HTTP requests (offline tripwire)", async () => {
    // The beforeEach adapter throws if NeuronWriter is contacted. With
    // includeNeuronWriter forced off, the dry-run must complete without
    // touching the network — so reaching this assertion means no HTTP was
    // attempted.
    const out = await runDryScore(buildExamplePage(), {
      url: "https://example.com/",
    });
    expect(out.overall.score).toBeGreaterThanOrEqual(0);
  });
});

describe("dry-run scoring CLI — `pnpm score:dry` end-to-end", () => {
  const repoRoot = resolve(import.meta.dirname, "../../../..");
  const fixture = "fixtures/example.com.json";

  function runCli(): { status: number | null; stdout: string; stderr: string; error: string | undefined } {
    const result = spawnSync(`pnpm score:dry ${fixture}`, {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 90_000,
      shell: true,
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error ? String(result.error) : undefined,
    };
  }

  it("exits 0 and emits JSON with overall, modules, issues", () => {
    const run = runCli();
    if (run.status !== 0) {
      // Surface stderr / spawn error to aid debugging if the spawn fails in CI.
      console.error("CLI status:", run.status, "error:", run.error, "stderr:", run.stderr);
    }
    expect(run.status).toBe(0);

    // pnpm may prepend non-JSON warnings (e.g. engine mismatch, which itself
    // contains `{"node":...}`) to stdout. The pretty-printed payload starts
    // with `{` on its own line (`\n{\n`), so locate that marker to skip any
    // pnpm wrapper noise.
    const payloadMarker = "\n{\n";
    const markerIdx = run.stdout.indexOf(payloadMarker);
    const jsonStart = markerIdx >= 0 ? markerIdx + 1 : run.stdout.indexOf("{");
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(run.stdout.slice(jsonStart)) as {
      overall?: unknown;
      modules?: unknown;
      issues?: unknown;
    };
    expect(parsed.overall).toBeDefined();
    expect(Array.isArray(parsed.modules)).toBe(true);
    expect(Array.isArray(parsed.issues)).toBe(true);
  });

  it("produces byte-identical stdout across repeated invocations", () => {
    const a = runCli();
    const b = runCli();
    expect(a.status).toBe(0);
    expect(b.status).toBe(0);
    expect(a.stdout).toBe(b.stdout);
  });
});
