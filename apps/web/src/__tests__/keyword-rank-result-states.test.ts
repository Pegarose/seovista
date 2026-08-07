/**
 * Keyword Rank Result Page State Contract Tests
 *
 * VAL-CROSS-003: Every affected page has one main and one descriptive h1
 * VAL-CROSS-014: No fabrication and security boundaries hold
 *
 * The keyword-rank-checker result page at
 * `/tools/keyword-rank-checker/result/[jobId]` renders every lifecycle state
 * through the shared result-pages kit (ResultShell, VerdictCard,
 * ReportErrorPanel, StatusPill) with the English copy from the editorial lab
 * spec. The completed snapshot renders the observed position honestly
 * (verdict without a fabricated score, metadata line, data-source label,
 * top-10 table with a highlighted target row, explicit not-in-top-10 pill).
 * An unrecognised persisted job_records.status renders an explicit
 * unknown-status state instead of crashing on the result payload, while
 * preserving the one-main/one-h1 landmark contract. Follows the geo/schema/
 * ai-crawler result-states test conventions.
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

/**
 * Count `<main>` landmarks in the fully-rendered page markup. The page root
 * is a shared kit component (ResultShell), so the landmark is resolved by
 * renderToStaticMarkup rather than by walking the element tree.
 */
function countMainNodes(root: React.ReactElement): number {
  return (renderToString(root).match(/<main\b/g) ?? []).length;
}

/** Extract the text content of every `<h1>` in the fully-rendered page markup. */
function h1Texts(root: React.ReactElement): string[] {
  const html = renderToString(root);
  const h1Blocks = html.match(/<h1\b[\s\S]*?<\/h1>/g) ?? [];
  return h1Blocks.map((block) => block.replace(/<[^>]*>/g, "").trim());
}

/** Serialize the actual server-component tree without directly invoking
 *  hook-using client components. React's server renderer resolves the full
 *  tree and gives tests the same text/markup contract the browser receives. */
