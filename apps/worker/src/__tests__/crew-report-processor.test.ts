import { describe, expect, it } from "vitest";

import {
  CREW_REPORT_TOOLS,
  TOOL_QUEUE_NAMES,
  buildCrewReportRequest,
  buildCrewReportResultPayload,
} from "../processors/crew-report.js";

describe("CREW_REPORT_TOOLS / TOOL_QUEUE_NAMES", () => {
  it("lists the four supported tools in order", () => {
    expect(CREW_REPORT_TOOLS).toEqual([
      "geo-readiness",
      "schema",
      "ai-crawler",
      "keyword-rank",
    ]);
  });

  it("maps each tool to the queue_name of its source audit chain", () => {
    expect(TOOL_QUEUE_NAMES["geo-readiness"]).toBe("geo_audit");
    expect(TOOL_QUEUE_NAMES["schema"]).toBe("schema_audit");
    expect(TOOL_QUEUE_NAMES["ai-crawler"]).toBe("ai_crawler_audit");
    expect(TOOL_QUEUE_NAMES["keyword-rank"]).toBe("keyword_rank_audit");
  });
});

describe("buildCrewReportRequest", () => {
  it("maps keyword-rank to /api/seo-brief with konu/brand_context/dil", () => {
    const request = buildCrewReportRequest({
      tool: "keyword-rank",
      sourcePayload: {
        kind: "keyword-rank",
        domain: "example.com",
        keyword: "seo",
        locale: "tr-TR",
        position: 3,
        top10: [
          { url: "https://rival.com/a", title: "Rival", content: "r", isTarget: false },
        ],
        resultsReturned: 1,
        checkedAt: "2026-08-01T00:00:00.000Z",
        dataSource: "mock",
      },
    });

    expect(request).toEqual({
      endpoint: "/api/seo-brief",
      body: { konu: "seo", brand_context: "example.com", dil: "tr" },
    });
  });

  it.each([
    [
      "geo-readiness",
      {
        target: "https://example.com",
        scores: { overall: 42, access: 50, understanding: 40, evidence: 36 },
        issues: [
          { code: "missing-jsonld", title: "JSON-LD yapısal verisi eksik", severity: "high" },
        ],
      },
      "https://example.com",
    ],
    [
      "schema",
      {
        url: "https://example.com",
        score: 80,
        rawScriptCount: 2,
        validNodes: [{ "@type": "Organization" }],
        parseErrors: ["Bozuk JSON-LD bloğu"],
        prohibitedClaims: [],
      },
      "https://example.com",
    ],
    [
      "ai-crawler",
      {
        robotsTxtUrl: "https://example.com/robots.txt",
        score: 55,
        robotsTxtFound: true,
        recommendations: ["robots.txt içinde Sitemap direktifi bulunamadı"],
      },
      "https://example.com/robots.txt",
    ],
  ] as const)(
    "maps %s to /api/rapor-uret with a Turkish summarized context containing the target",
    (tool, sourcePayload, target) => {
      const request = buildCrewReportRequest({ tool, sourcePayload });

      expect(request.endpoint).toBe("/api/rapor-uret");
      const body = request.body as { brand_context: unknown; dil: unknown };
      expect(body.dil).toBe("tr");
      expect(typeof body.brand_context).toBe("string");
      const brandContext = body.brand_context as string;
      expect(brandContext.length).toBeGreaterThan(0);
      expect(brandContext.length).toBeLessThanOrEqual(4000);
      expect(brandContext).toContain(target);
    },
  );

  it("truncates an oversized audit context to 4000 chars with an ellipsis marker", () => {
    const request = buildCrewReportRequest({
      tool: "geo-readiness",
      sourcePayload: {
        target: "https://example.com",
        scores: { overall: 42 },
        issues: [{ code: "huge", title: "x".repeat(6000), severity: "high" }],
      },
    });

    const body = request.body as { brand_context: string };
    expect(body.brand_context.length).toBeLessThanOrEqual(4000);
    expect(body.brand_context.endsWith("…")).toBe(true);
  });

  it("throws for an unknown tool", () => {
    expect(() =>
      buildCrewReportRequest({ tool: "unknown-tool" as never, sourcePayload: {} }),
    ).toThrow(/unknown/i);
  });
});

describe("buildCrewReportResultPayload", () => {
  it("builds the persisted crew-report payload without a score", () => {
    const payload = buildCrewReportResultPayload({
      sourceJobId: "source-job-1",
      tool: "geo-readiness",
      endpoint: "/api/rapor-uret",
      reportMarkdown: "# AI Strateji Raporu\n\nİçerik",
      crewJobId: "crew-job-1",
    });

    expect(payload.kind).toBe("crew-report");
    expect(payload.dataSource).toBe("crew-agency");
    expect(payload.sourceJobId).toBe("source-job-1");
    expect(payload.tool).toBe("geo-readiness");
    expect(payload.endpoint).toBe("/api/rapor-uret");
    expect(payload.reportMarkdown).toBe("# AI Strateji Raporu\n\nİçerik");
    expect(payload.crewJobId).toBe("crew-job-1");
    expect(typeof payload.generatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
    // The crew report is an AI-generated strategy document; persisting an
    // invented score would violate the never-fabricate-metrics rule.
    expect(payload).not.toHaveProperty("score");
  });
});
