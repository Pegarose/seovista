/**
 * Result-Page Editorial Lab — Task 1 shared kit tests.
 *
 * The result-pages kit (ResultShell, StatusPill, AuditMetaStrip,
 * ReportErrorPanel) is the shared shell every tool's result page mounts.
 * These tests lock the one-main/one-h1 landmark contract, the design-token
 * variant vocabulary (never slate-*), mono meta rendering, and the live
 * region semantics of the error panel. Follows the schema-result-states
 * test conventions: renderToStaticMarkup resolves function components so
 * assertions run against the exact HTML the browser receives.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ResultShell,
  StatusPill,
  AuditMetaStrip,
  ReportErrorPanel,
  VerdictCard,
  IssueLedger,
  UnknownJobStatusView,
  CitationGraph,
  type CitationGraphProps,
} from "@/components/result-pages";

// ---------------------------------------------------------------------------
// Mock setup — vi.mock calls are hoisted above all imports. The two page
// components below import AuditPoller (next/navigation + geo-checker/actions)
// and getAdminDb, so the controlled doubles are declared up front and the
// page modules are imported dynamically in beforeAll after these run.
// ---------------------------------------------------------------------------

const mockGetAdminDb = vi.hoisted(() => vi.fn());

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

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

/** Stable job id shared by the page-level structural suites below. */
const JOB_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/** Point getAdminDb at a fake client whose query resolves to one row. */
function mockQueryRow(row: Record<string, unknown>) {
  mockGetAdminDb.mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [row] }),
  });
}

// ---------------------------------------------------------------------------
// Page components — imported after the mocks so the module graph resolves
// with our controlled dependencies (same convention as the other result
// state suites).
// ---------------------------------------------------------------------------

let SchemaTruthJobResultPage: (
  props: { params: Promise<{ jobId: string }> },
) => Promise<React.ReactElement>;
let RenderParityJobResultPage: (
  props: { params: Promise<{ jobId: string }> },
) => Promise<React.ReactElement>;
let AttributionTraceJobResultPage: (
  props: { params: Promise<{ jobId: string }> },
) => Promise<React.ReactElement>;

beforeAll(async () => {
  const schemaTruth = await import(
    "../../app/tools/schema-truth-check/result/[jobId]/page"
  );
  SchemaTruthJobResultPage = schemaTruth.default;
  const renderParity = await import(
    "../../app/tools/render-parity-diff/result/[jobId]/page"
  );
  RenderParityJobResultPage = renderParity.default;
  const attributionTrace = await import(
    "../../app/tools/attribution-trace/result/[jobId]/page"
  );
  AttributionTraceJobResultPage = attributionTrace.default;
});

// ---------------------------------------------------------------------------
// UnknownJobStatusView — single main/h1 + Try again link
// ---------------------------------------------------------------------------

describe("UnknownJobStatusView", () => {
  it("renders exactly one <main>, one <h1> with the English copy, and a Try again link to /tools/", () => {
    const markup = renderToStaticMarkup(<UnknownJobStatusView />);

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain("We can&#x27;t find this report");
    expect(markup).toContain("Start a new audit to get a fresh link");
    expect(markup).toContain('href="/tools/"');
    expect(markup).toContain("Try again");
  });
});

// ---------------------------------------------------------------------------
// ResultShell — landmark contract
// ---------------------------------------------------------------------------

describe("ResultShell", () => {
  it("renders exactly one <main> and one <h1>", () => {
    const markup = renderToStaticMarkup(
      <ResultShell
        eyebrow="Audit"
        title="Result page"
        status="completed"
        meta={{
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          queueName: "ai_crawler_audit",
          toolLabel: "AI Crawler",
        }}
      >
        <p>Body content</p>
      </ResultShell>,
    );

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    // Header carries the page's single title.
    expect(markup).toContain("Result page");
  });

  it("does not render the meta strip when meta is omitted", () => {
    const markup = renderToStaticMarkup(
      <ResultShell eyebrow="Audit" title="No meta" status="unknown">
        <p>Body</p>
      </ResultShell>,
    );

    expect(markup).not.toContain("Job ID");
  });
});