function renderToString(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

/** Count occurrences of a tag in the fully-rendered markup. */
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
// Fixture builders
// ---------------------------------------------------------------------------

/** A completed keyword-rank payload with the target domain at position 3. */
function buildKeywordRankPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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

describe("Keyword Rank Result Page State Contract", () => {
  // ------------------------------------------------------------------
  // VAL-CROSS-003: one main, one descriptive h1
  // ------------------------------------------------------------------

  describe("VAL-CROSS-003: one main + one descriptive h1 per state", () => {
    it("malformed non-UUID renders exactly one main with one h1 (Report not found)", async () => {
      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: "not-a-uuid" }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("Rank snapshot");

      const fullText = renderToString(el);
      expect(fullText).toContain("Report not found");
      expect(fullText).not.toContain("temporarily unavailable");
    });

    it("valid UUID with no matching row renders exactly one main with one h1 (Report not found)", async () => {
      mockGetAdminDb.mockReturnValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("Rank snapshot");

      const fullText = renderToString(el);
      expect(fullText).toContain("Report not found");
      expect(fullText).not.toContain("temporarily unavailable");
    });

    it("DB construction failure renders exactly one main with one h1 (Service unavailable)", async () => {
      mockGetAdminDb.mockImplementation(() => {
        throw new Error("DB connection refused");
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("Rank snapshot");

      const fullText = renderToString(el);
      expect(fullText).toContain("Service temporarily unavailable");
    });

    it("job lookup failure renders exactly one main with one h1 (Service unavailable)", async () => {
      mockGetAdminDb.mockReturnValue({
        query: vi.fn().mockRejectedValue(new Error("Connection lost")),
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("Rank snapshot");

      const fullText = renderToString(el);
      expect(fullText).toContain("Service temporarily unavailable");
    });

    it("queued status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "queued",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("running status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "running",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("pending status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "pending",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("completed status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "completed",
        result_payload: buildKeywordRankPayload(),
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("failed status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "failed",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("timeout status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "timeout",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("permanent status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "permanent",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("permanent_failure status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "permanent_failure",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("unknown persisted status renders exactly one main with one descriptive h1, no error boundary", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "mysterious_persisted_status",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);

      const text = renderToString(el);

      // The shared UnknownJobStatusView renders the explicit unavailable view
      expect(text).toContain("We can&#x27;t find this report");
      expect(text).toContain("Start a new audit to get a fresh link");

      // Must NOT contain raw Next.js error details
      expect(text).not.toContain("digest");
      expect(text).not.toContain("stack");

      // Must NOT contain result components or fabricated rank data
      expect(text).not.toContain("Top 10 results");
      expect(text).not.toContain("Your site");
      expect(text).not.toContain("#3");
      expect(text).not.toMatch(/\b\d+\/100\b/);

      // Must NOT leak the retired Turkish page copy
      expect(text).not.toContain("Sıralama Kontrol Sonucu");
      expect(text).not.toContain("Sizin siteniz");
      expect(text).not.toContain("Örnek veri");
      expect(text).not.toContain("İlk 10&#x27;da yok");
    });
  });

  // ------------------------------------------------------------------
  // VAL-CROSS-014: No fabrication
  // ------------------------------------------------------------------

  describe("VAL-CROSS-014: no fabrication in negative/degraded states", () => {
    it("completed with null payload renders explicit degraded state, no fabricated data", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "completed",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      // Must render explicit degraded/unavailable state
      expect(text).toContain("Report data is incomplete");
      expect(text).toContain("/tools/keyword-rank-checker/");

      // This tool has NO score — nothing may be fabricated
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("Score: ");

      // Must NOT contain result components
      expect(text).not.toContain("Top 10 results");
      expect(text).not.toContain("Your site");

      // Must NOT contain raw Next.js error details
      expect(text).not.toContain("digest");
      expect(text).not.toContain("stack");
    });

    it("completed with an unparseable payload string renders explicit degraded state", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "completed",
        result_payload: "{not valid json",
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(text).toContain("Report data is incomplete");
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("digest");
    });

    it("completed payload without the keyword-rank kind marker renders degraded state", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "completed",
        result_payload: { kind: "something-else", position: 3 },
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(text).toContain("Report data is incomplete");
      expect(text).not.toContain("#3");
      expect(text).not.toContain("Top 10 results");
    });

    it("failed status does not expose result data", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "failed",
        result_payload: buildKeywordRankPayload({ position: 1 }),
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(text).toContain("Report failed");
      expect(text).toContain(JOB_ID);
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("Top 10 results");
      expect(text).not.toContain("Your site");
      expect(text).not.toContain("#1");
    });

    it("timeout status does not expose result data", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "timeout",
        result_payload: buildKeywordRankPayload(),
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(text).toContain("Report failed");
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("Top 10 results");
      expect(text).not.toContain("Your site");
    });

    it("permanent and permanent_failure statuses do not expose result data", async () => {
      for (const status of ["permanent", "permanent_failure"]) {
        mockQueryRow({
          id: JOB_ID,
          target: "example.com",
          status,
          result_payload: buildKeywordRankPayload(),
        });

        const el = await KeywordRankJobResultPage({
          params: Promise.resolve({ jobId: JOB_ID }),
        });

        const text = renderToString(el);

        expect(text, status).toContain("Report failed");
        expect(text, status).toContain(JOB_ID);
        expect(text, status).not.toMatch(/\b\d+\/100\b/);
        expect(text, status).not.toContain("Top 10 results");
        expect(text, status).not.toContain("Your site");
      }
    });

    it("no state contains raw Next.js error digest or stack", async () => {
      interface TestCase {
        name: string;
        params: { jobId: string };
        dbThrows?: boolean;
        queryThrows?: boolean;
      }

      const testCases: TestCase[] = [
        {
          name: "malformed UUID",
          params: { jobId: "!!!not-valid!!!" },
        },
        {
          name: "DB construction failure",
          params: { jobId: JOB_ID },
          dbThrows: true,
        },
        {
          name: "job lookup failure",
          params: { jobId: JOB_ID },
          queryThrows: true,
        },
      ];

      for (const tc of testCases) {
        if (tc.dbThrows) {
          mockGetAdminDb.mockImplementation(() => {
            throw new Error("BOOM");
          });
        } else if (tc.queryThrows) {
          mockGetAdminDb.mockReturnValue({
            query: vi.fn().mockRejectedValue(new Error("BOOM")),
          });
        } else {
          mockGetAdminDb.mockReset();
        }

        const el = await KeywordRankJobResultPage({
          params: Promise.resolve(tc.params),
        });

        const text = renderToString(el);

        // No raw Next.js error details
        expect(text, tc.name).not.toContain("digest");
        expect(text, tc.name).not.toContain("stack:");
        expect(text, tc.name).not.toContain("BOOM");
        expect(text, tc.name).not.toContain("Error:");

        // Still has proper page structure
        expect(countMainNodes(el), tc.name).toBe(1);
      }
    });
  });

  // ------------------------------------------------------------------
  // In-flight state
  // ------------------------------------------------------------------

  describe("In-flight state renders the checking shell with the poller", () => {
    it("queued status renders the checking shell, helper copy and AuditPoller", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "queued",
        result_payload: null,
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);

      // English in-flight helper from the editorial lab spec
      expect(text).toContain("The audit is running. This page refreshes automatically.");

      // Meta strip exposes job identity and the keyword-rank queue discriminator
      expect(text).toContain(JOB_ID);
      expect(text).toContain("keyword_rank_audit");
      expect(text).toContain("Keyword Rank");

      // AuditPoller renders its queued label
      expect(text).toContain("Audit in queue");
    });
  });

  // ------------------------------------------------------------------
  // Completed with valid payload renders truthfully
  // ------------------------------------------------------------------

  describe("Completed state with valid payload renders truthfully", () => {
    it("renders the verdict (no fabricated score), position, table, badge and mock data-source label", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "completed",
        result_payload: buildKeywordRankPayload(),
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);

      // Spec h1 + verdict helper copy
      expect(text).toContain("Rank snapshot");
      expect(text).toContain(
        "Current positions for your tracked keywords in live search."
      );

      // The verdict is about top-10 presence: position present -> Pass,
      // and this tool has NO numeric score (nothing may be fabricated).
      expect(text).toContain("Pass");
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("Score: ");

      // Observed position block: heading, sentence, and the rank number
      // (react-dom server-escapes the quotes in the sentence).
      expect(text).toContain("Observed position");
      expect(text).toContain(
        'The target domain appeared in the top 10 results for &quot;seo denetimi&quot;.'
      );
      expect(text).toContain("#3");
      expect(text).toContain('aria-label="Position: 3"');

      // Metadata line carries domain/keyword/locale from the payload
      // (labels and values render in separate elements inside the mono line).
      expect(text).toContain("Domain:");
      expect(text).toContain("example.com");
      expect(text).toContain("Keyword:");
      expect(text).toContain("seo denetimi");
      expect(text).toContain("Locale:");
      expect(text).toContain("Türkçe (Türkiye)");

      // Top-10 table: 1 header row + 10 body rows
      expect(countTag(text, "tr")).toBe(11);
      expect(text).toContain("Top 10 results");
      expect(text).toContain("Your site");

      // Mock data source is labelled honestly as sample data
      expect(text).toContain("Sample data");
      expect(text).toContain(
        "SearXNG is not configured; results are deterministic sample data."
      );

      // Daily tracking keeps the shared button mount
      expect(text).toContain("Daily tracking");
    });

    it("renders the searxng data-source strip with the checked-at timestamp", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "completed",
        result_payload: buildKeywordRankPayload({ dataSource: "searxng" }),
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(text).toContain("Data source: SearXNG");
      expect(text).toContain("Checked at:");
      expect(text).toContain("2026-08-01T12:00:00.000Z");
      // The sample-data warning must not appear for a live source
      expect(text).not.toContain("SearXNG is not configured");
    });

    it("target row carries the highlight class and is not color-only", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "example.com",
        status: "completed",
        result_payload: buildKeywordRankPayload(),
      });

      const el = await KeywordRankJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      // Target row highlight: mineral background + signal left border
      expect(text).toContain("border-l-4 border-l-signal bg-mineral");
      // The explicit "Your site" badge is not color-only
      expect(text).toContain("Your site");
      // Position 3 row contains the target URL and its badge
      expect(text).toContain("https://example.com/sayfa");
    });
  });

  // ------------------------------------------------------------------
  // Not-in-top-10 state
  // ------------------------------------------------------------------

  describe("Not-in-top-10 state renders the explicit pill", () => {
    it("position null renders the Outside top 10 pill without a rank number", async () => {
      const payload = buildKeywordRankPayload({
        position: null,
        top10: (buildKeywordRankPayload().top10 as Array<Record<string, unknown>>).map(
          (entry) => ({
            ...entry,
            url: (entry.url as string).replace("example.com", "baska-rakip.com"),
            isTarget: false,
          }),
        ),
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

      const text = renderToString(el);

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);

      // The verdict fails (target absent from the top 10) with no score
      expect(text).toContain("Fail");
      expect(text).not.toMatch(/\b\d+\/100\b/);

      // Explicit not-found sentence + warning pill
      expect(text).toContain("The target domain did not appear in the top 10 results.");
      expect(text).toContain("Outside top 10");

      // No rank number may be invented
      expect(text).not.toContain("#3");
      expect(text).not.toContain('aria-label="Position: ');
      expect(text).not.toContain("Your site");
    });
  });
});
