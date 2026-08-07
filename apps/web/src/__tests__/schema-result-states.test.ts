/**
 * Schema Result Page State Contract Tests (B4)
 *
 * The schema-checker result page at `/tools/schema-checker/result/[jobId]`
 * must render an explicit unknown-status state for any persisted
 * job_records.status outside the supported lifecycle vocabulary instead of
 * crashing on the result payload, while preserving the one-main/one-h1
 * landmark contract. Follows the geo-result-states.test.ts conventions.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ---------------------------------------------------------------------------
// Mock setup — vi.mock calls are hoisted above all imports.
// ---------------------------------------------------------------------------

const mockGetAdminDb = vi.fn();

vi.mock("@/lib/admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/geo-checker/actions", () => ({
  checkJobStatusAction: vi.fn().mockResolvedValue({ success: true, data: { status: "queued" } }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count occurrences of a tag in the fully-rendered markup. Rendering to
 *  static markup resolves function components (e.g. the shared
 *  UnknownJobStatusView) so the landmark contract is verified against the
 *  exact HTML the browser receives. */
function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

const JOB_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function mockQueryRow(row: Record<string, unknown>) {
  mockGetAdminDb.mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [row] }),
  });
}

// ---------------------------------------------------------------------------
// The page component — imported after mocks so the module graph resolves
// with our controlled dependencies.
// ---------------------------------------------------------------------------

let SchemaJobResultPage: (
  props: { params: Promise<{ jobId: string }> },
) => Promise<React.ReactElement>;

beforeAll(async () => {
  const mod = await import(
    "../../app/tools/schema-checker/result/[jobId]/page"
  );
  SchemaJobResultPage = mod.default;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Schema Result Page unknown status guard (B4)", () => {
  it("unrecognised persisted status renders explicit unknown UI with one main + one h1, no crash", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "mysterious_persisted_status",
      result_payload: null,
    });

    const el = await SchemaJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });

    const text = renderToStaticMarkup(el);

    // One <main> landmark with one <h1>.
    expect(countTag(text, "main")).toBe(1);
    expect(countTag(text, "h1")).toBe(1);

    // Explicit unknown-status state, not a result render.
    expect(text).toContain("We can&#x27;t find this report");
    expect(text).toContain("Start a new audit to get a fresh link");
    expect(text).not.toContain("Yapısal Veri Denetim Sonucu");

    // No raw Next.js error details leaked.
    expect(text).not.toContain("digest");
    expect(text).not.toContain("stack");
  });

  it("completed status with valid payload still renders the result (guard does not break the happy path)", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: {
        rawScriptCount: 2,
        validNodes: [],
        parseErrors: [],
        prohibitedClaims: [],
        score: 80,
      },
    });

    const el = await SchemaJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });

    const text = renderToStaticMarkup(el);

    expect(countTag(text, "main")).toBe(1);
    expect(countTag(text, "h1")).toBe(1);
    expect(text).toContain("Yapısal Veri Denetim Sonucu");
    expect(text).toContain("80");
  });
});
