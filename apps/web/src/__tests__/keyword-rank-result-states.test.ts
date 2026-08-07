/**
 * Keyword Rank Result Page State Contract Tests
 *
 * The keyword-rank-checker result page at
 * `/tools/keyword-rank-checker/result/[jobId]` must render the completed
 * top-10 snapshot honestly (position card, data-source label, target row
 * badge that is not color-only), an explicit not-in-top-10 state, and the
 * shared unknown-status guard for any persisted job_records.status outside
 * the supported lifecycle vocabulary — while preserving the
 * one-main/one-h1 landmark contract. Follows the
 * schema-result-states.test.ts conventions.
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

/** A completed keyword-rank payload with the target domain at position 3. */
function completedPayload(overrides: Record<string, unknown> = {}) {
  const top10 = Array.from({ length: 10 }, (_, i) => ({
    position: i + 1,
    url: i === 2 ? "https://example.com/sayfa" : `https://rakip-ornek-${i + 1}.com/`,
    title: i === 2 ? "Benim Sayfam" : `Rakip ${i + 1}`,
    snippet: `Özet ${i + 1}`,
    isTarget: i === 2,
  }));
  return {
    kind: "keyword-rank",
    domain: "example.com",
    keyword: "seo denetimi",
    locale: "tr-TR",
    position: 3,
    top10,
    resultsReturned: 10,
    checkedAt: "2026-08-01T12:00:00.000Z",
    dataSource: "mock",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The page component — imported after mocks so the module graph resolves
// with our controlled dependencies.
// ---------------------------------------------------------------------------

let KeywordRankJobResultPage: (
  props: { params: Promise<{ jobId: string }> },
) => Promise<React.ReactElement>;

beforeAll(async () => {
  const mod = await import(
    "../../app/tools/keyword-rank-checker/result/[jobId]/page"
  );
  KeywordRankJobResultPage = mod.default;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Keyword Rank Result Page completed view", () => {
  it("renders the position card, 10-row table, target badge, and mock data-source label", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "example.com",
      status: "completed",
      result_payload: completedPayload(),
    });

    const el = await KeywordRankJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });

    const text = renderToStaticMarkup(el);

    // Position card shows the observed rank.
    expect(text).toContain("#3");

    // Top-10 table: 1 header row + 10 body rows.
    expect(countTag(text, "tr")).toBe(11);

    // Target row carries an explicit text badge (not color-only).
    expect(text).toContain("Sizin siteniz");

    // Mock data source is labelled honestly.
    expect(text).toContain("Örnek veri");

    // No invented score anywhere.
    expect(text).not.toContain("Skor");
  });

  it("renders exactly one h1 inside exactly one main landmark", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "example.com",
      status: "completed",
      result_payload: completedPayload(),
    });

    const el = await KeywordRankJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });

    const text = renderToStaticMarkup(el);

    expect(countTag(text, "main")).toBe(1);
    expect(countTag(text, "h1")).toBe(1);
  });
});

describe("Keyword Rank Result Page not-in-top-10 state", () => {
  it("position null renders the explicit not-found state without a rank number", async () => {
    const payload = completedPayload({
      position: null,
      top10: (completedPayload().top10 as Array<Record<string, unknown>>).map((entry) => ({
        ...entry,
        url: (entry.url as string).replace("example.com", "baska-rakip.com"),
        isTarget: false,
      })),
    });
    mockQueryRow({
      id: JOB_ID,
      target: "example.com",
      status: "completed",
      result_payload: payload,
    });

    const el = await KeywordRankJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });

    const text = renderToStaticMarkup(el);

    expect(countTag(text, "main")).toBe(1);
    expect(countTag(text, "h1")).toBe(1);
    // react-dom server-escapes the apostrophe in "İlk 10'da yok".
    expect(text).toContain("İlk 10&#x27;da yok");
    expect(text).toContain("bulunamadı");
    expect(text).not.toContain("Sizin siteniz");
  });
});

describe("Keyword Rank Result Page unknown status guard", () => {
  it("unrecognised persisted status renders explicit unknown UI with one main + one h1, no crash", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "example.com",
      status: "mysterious_persisted_status",
      result_payload: null,
    });

    const el = await KeywordRankJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });

    const text = renderToStaticMarkup(el);

    // One <main> landmark with one <h1>.
    expect(countTag(text, "main")).toBe(1);
    expect(countTag(text, "h1")).toBe(1);

    // Explicit unknown-status state, not a result render.
    expect(text).toContain("We can&#x27;t find this report");
    expect(text).toContain("Start a new audit to get a fresh link");
    expect(text).not.toContain("Sıralama Kontrol Sonucu");

    // No raw Next.js error details leaked.
    expect(text).not.toContain("digest");
    expect(text).not.toContain("stack");
  });
});