// ---------------------------------------------------------------------------
// StatusPill — five variants, design-token classes only
// ---------------------------------------------------------------------------

describe("StatusPill", () => {
  const variants: Array<[string, string, string]> = [
    ["in_progress", "In progress", "text-spectral"],
    ["success", "Complete", "text-signal"],
    ["warning", "Needs attention", "text-ember"],
    ["failure", "Failed", "text-ember"],
    ["unknown", "Status unknown", "text-muted-ink"],
  ];

  it.each(variants)("renders %s with %s label and %s token, no slate-", (variant, label, tokenClass) => {
    const markup = renderToStaticMarkup(
      <StatusPill variant={variant as "in_progress"} />,
    );

    expect(markup).toContain(label);
    expect(markup).toContain(tokenClass);
    expect(markup).toContain('role="status"');
    // No slate/gray/indigo utilities anywhere in the rendered output.
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("honours a custom aria-label override", () => {
    const markup = renderToStaticMarkup(
      <StatusPill variant="success" ariaLabel="Crawl finished" />,
    );

    expect(markup).toContain('aria-label="Crawl finished"');
  });
});

// ---------------------------------------------------------------------------
// AuditMetaStrip — mono meta rendering
// ---------------------------------------------------------------------------

describe("AuditMetaStrip", () => {
  it("renders jobId and queueName as mono text", () => {
    const jobId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const queueName = "ai_crawler_audit";

    const markup = renderToStaticMarkup(
      <AuditMetaStrip
        jobId={jobId}
        queueName={queueName}
        toolLabel="AI Crawler"
      />,
    );

    expect(markup).toContain("font-mono");
    expect(markup).toContain(jobId);
    expect(markup).toContain(queueName);
    expect(markup).toContain("AI Crawler");
  });

  it("renders the submitted timestamp when provided", () => {
    const markup = renderToStaticMarkup(
      <AuditMetaStrip
        jobId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        queueName="ai_crawler_audit"
        submittedAt="2026-01-02T03:04:05Z"
        toolLabel="AI Crawler"
      />,
    );

    expect(markup).toContain("2026-01-02T03:04:05Z");
  });
});

// ---------------------------------------------------------------------------
// ReportErrorPanel — live region + retry anchor
// ---------------------------------------------------------------------------

describe("ReportErrorPanel", () => {
  it("has role=status and aria-live=polite", () => {
    const markup = renderToStaticMarkup(
      <ReportErrorPanel title="Report failed" body="It did not work." />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("renders an anchor pointing at retryHref when set", () => {
    const markup = renderToStaticMarkup(
      <ReportErrorPanel
        title="Report failed"
        body="It did not work."
        correlationId="corr-123"
        retryHref="/tools/ai-crawler"
      />,
    );

    expect(markup).toContain('href="/tools/ai-crawler"');
    expect(markup).toContain("corr-123");
    expect(markup).toContain("Try again");
  });

  it("defaults the retry label when not provided", () => {
    const markup = renderToStaticMarkup(
      <ReportErrorPanel
        title="Report failed"
        body="It did not work."
        retryHref="/tools/ai-crawler"
        retryLabel="Re-run"
      />,
    );

    expect(markup).toContain("Re-run");
  });
});

// ---------------------------------------------------------------------------
// VerdictCard — variant pill, score block, design-token classes only
// ---------------------------------------------------------------------------

describe("VerdictCard", () => {
  const variants: Array<[string, string, string]> = [
    ["pass", "Pass", "text-signal"],
    ["warn", "Warning", "text-ember"],
    ["fail", "Fail", "text-ember"],
    ["info", "Info", "text-spectral"],
  ];

  it.each(variants)("renders %s pill with %s label and %s token, no slate-", (variant, label, tokenClass) => {
    const markup = renderToStaticMarkup(
      <VerdictCard variant={variant as "pass"} title="Title" summary="Summary." />,
    );

    expect(markup).toContain(label);
    expect(markup).toContain(tokenClass);
    // No slate/gray/indigo utilities anywhere in the rendered output.
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("renders the score with the expected aria-label when score is set", () => {
    const markup = renderToStaticMarkup(
      <VerdictCard
        variant="pass"
        title="Title"
        summary="Summary."
        score={85}
      />,
    );

    expect(markup).toContain('aria-label="Score: 85 out of 100"');
    expect(markup).toContain("/100");
  });

  it("renders no score block when score is omitted", () => {
    const markup = renderToStaticMarkup(
      <VerdictCard variant="info" title="Title" summary="Summary." />,
    );

    expect(markup).not.toContain("out of 100");
    expect(markup).not.toContain("/100");
  });
});

// ---------------------------------------------------------------------------
// IssueLedger — heading, severity tone, source link, empty state
// ---------------------------------------------------------------------------

describe("IssueLedger", () => {
  it("renders the heading, a severity-toned index, and the source href", () => {
    const items: Array<{
      id: string;
      severity: "pass" | "warn" | "fail" | "info";
      title: string;
      detail: string;
      source?: { label: string; url: string };
    }> = [
      { id: "a", severity: "fail", title: "Missing alt text", detail: "Three images lack alt." },
      {
        id: "b",
        severity: "pass",
        title: "Canonical present",
        detail: "Canonical URL is set.",
        source: { label: "example.com", url: "https://example.com/" },
      },
      { id: "c", severity: "info", title: "Duplicate meta", detail: "Two meta descriptions." },
    ];

    const markup = renderToStaticMarkup(
      <IssueLedger heading="Evidence ledger" items={items} />,
    );

    expect(markup).toContain("<h2");
    expect(markup).toContain("Evidence ledger");
    expect(markup).toContain("text-ember"); // severity tone on a fail row index
    expect(markup).toContain('href="https://example.com/"');
    expect(markup).toContain("example.com");
  });

  it("renders the empty-state text when items is empty", () => {
    const markup = renderToStaticMarkup(
      <IssueLedger heading="Evidence ledger" items={[]} />,
    );

    expect(markup).toContain("No issues found.");
  });
});

// ---------------------------------------------------------------------------
// Schema Truth Result Page — Task 8 structural assertions
// ---------------------------------------------------------------------------

describe("Schema Truth Result Page", () => {
  function buildSchemaTruthPayload(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      kind: "schema-truth",
      score: 80,
      totalClaims: 5,
      verifiedClaims: 4,
      notVerifiableClaims: 1,
      findings: [
        { field: "name", value: "SeoVista", status: "verified" },
        { field: "offers.price", value: "29", status: "not_verifiable" },
      ],
      rawScriptCount: 2,
      parseErrors: [],
      ...overrides,
    };
  }

  it("invalid UUID renders exactly one main + one h1 'Schema truth' with Report not found", async () => {
    const el = await SchemaTruthJobResultPage({
      params: Promise.resolve({ jobId: "not-a-uuid" }),
    });
    const markup = renderToStaticMarkup(el);

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain("Schema truth");
    expect(markup).toContain("Report not found");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("completed renders VerdictCard, score aria, ledger findings and CTA, no slate tokens", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: buildSchemaTruthPayload(),
    });
    const el = await SchemaTruthJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });
    const markup = renderToStaticMarkup(el);

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain("Schema truth");
    expect(markup).toContain("Truthfulness report");
    expect(markup).toContain(
      "Where your markup contradicts on-page facts, and what to fix first."
    );
    expect(markup).toContain('aria-label="Score: 80 out of 100"');
    expect(markup).toContain("Evidence ledger");

    // Ledger rows project every finding: verdict string + field + value.
    expect(markup).toContain("Verified on page");
    expect(markup).toContain("Not found on page");
    expect(markup).toContain("name: SeoVista");
    expect(markup).toContain("offers.price: 29");

    // Page identity line + next-step CTA link.
    expect(markup).toContain("Page:");
    expect(markup).toContain("Compare with the Schema Checker for a full parse log");
    expect(markup).toContain('href="/tools/schema-checker/"');

    // Score footnote from the brief.
    expect(markup).toContain(
      "The score is the share of JSON-LD claims that appear on the page."
    );

    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("completed with zero claims renders the info verdict and no fabricated score", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: buildSchemaTruthPayload({
        score: 100,
        totalClaims: 0,
        verifiedClaims: 0,
        notVerifiableClaims: 0,
        findings: [],
      }),
    });
    const el = await SchemaTruthJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });
    const markup = renderToStaticMarkup(el);

    expect(markup).toContain("Info");
    expect(markup).toContain("No claims to check on this page.");
    expect(markup).not.toContain("out of 100");
    expect(markup).not.toContain("/100");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("completed with parse errors renders the warn parse-error row group", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: buildSchemaTruthPayload({
        parseErrors: ["Unexpected token in JSON at position 12"],
      }),
    });
    const el = await SchemaTruthJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });
    const markup = renderToStaticMarkup(el);

    expect(markup).toContain("Parse errors");
    expect(markup).toContain("Unexpected token in JSON at position 12");
    expect(markup).toContain("Evidence ledger");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });
});

