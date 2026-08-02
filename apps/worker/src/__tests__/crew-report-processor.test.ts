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
      undefined,
      "https://example.com",
      "GEO görünürlük strateji raporu",
    ],
    [
      "schema",
      // Real SchemaAuditExtractionResult shape (packages/schema/src/validate.ts):
      // it carries NO url/target/domain field, so the audited URL reaches the
      // summarizer only via `sourceTarget` (job_records.target of the source
      // audit job, selected by the worker's correlation join).
      {
        rawScriptCount: 2,
        validNodes: [{ "@type": "Organization" }],
        parseErrors: ["Bozuk JSON-LD bloğu"],
        prohibitedClaims: [],
        score: 80,
      },
      "https://example.com",
      "https://example.com",
      "yapısal veri (schema.org) strateji raporu",
    ],
    [
      "ai-crawler",
      {
        robotsTxtUrl: "https://example.com/robots.txt",
        score: 55,
        robotsTxtFound: true,
        recommendations: ["robots.txt içinde Sitemap direktifi bulunamadı"],
      },
      undefined,
      "https://example.com/robots.txt",
      "AI tarayıcı erişilebilirlik strateji raporu",
    ],
  ] as const)(
    "maps %s to /api/rapor-uret with the real API contract: rapor_konusu + raw_data_context + brand_context + dil",
    (tool, sourcePayload, sourceTarget, expectedTarget, expectedTopic) => {
      const request = buildCrewReportRequest({ tool, sourcePayload, sourceTarget });

      expect(request.endpoint).toBe("/api/rapor-uret");
      const body = request.body as {
        rapor_konusu: unknown;
        raw_data_context: unknown;
        brand_context: unknown;
        dil: unknown;
      };

      // Required by the live CrewAgency /api/rapor-uret contract.
      expect(body.dil).toBe("tr");

      expect(typeof body.rapor_konusu).toBe("string");
      const raporKonusu = body.rapor_konusu as string;
      expect(raporKonusu.length).toBeGreaterThan(0);
      expect(raporKonusu.length).toBeLessThanOrEqual(200);
      expect(raporKonusu).toContain(expectedTarget);
      expect(raporKonusu).toContain(expectedTopic);

      expect(typeof body.raw_data_context).toBe("string");
      const rawDataContext = body.raw_data_context as string;
      expect(rawDataContext.length).toBeGreaterThan(0);
      expect(rawDataContext.length).toBeLessThanOrEqual(4000);
      expect(rawDataContext).toContain(expectedTarget);

      // Optional field — present because the target is known.
      expect(body.brand_context).toBe(expectedTarget);
    },
  );

  it("omits the optional brand_context and targets the generic topic when no target is known", () => {
    const request = buildCrewReportRequest({
      tool: "schema",
      sourcePayload: { score: 80, parseErrors: ["Bozuk JSON-LD bloğu"] },
    });

    const body = request.body as Record<string, unknown>;
    expect(body.rapor_konusu).toBe("yapısal veri (schema.org) strateji raporu");
    expect(typeof body.raw_data_context).toBe("string");
    expect(body.dil).toBe("tr");
    expect(body).not.toHaveProperty("brand_context");
  });

  it("truncates an over-long rapor_konusu to 200 chars", () => {
    const request = buildCrewReportRequest({
      tool: "geo-readiness",
      sourcePayload: { target: `https://${"a".repeat(300)}.com`, scores: { overall: 42 } },
    });

    const body = request.body as { rapor_konusu: string };
    expect(body.rapor_konusu.length).toBeLessThanOrEqual(200);
    expect(body.rapor_konusu.endsWith("…")).toBe(true);
  });

  it("prefers the payload's own target over the sourceTarget fallback", () => {
    const request = buildCrewReportRequest({
      tool: "geo-readiness",
      sourcePayload: { target: "https://payload-target.com", scores: { overall: 42 } },
      sourceTarget: "https://job-record-target.com",
    });

    const body = request.body as {
      rapor_konusu: string;
      raw_data_context: string;
      brand_context: string;
    };
    expect(body.brand_context).toBe("https://payload-target.com");
    expect(body.rapor_konusu).toContain("https://payload-target.com");
    expect(body.rapor_konusu).not.toContain("https://job-record-target.com");
    expect(body.raw_data_context).toContain("https://payload-target.com");
    expect(body.raw_data_context).not.toContain("https://job-record-target.com");
  });

  it("throws a validation-coded error for a malformed keyword-rank source payload", () => {
    let caught: unknown;
    try {
      buildCrewReportRequest({
        tool: "keyword-rank",
        sourcePayload: { kind: "keyword-rank", keyword: "seo" },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/keyword and domain/);
    // The worker maps `validation.*` codes to the 'permanent' terminal status
    // so a malformed source payload is not retried pointlessly.
    expect((caught as { code?: unknown }).code).toBe("validation.crew_report");
  });

  it("truncates an oversized raw_data_context to 4000 chars with an ellipsis marker", () => {
    const request = buildCrewReportRequest({
      tool: "geo-readiness",
      sourcePayload: {
        target: "https://example.com",
        scores: { overall: 42 },
        issues: [{ code: "huge", title: "x".repeat(6000), severity: "high" }],
      },
    });

    const body = request.body as { raw_data_context: string };
    expect(body.raw_data_context.length).toBeLessThanOrEqual(4000);
    expect(body.raw_data_context.endsWith("…")).toBe(true);
  });

  it("buildCrewReportRequest throws a validation-coded error for an unknown tool", () => {
    expect(() =>
      buildCrewReportRequest({
        tool: "bogus" as never,
        sourcePayload: {},
        sourceTarget: undefined,
      }),
    ).toThrow(/Unknown crew report tool/);

    try {
      buildCrewReportRequest({
        tool: "bogus" as never,
        sourcePayload: {},
        sourceTarget: undefined,
      });
    } catch (err) {
      expect((err as Error & { code?: string }).code).toBe("validation.crew_report");
    }
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
