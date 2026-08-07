/**
 * AI Crawler Result Page State Contract Tests
 *
 * VAL-CROSS-003: Every affected page has one main and one descriptive h1
 * VAL-CROSS-014: No fabrication and security boundaries hold
 *
 * The ai-crawler-checker result page at
 * `/tools/ai-crawler-checker/result/[jobId]` renders every lifecycle state
 * through the shared result-pages kit (ResultShell, VerdictCard,
 * IssueLedger, ReportErrorPanel, CrawlerAccessMatrix) with the English copy
 * from the editorial lab spec. An unrecognised persisted job_records.status
 * renders an explicit unknown-status state instead of crashing on the result
 * payload, while preserving the one-main/one-h1 landmark contract. Follows
 * the geo/schema result-states test conventions.
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

const JOB_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function mockQueryRow(row: Record<string, unknown>) {
  mockGetAdminDb.mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [row] }),
  });
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function buildAiCrawlerPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    score: 90,
    robotsTxtFound: true,
    robotsTxtUrl: "https://example.com/robots.txt",
    sitemaps: [],
    crawlers: [],
    conflicts: [],
    recommendations: [],
    parseErrors: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The page component — imported after mocks so the module graph resolves
// with our controlled dependencies.
// ---------------------------------------------------------------------------

let AiCrawlerJobResultPage: (
  props: { params: Promise<{ jobId: string }> },
) => Promise<React.ReactElement>;

beforeAll(async () => {
  const mod = await import(
    "../../app/tools/ai-crawler-checker/result/[jobId]/page"
  );
  AiCrawlerJobResultPage = mod.default;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AI Crawler Result Page State Contract", () => {
  // ------------------------------------------------------------------
  // VAL-CROSS-003: one main, one descriptive h1
  // ------------------------------------------------------------------

  describe("VAL-CROSS-003: one main + one descriptive h1 per state", () => {
    it("malformed non-UUID renders exactly one main with one h1 (Report not found)", async () => {
      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: "not-a-uuid" }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("AI crawler access");

      const fullText = renderToString(el);
      expect(fullText).toContain("Report not found");
      expect(fullText).not.toContain("temporarily unavailable");
    });

    it("valid UUID with no matching row renders exactly one main with one h1 (Report not found)", async () => {
      mockGetAdminDb.mockReturnValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("AI crawler access");

      const fullText = renderToString(el);
      expect(fullText).toContain("Report not found");
      expect(fullText).not.toContain("temporarily unavailable");
    });

    it("DB construction failure renders exactly one main with one h1 (Service unavailable)", async () => {
      mockGetAdminDb.mockImplementation(() => {
        throw new Error("DB connection refused");
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("AI crawler access");

      const fullText = renderToString(el);
      expect(fullText).toContain("Service temporarily unavailable");
    });

    it("job lookup failure renders exactly one main with one h1 (Service unavailable)", async () => {
      mockGetAdminDb.mockReturnValue({
        query: vi.fn().mockRejectedValue(new Error("Connection lost")),
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("AI crawler access");

      const fullText = renderToString(el);
      expect(fullText).toContain("Service temporarily unavailable");
    });

    it("queued status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "queued",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("running status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "running",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("pending status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "pending",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("completed status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "completed",
        result_payload: buildAiCrawlerPayload(),
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("failed status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "failed",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("timeout status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "timeout",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("permanent status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "permanent",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("permanent_failure status renders exactly one main with one descriptive h1", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "permanent_failure",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("unknown persisted status renders exactly one main with one descriptive h1, no error boundary", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "mysterious_persisted_status",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
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

      // Must NOT contain result components or score data
      expect(text).not.toContain("Evidence ledger");
      expect(text).not.toContain("Bot access matrix");
      expect(text).not.toMatch(/\b\d+\/100\b/);

      // Must NOT leak the retired Turkish page copy
      expect(text).not.toContain("AI Crawler Erişim Denetim Sonucu");
      expect(text).not.toContain("Mükemmel");
    });
  });

  // ------------------------------------------------------------------
  // VAL-CROSS-014: No fabrication
  // ------------------------------------------------------------------

  describe("VAL-CROSS-014: no fabrication in negative/degraded states", () => {
    it("completed with null payload renders explicit degraded state, no fabricated data", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "completed",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      // Must render explicit degraded/unavailable state
      expect(text).toContain("Report data is incomplete");
      expect(text).toContain("/tools/ai-crawler-checker/");

      // Must NOT contain fabricated score data
      expect(text).not.toMatch(/\b\d+\/100\b/);

      // Must NOT contain result components
      expect(text).not.toContain("Evidence ledger");
      expect(text).not.toContain("Bot access matrix");

      // Must NOT contain raw Next.js error details
      expect(text).not.toContain("digest");
      expect(text).not.toContain("stack");
    });

    it("completed with an unparseable payload string renders explicit degraded state", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "completed",
        result_payload: "{not valid json",
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(text).toContain("Report data is incomplete");
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("digest");
    });

    it("failed status does not expose result data", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "failed",
        result_payload: buildAiCrawlerPayload({ score: 95 }),
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(text).toContain("Report failed");
      expect(text).toContain(JOB_ID);
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("Evidence ledger");
      expect(text).not.toContain("Bot access matrix");
      expect(text).not.toContain("robots.txt was found and parsed");
    });

    it("timeout status does not expose result data", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "timeout",
        result_payload: buildAiCrawlerPayload(),
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(text).toContain("Report failed");
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("Evidence ledger");
      expect(text).not.toContain("Bot access matrix");
    });

    it("permanent and permanent_failure statuses do not expose result data", async () => {
      for (const status of ["permanent", "permanent_failure"]) {
        mockQueryRow({
          id: JOB_ID,
          target: "https://example.com",
          status,
          result_payload: buildAiCrawlerPayload(),
        });

        const el = await AiCrawlerJobResultPage({
          params: Promise.resolve({ jobId: JOB_ID }),
        });

        const text = renderToString(el);

        expect(text, status).toContain("Report failed");
        expect(text, status).toContain(JOB_ID);
        expect(text, status).not.toMatch(/\b\d+\/100\b/);
        expect(text, status).not.toContain("Evidence ledger");
        expect(text, status).not.toContain("Bot access matrix");
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

        const el = await AiCrawlerJobResultPage({
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
        target: "https://example.com",
        status: "queued",
        result_payload: null,
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);

      // English in-flight helper from the editorial lab spec
      expect(text).toContain("The audit is running. This page refreshes automatically.");

      // Meta strip exposes job identity and the ai-crawler queue discriminator
      expect(text).toContain(JOB_ID);
      expect(text).toContain("ai_crawler_audit");
      expect(text).toContain("AI Crawler");

      // AuditPoller renders its queued label
      expect(text).toContain("Audit in queue");
    });
  });

  // ------------------------------------------------------------------
  // Completed with valid payload renders truthfully
  // ------------------------------------------------------------------

  describe("Completed state with valid payload renders truthfully", () => {
    it("renders the verdict score, ledger metrics and matrix from the payload", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "completed",
        result_payload: buildAiCrawlerPayload(),
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);

      // Spec h1 + helper copy
      expect(text).toContain("AI crawler access");
      expect(text).toContain("Whether AI training and retrieval bots can read this site.");

      // Truthful score rendered + VerdictCard exposes it to assistive tech
      expect(text).toContain("Score: 90 out of 100");

      // Score 90 -> excellent band -> pass verdict
      expect(text).toContain("Pass");

      // Evidence ledger projects every signal the payload carries
      expect(text).toContain("Evidence ledger");
      expect(text).toContain("robots.txt");
      expect(text).toContain("robots.txt was found and parsed at https://example.com/robots.txt.");
      expect(text).toContain("Sitemap files");
      expect(text).toContain("Parse errors");
      expect(text).toContain("Rule conflicts");
      expect(text).toContain("Recommendations");

      // Meta strip exposes the queue discriminator in the completed state too
      expect(text).toContain("ai_crawler_audit");
      expect(text).toContain("AI Crawler");
    });

    it("renders detail rows and matrix copy when the payload carries them", async () => {
      mockQueryRow({
        id: JOB_ID,
        target: "https://example.com",
        status: "completed",
        result_payload: buildAiCrawlerPayload({
          score: 55,
          robotsTxtFound: false,
          sitemaps: ["https://example.com/sitemap.xml"],
          parseErrors: ["Unrecognized directive", "Missing field value"],
          conflicts: [
            {
              description: "GPTBot is both allowed and blocked",
              lines: ["Allow: /", "Disallow: /private"],
            },
          ],
          recommendations: ["Add a dedicated robots.txt policy for AI training bots."],
          crawlers: [
            { userAgent: "OAI-SearchBot", label: "OAI-SearchBot", category: "ai-search", status: "blocked" },
            { userAgent: "GPTBot", label: "GPTBot", category: "ai-training", status: "blocked" },
            { userAgent: "Googlebot", label: "Googlebot", category: "search", status: "allowed" },
            { userAgent: "CCBot", label: "CCBot", category: "ai-training", status: "partial" },
          ],
        }),
      });

      const el = await AiCrawlerJobResultPage({
        params: Promise.resolve({ jobId: JOB_ID }),
      });

      const text = renderToString(el);

      // Truthful score + band -> poor -> fail verdict
      expect(text).toContain("Score: 55 out of 100");
      expect(text).toContain("Fail");

      // robots.txt not found row
      expect(text).toContain("No robots.txt was found at https://example.com/robots.txt.");

      // Sitemap enumeration row
      expect(text).toContain("1 sitemap file(s) referenced in robots.txt: https://example.com/sitemap.xml.");

      // Detail rows enumerate exactly what the payload stores
      expect(text).toContain("Parse error details");
      expect(text).toContain("Unrecognized directive");
      expect(text).toContain("Missing field value");
      expect(text).toContain("Rule conflict details");
      expect(text).toContain("GPTBot is both allowed and blocked");
      expect(text).toContain("Recommendation details");
      expect(text).toContain("Add a dedicated robots.txt policy for AI training bots.");

      // Matrix renders category headings and English statuses
      expect(text).toContain("Bot access matrix");
      expect(text).toContain("AI search &amp; answer bots");
      expect(text).toContain("AI training bots");
      expect(text).toContain("Traditional search bots");
      expect(text).toContain("Allowed");
      expect(text).toContain("Blocked");
      expect(text).toContain("Partial");
    });
  });
});