// ---------------------------------------------------------------------------
// Render Parity Result Page — Task 8 structural assertions
// ---------------------------------------------------------------------------

describe("Render Parity Result Page", () => {
  function buildRenderParityPayload(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const side = {
      url: "https://example.com/",
      status: 200,
      title: "Example",
      metaDescription: "A demo page",
      canonical: "https://example.com/",
      h1: ["Example H1"],
      tokenCount: 42,
    };
    return {
      kind: "render-parity",
      score: 90,
      renderedParityRatio: 0.96,
      default: side,
      crawler: { ...side, tokenCount: 40 },
      h1OnlyInDefault: [],
      h1OnlyInCrawler: [],
      issues: [],
      ...overrides,
    };
  }

  it("invalid UUID renders exactly one main + one h1 'Render parity' with Report not found", async () => {
    const el = await RenderParityJobResultPage({
      params: Promise.resolve({ jobId: "not-a-uuid" }),
    });
    const markup = renderToStaticMarkup(el);

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain("Render parity");
    expect(markup).toContain("Report not found");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("completed renders VerdictCard with ratio-derived variant, ledger and side cards, no slate tokens", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: buildRenderParityPayload(),
    });
    const el = await RenderParityJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });
    const markup = renderToStaticMarkup(el);

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain("Render parity");
    expect(markup).toContain("Parity report");
    expect(markup).toContain(
      "Differences between raw HTML and the rendered page AI systems see."
    );
    expect(markup).toContain('aria-label="Score: 90 out of 100"');
    // ratio 0.96 >= 0.95 -> pass pill
    expect(markup).toContain(">Pass<");
    expect(markup).toContain("Text similarity");
    expect(markup).toContain("Evidence ledger");

    // Side-by-side metadata cards keep final URL + token count.
    expect(markup).toContain("Default (browser) request");
    expect(markup).toContain("Crawler (bot) request");
    expect(markup).toContain("Final URL");
    expect(markup).toContain("Text token count");
    expect(markup).toContain("https://example.com/");

    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("renders issue rows with severity mapping and h1-only rows from the payload", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: buildRenderParityPayload({
        score: 40,
        renderedParityRatio: 0.5,
        issues: [
          {
            field: "title",
            severity: "warning",
            description: "Titles differ between the two requests.",
          },
          {
            field: "text",
            severity: "error",
            description: "No visible text found in the crawler side.",
          },
        ],
        h1OnlyInDefault: ["Missing in crawler"],
        h1OnlyInCrawler: [],
      }),
    });
    const el = await RenderParityJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });
    const markup = renderToStaticMarkup(el);

    expect(markup).toContain("Warning");
    expect(markup).toContain("Error");
    expect(markup).toContain("Titles differ between the two requests.");
    expect(markup).toContain("No visible text found in the crawler side.");
    expect(markup).toContain("H1s only in the default request");
    expect(markup).toContain("Missing in crawler");
    // ratio 0.5 < 0.85 -> fail pill
    expect(markup).toContain(">Fail<");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });
});

// ---------------------------------------------------------------------------
// Attribution Trace Result Page — Task 9 structural assertions
// ---------------------------------------------------------------------------

describe("Attribution Trace Result Page", () => {
  function buildAttributionPayload(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      kind: "attribution-trace",
      score: 82,
      totalClaims: 2,
      selfClaims: 0,
      externalClaims: 1,
      misattributedClaims: 0,
      unverifiableClaims: 1,
      verdicts: [
        {
          claim: "SeoVista measurably improves GEO visibility.",
          kind: "external",
          bestSourceId: "serp:1",
          bestSimilarity: 0.85,
        },
        {
          claim: "A claim with no traceable source.",
          kind: "unverifiable",
          bestSimilarity: 0,
        },
      ],
      serpSources: [
        {
          id: "serp:1",
          label: "SeoVista Blog",
          text: "SeoVista measurably improves GEO visibility.",
          kind: "external",
          url: "https://blog.seovista.example/geo-visibility",
        },
      ],
      ...overrides,
    };
  }

  it("invalid UUID renders exactly one main + one h1 'Citation trace' with Report not found", async () => {
    const el = await AttributionTraceJobResultPage({
      params: Promise.resolve({ jobId: "not-a-uuid" }),
    });
    const markup = renderToStaticMarkup(el);

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain("Citation trace");
    expect(markup).toContain("Report not found");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("completed renders VerdictCard, score aria, stats row, ledger with source links and kind badges, no slate tokens", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: buildAttributionPayload(),
    });
    const el = await AttributionTraceJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });
    const markup = renderToStaticMarkup(el);

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain("Citation trace");
    expect(markup).toContain(
      "Which sources support your claims, and how strongly."
    );
    // Score 82 -> info band, score aria via VerdictCard.
    expect(markup).toContain('aria-label="Score: 82 out of 100"');
    expect(markup).toContain("Traceability");

    // Stats row: labels present; avg similarity (0.85 + 0.0)/2 = 42.5 -> 43
    // is a distinctive numeral proving the mono stats render.
    expect(markup).toContain("Claims checked");
    expect(markup).toContain("Sources matched");
    expect(markup).toContain("Best similarity");
    expect(markup).toContain("Avg similarity");
    expect(markup).toContain("43");

    // Page identity line shows the URL-input target.
    expect(markup).toContain("Page:");
    expect(markup).toContain("https://example.com");

    // Ledger: pass row + warn row, detail carries kind label + claim text.
    expect(markup).toContain("Evidence ledger");
    expect(markup).toContain("Source found");
    expect(markup).toContain("Weak or no source");
    expect(markup).toContain(
      "External source: SeoVista measurably improves GEO visibility."
    );

    // Source link from the best-matched SERP source.
    expect(markup).toContain(
      'href="https://blog.seovista.example/geo-visibility"'
    );
    expect(markup).toContain("SeoVista Blog");

    // Kind badge chips: label + token classes for the kinds present.
    expect(markup).toContain("External source");
    expect(markup).toContain("Unverifiable");
    expect(markup).toContain("text-spectral");
    expect(markup).toContain("text-muted-ink");

    // Traceability footnote + schema-truth CTA.
    expect(markup).toContain(
      "Scores reflect how strongly search results support the claim text."
    );
    expect(markup).toContain('href="/tools/schema-truth-check/"');

    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("completed with a >=90 score renders the pass verdict and score aria", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: buildAttributionPayload({
        score: 92,
        selfClaims: 0,
        externalClaims: 1,
        misattributedClaims: 0,
        unverifiableClaims: 0,
        verdicts: [
          {
            claim: "SeoVista measurably improves GEO visibility.",
            kind: "external",
            bestSourceId: "serp:1",
            bestSimilarity: 0.95,
          },
        ],
      }),
    });
    const el = await AttributionTraceJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });
    const markup = renderToStaticMarkup(el);

    expect(markup).toContain('aria-label="Score: 92 out of 100"');
    expect(markup).toContain(">Pass<");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("completed with zero claims renders the info verdict and no fabricated score", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: buildAttributionPayload({
        score: 100,
        totalClaims: 0,
        selfClaims: 0,
        externalClaims: 0,
        misattributedClaims: 0,
        unverifiableClaims: 0,
        verdicts: [],
        serpSources: [],
      }),
    });
    const el = await AttributionTraceJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });
    const markup = renderToStaticMarkup(el);

    expect(markup).toContain("Info");
    expect(markup).toContain("No claims were found in the pasted answer.");
    expect(markup).not.toContain("out of 100");
    expect(markup).not.toContain("/100");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("completed with all-zero similarities renders the info verdict and no fabricated score", async () => {
    mockQueryRow({
      id: JOB_ID,
      target: "https://example.com",
      status: "completed",
      result_payload: buildAttributionPayload({
        score: 0,
        selfClaims: 0,
        externalClaims: 0,
        misattributedClaims: 1,
        unverifiableClaims: 0,
        verdicts: [
          {
            claim: "A claim with no traceable source.",
            kind: "misattributed",
            bestSimilarity: 0,
          },
        ],
      }),
    });
    const el = await AttributionTraceJobResultPage({
      params: Promise.resolve({ jobId: JOB_ID }),
    });
    const markup = renderToStaticMarkup(el);

    expect(markup).toContain("Info");
    expect(markup).not.toContain("out of 100");
    expect(markup).not.toContain("/100");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });
});

// ---------------------------------------------------------------------------
// CitationGraph — SSR SVG citation graph (Task 10)
// ---------------------------------------------------------------------------

describe("CitationGraph", () => {
  /**
   * Fixture: 4 verdicts, every one resolved to a visible source (3 external
   * → SERP docs, 1 → the site's own page) plus 3 SERP source docs and the
   * implicit self node. Four verdicts all-with-sources is the only fixture
   * that satisfies the brief's numeric contract simultaneously: "four <line>
   * elements (one per verdict)" and "one node per verdict + one per source
   * + the self node" (4 + 3 + 1 = 8 circles). The brief's "3-verdict + 3
   * -source payload" phrasing cannot produce four edges under the normative
   * "no edge when a verdict has no best source" rule, so the no-source ember
   * path is exercised by its own focused test below.
   */
  function buildGraphFixture(): CitationGraphProps {
    const verdicts: CitationGraphProps["verdicts"] = [
      {
        claim: "SeoVista measurably improves GEO visibility.",
        kind: "external",
        bestSourceId: "serp:1",
        bestSimilarity: 0.85,
      },
      {
        claim: "SeoVista ships a Schema Truth Check tool.",
        kind: "external",
        bestSourceId: "serp:2",
        bestSimilarity: 0.5,
      },
      {
        claim: "SeoVista supports 14 locales.",
        kind: "external",
        bestSourceId: "serp:3",
        bestSimilarity: 0.3,
      },
      {
        claim: "SeoVista publishes its methodology openly.",
        kind: "self",
        bestSourceId: "self",
        bestSimilarity: 0.95,
      },
    ];
    const serpSources: CitationGraphProps["serpSources"] = [
      {
        id: "serp:1",
        label: "SeoVista Blog",
        text: "SeoVista measurably improves GEO visibility.",
        kind: "external",
        url: "https://blog.seovista.example/geo-visibility",
      },
      {
        id: "serp:2",
        label: "SeoVista Docs",
        text: "SeoVista ships a Schema Truth Check tool.",
        kind: "external",
        url: "https://docs.seovista.example/schema-truth",
      },
      {
        id: "serp:3",
        label: "SeoVista Pricing",
        text: "SeoVista supports 14 locales.",
        kind: "external",
        url: "https://seovista.example/pricing",
      },
    ];
    return { verdicts, serpSources, targetHost: "example.com" };
  }

  it("renders the figure as an image with 4 edges, 8 nodes and a similarity tooltip", () => {
    const markup = renderToStaticMarkup(<CitationGraph {...buildGraphFixture()} />);

    // figure carries the image semantics + the graph label.
    expect(markup).toContain("<figure");
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Citation graph"');

    // Fixed viewBox; one edge per verdict with the brief's stroke formula.
    expect(markup).toContain('viewBox="0 0 900 240"');
    expect(countTag(markup, "line")).toBe(4);
    // 0.85 -> 0.5 + 2*0.85 = 2.2
    expect(markup).toContain('stroke-width="2.2"');

    // 4 claim nodes + 3 SERP source nodes + 1 self node.
    expect(countTag(markup, "circle")).toBe(8);

    // Tooltip inside one of the edges carries the similarity percentage.
    expect(markup).toMatch(/→ .*\(85%\)/);

    // figcaption carries the spec's summary sentence; self node is the host.
    expect(markup).toContain(
      "Where each claim came from, and which sources carried the most weight."
    );
    expect(markup).toContain("example.com");

    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("renders an ember claim node and no edge for a verdict without a source", () => {
    const { serpSources, targetHost } = buildGraphFixture();
    const markup = renderToStaticMarkup(
      <CitationGraph
        verdicts={[
          { claim: "A claim with no traceable source.", kind: "unverifiable", bestSimilarity: 0 },
        ]}
        serpSources={serpSources}
        targetHost={targetHost}
      />,
    );

    // No edges for the unsourced verdict; its node is ember; source nodes remain.
    expect(countTag(markup, "line")).toBe(0);
    expect(countTag(markup, "circle")).toBe(1 + serpSources.length + 1);
    expect(markup).toContain('style="fill:var(--color-ember)"');
    expect(markup).not.toContain("→");
  });

  it("caps claim rows at 7 and renders a muted +N more row", () => {
    const { serpSources, targetHost } = buildGraphFixture();
    const base = buildGraphFixture().verdicts;
    const verdicts = Array.from({ length: 9 }, (_, i) => {
      const seed = base[i % base.length]!;
      return {
        claim: `Claim number ${i + 1}.`,
        kind: seed.kind,
        bestSourceId: `serp:${(i % 3) + 1}`,
        bestSimilarity: seed.bestSimilarity,
      };
    });

    const markup = renderToStaticMarkup(
      <CitationGraph verdicts={verdicts} serpSources={serpSources} targetHost={targetHost} />,
    );

    // 7 visible claim rows + 3 SERP sources + 1 self node; the rest surface as text.
    expect(countTag(markup, "circle")).toBe(7 + serpSources.length + 1);
    expect(markup).toContain("+2 more");
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("falls back to the ledger empty state when there are no verdicts", () => {
    const { serpSources, targetHost } = buildGraphFixture();
    const markup = renderToStaticMarkup(
      <CitationGraph verdicts={[]} serpSources={serpSources} targetHost={targetHost} />,
    );

    // No SVG; the IssueLedger empty visual (same copy the page uses) instead.
    expect(markup).not.toContain("<svg");
    expect(markup).not.toContain('aria-label="Citation graph"');
    expect(markup).toContain("No claims were found in the pasted answer.");
  });
});
