/**
 * GEO Result Page State Contract Tests
 *
 * VAL-CROSS-003: Every affected page has one main and one descriptive h1
 * VAL-CROSS-014: No fabrication and security boundaries hold
 *
 * These tests verify that the public GEO result page at
 * `/tools/geo-readiness-checker/result/[jobId]` renders truthful, accessible
 * markup for every lifecycle state without fabricated data, raw Next.js
 * errors, or missing page landmarks.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ---------------------------------------------------------------------------
// Mock setup — vi.mock calls are hoisted above all imports.
// ---------------------------------------------------------------------------

const mockGetAdminDb = vi.fn();
const mockCreateGeoAuditRepository = vi.fn();
const mockHeadersFn = vi.fn();

vi.mock("@/lib/admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@seovista/worker", () => ({
  createGeoAuditRepository: mockCreateGeoAuditRepository,
}));

vi.mock("next/headers", () => ({
  headers: mockHeadersFn,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/geo-checker/actions", () => ({
  checkJobStatusAction: vi.fn().mockResolvedValue({ success: true, data: { status: "queued" } }),
}));

// Default: headers returns a basic empty Headers
mockHeadersFn.mockResolvedValue(new Headers());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock repository whose `getJobRecord` and `getJobResultPayload`
 *  return the supplied values (or throw when set to an Error). */
function makeMockRepo(opts: {
  getJobRecord?: unknown;
  getJobResultPayload?: unknown;
}) {
  const repo = {
    getJobRecord: vi.fn(),
    getJobResultPayload: vi.fn(),
  };

  if (opts.getJobRecord instanceof Error) {
    repo.getJobRecord.mockRejectedValue(opts.getJobRecord);
  } else {
    repo.getJobRecord.mockResolvedValue(opts.getJobRecord ?? undefined);
  }

  if (opts.getJobResultPayload instanceof Error) {
    repo.getJobResultPayload.mockRejectedValue(opts.getJobResultPayload);
  } else {
    repo.getJobResultPayload.mockResolvedValue(
      opts.getJobResultPayload ?? null,
    );
  }

  return repo;
}

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
 * hook-using client components. React's server renderer resolves the full
 * tree and gives tests the same text/markup contract the browser receives. */
function renderToString(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function canonicalModules(
  overrides: Record<string, Record<string, unknown>> = {},
): Array<Record<string, unknown>> {
  const modules = [
    { key: "indexability_crawlability", name: "Indexability & Crawlability", score: 20, maxScore: 20, status: "excellent", issues: [] },
    { key: "technical_seo_metadata", name: "Technical SEO Metadata", score: 20, maxScore: 20, status: "excellent", issues: [] },
    { key: "content_quality_intent", name: "Content Quality & Intent", score: 20, maxScore: 20, status: "excellent", issues: [] },
    { key: "semantic_coverage", name: "Semantic Coverage", score: 15, maxScore: 15, status: "excellent", issues: [] },
    { key: "page_experience_performance", name: "Page Experience & Performance", score: 10, maxScore: 10, status: "excellent", issues: [] },
    { key: "internal_linking_architecture", name: "Internal Linking Architecture", score: 10, maxScore: 10, status: "excellent", issues: [] },
    { key: "ai_visibility_readiness", name: "AI Visibility & Readiness", score: 5, maxScore: 5, status: "excellent", issues: [] },
  ];

  return modules.map((module) => ({
    ...module,
    ...(overrides[module.key] ?? {}),
  }));
}

function buildValidPayload(): Record<string, unknown> {
  return {
    target: "https://example.com",
    scoreBand: "good",
    breakdown: {
      scoreVersion: "seovista-score-v1.2-decoupled",
      overallScore: 75,
      band: "good",
      modules: canonicalModules({
        content_quality_intent: {
          score: 15,
          status: "good",
          issues: [
            {
              code: "C001",
              message: "Missing H1 tag",
              pointLoss: -5,
              severity: "medium",
              module: "content_quality_intent",
            },
          ],
        },
        technical_seo_metadata: {
          score: 15,
          status: "needs_improvement",
        },
      }),
      platformReadiness: [
        {
          platform: "google",
          score: 80,
          confidence: 0.9,
          rationale: "Strong SERP presence",
          experimental: false,
        },
      ],
    },
    matchedServices: [
      {
        service_id: "svc-1",
        name: "Content Optimization",
        description: "Improve your content for AI search",
        matchedTags: ["technical-seo", "content-depth"],
        relevanceScore: 85,
        addressedIssueCodes: ["C001"],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// The page component — imported after mocks so the module graph resolves
// with our controlled dependencies.
// ---------------------------------------------------------------------------

// We use a lazy reference because the page is an async Server Component
// that depends on `next/headers` at module scope. The mock must resolve
// before the import is evaluated.
let JobResultPage: (
  props: { params: Promise<{ jobId: string }> },
) => Promise<React.ReactElement>;

beforeAll(async () => {
  const mod = await import(
    "../../app/tools/geo-readiness-checker/result/[jobId]/page"
  );
  JobResultPage = mod.default;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GEO Result Page State Contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: healthy DB + empty repo
    const mockDb = { query: vi.fn() };
    mockGetAdminDb.mockReturnValue(mockDb);
    const repo = makeMockRepo({});
    mockCreateGeoAuditRepository.mockReturnValue(repo);
  });

  // ------------------------------------------------------------------
  // VAL-CROSS-003: one main, one descriptive h1
  // ------------------------------------------------------------------

  describe("VAL-CROSS-003: one main + one descriptive h1 per state", () => {
    it("malformed non-UUID renders exactly one main with one h1 (Report not found)", async () => {
      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "not-a-uuid" }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("Citation readiness");

      const fullText = renderToString(el);
      expect(fullText).toContain("Report not found");
    });

    it("valid UUID with no matching row renders exactly one main with one h1 (Report not found)", async () => {
      const repo = makeMockRepo({ getJobRecord: undefined });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "00000000-0000-0000-0000-000000000000",
        }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("Citation readiness");

      const fullText = renderToString(el);
      expect(fullText).toContain("Report not found");
    });

    it("valid UUID not-found is not conflated with dependency failure", async () => {
      const repo = makeMockRepo({ getJobRecord: undefined });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "00000000-0000-0000-0000-000000000000",
        }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report not found");
      expect(text).not.toContain("temporarily unavailable");
    });

    it("DB construction failure renders exactly one main with one h1 (Service unavailable)", async () => {
      mockGetAdminDb.mockImplementation(() => {
        throw new Error("DB connection refused");
      });

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("Citation readiness");

      const fullText = renderToString(el);
      expect(fullText).toContain("Service temporarily unavailable");
    });

    it("job lookup failure renders exactly one main with one h1 (Service unavailable)", async () => {
      const repo = makeMockRepo({
        getJobRecord: new Error("Connection lost"),
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);

      const h1s = h1Texts(el);
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!).toContain("Citation readiness");

      const fullText = renderToString(el);
      expect(fullText).toContain("Service temporarily unavailable");
    });

    it("queued status renders exactly one main with one descriptive h1", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "queued",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("running status renders exactly one main with one descriptive h1", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "running",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("pending status renders exactly one main with one descriptive h1", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "pending",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("completed status renders exactly one main with one descriptive h1", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: buildValidPayload(),
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("failed status renders exactly one main with one descriptive h1", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "failed",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("timeout status renders exactly one main with one descriptive h1", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "timeout",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("permanent status renders exactly one main with one descriptive h1", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "permanent",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("permanent_failure status renders exactly one main with one descriptive h1", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "permanent_failure",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);
    });

    it("unknown persisted status renders exactly one main with one descriptive h1, no error boundary", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "unrecognized_persisted_status_xyz",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      expect(countMainNodes(el)).toBe(1);
      expect(h1Texts(el)).toHaveLength(1);

      const text = renderToString(el);

      // The shared UnknownJobStatusView renders the explicit unavailable view
      expect(text).toContain("We can&#x27;t find this report");

      // Must NOT contain raw Next.js error details
      expect(text).not.toContain("digest");
      expect(text).not.toContain("stack");

      // Must NOT contain result components or score data
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("SERP Preview");
      expect(text).not.toContain("AI Overview");
      expect(text).not.toContain("Modül Skor");
      expect(text).not.toContain("Erişim");
      expect(text).not.toContain("Başarılı");
    });
  });

  // ------------------------------------------------------------------
  // VAL-CROSS-014: No fabrication
  // ------------------------------------------------------------------

  describe("VAL-CROSS-014: no fabrication in negative/degraded states", () => {
    it("completed with null payload renders explicit degraded state, no fabricated data", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: null,
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      const text = renderToString(el);

      // Must NOT contain fabricated values
      expect(text).not.toMatch(/\b0\/100\b/);
      expect(text).not.toMatch(/\bcritical\b/i);
      expect(text).not.toContain("seovista.com");

      // Must NOT contain raw Next.js error details
      expect(text).not.toContain("digest");
      expect(text).not.toContain("stack");
      expect(text).not.toContain("Error:");

      // Must NOT contain fabricated SERP/AI data
      expect(text).not.toContain("SERP Preview");
      expect(text).not.toContain("AI Overview");
    });

    it("completed with malformed payload (missing breakdown) renders degraded state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: { notBreakdown: true } as unknown as Record<
          string,
          unknown
        >,
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      const text = renderToString(el);

      // Must NOT contain fabricated score data
      expect(text).not.toMatch(/\b0\/100\b/);
      expect(text).not.toMatch(/\bcritical\b/i);
    });

    it("completed with valid breakdown structure but invalid band renders degraded state, no fabricated critical band", async () => {
      // The breakdown has valid scoreVersion, overallScore, and modules,
      // but the band is an unrecognised string. The page must degrade
      // safely instead of fabricating a "critical" fallback band.
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          target: "https://example.com",
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: 75,
            band: "INVALID_BAND_VALUE",
            modules: [
              {
                key: "content_quality_intent",
                name: "Content Quality & Intent",
                score: 15,
                maxScore: 20,
                status: "good",
                issues: [],
              },
            ],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      const text = renderToString(el);

      // Must NOT contain fabricated critical band or score data
      expect(text).not.toMatch(/\bcritical\b/i);
      expect(text).not.toMatch(/\b75\/100\b/);
      expect(text).not.toContain("https://example.com");

      // Must render explicit degraded/unavailable state
      expect(text).toContain("Report data is incomplete");

      // Must NOT contain raw Next.js error output
      expect(text).not.toContain("digest");
      expect(text).not.toContain("stack");
    });

    it("completed with result payload fetch failure renders degraded state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: new Error("Result fetch failed"),
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      const text = renderToString(el);

      // Must NOT fabricate scores
      expect(text).not.toMatch(/\b0\/100\b/);
      expect(text).not.toMatch(/\bcritical\b/i);

      // Must NOT leak raw errors
      expect(text).not.toContain("Result fetch failed");
      expect(text).not.toContain("digest");
    });

    it("present malformed degraded marker renders explicit unavailable state", async () => {
      const validPayload = buildValidPayload();
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          ...validPayload,
          breakdown: {
            ...(validPayload.breakdown as Record<string, unknown>),
            degraded: "false",
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report data is incomplete");
      expect(text).not.toContain("75/100");
      expect(text).not.toContain("Audited URL:");
    });

    it("absent or malformed matched services omit the service projection rather than claiming no match", async () => {
      const validPayload = buildValidPayload();
      for (const matchedServices of [undefined, { malformed: true }]) {
        const payload = { ...validPayload };
        if (matchedServices === undefined) {
          delete payload.matchedServices;
        } else {
          payload.matchedServices = matchedServices;
        }
        const repo = makeMockRepo({
          getJobRecord: {
            status: "completed",
            lead_id: "lead-1",
            work_email: null,
          },
          getJobResultPayload: payload,
        });
        mockCreateGeoAuditRepository.mockReturnValue(repo);

        const el = await JobResultPage({
          params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
        });

        const text = renderToString(el);
        expect(text).not.toContain("Önerilen Servisler");
        expect(text).not.toContain("öncelikli bir servis eşleşmesi bulunamadı");
      }
    });

    it("completed degraded breakdown renders only explicit unavailable state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          ...buildValidPayload(),
          breakdown: {
            ...(buildValidPayload().breakdown as Record<string, unknown>),
            degraded: true,
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      const text = renderToString(el);

      expect(text).toContain("Report data is incomplete");
      expect(text).not.toMatch(/\b75\/100\b/);
      expect(text).not.toContain("Modül Skor Dağılımı");
      expect(text).not.toContain("Önerilen Servisler");
      expect(text).not.toContain("https://example.com");
      expect(text).not.toContain("Performansınızı Artırın");
      expect(text).not.toContain("SERP & AI Answer Previews");
    });

    it("failed status does not expose result data", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "failed",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      const text = renderToString(el);

      // Must NOT contain score data, previews, or result claims
      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("SERP Preview");
      expect(text).not.toContain("AI Overview");
      expect(text).not.toContain("Modül Skor");
      expect(text).not.toContain("Önerilen Servisler");
    });

    it("timeout status does not expose result data", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "timeout",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      const text = renderToString(el);

      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("SERP Preview");
      expect(text).not.toContain("AI Overview");
    });

    it("permanent status does not expose result data", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "permanent",
          lead_id: "lead-1",
          work_email: null,
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      const text = renderToString(el);

      expect(text).not.toMatch(/\b\d+\/100\b/);
      expect(text).not.toContain("SERP Preview");
      expect(text).not.toContain("AI Overview");
    });

    it("no state contains raw Next.js error digest or stack", async () => {
      interface TestCase {
        name: string;
        params: { jobId: string };
        dbThrows?: boolean;
        repoThrows?: boolean;
      }

      const testCases: TestCase[] = [
        {
          name: "malformed UUID",
          params: { jobId: "!!!not-valid!!!" },
        },
        {
          name: "DB construction failure",
          params: { jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
          dbThrows: true,
        },
        {
          name: "job lookup failure",
          params: { jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
          repoThrows: true,
        },
      ];

      for (const tc of testCases) {
        vi.clearAllMocks();
        const mockDb = { query: vi.fn() };
        if (tc.dbThrows) {
          mockGetAdminDb.mockImplementation(() => {
            throw new Error("BOOM");
          });
        } else {
          mockGetAdminDb.mockReturnValue(mockDb);
        }

        if (tc.repoThrows) {
          const repo = makeMockRepo({
            getJobRecord: new Error("BOOM"),
          });
          mockCreateGeoAuditRepository.mockReturnValue(repo);
        } else {
          const repo = makeMockRepo({});
          mockCreateGeoAuditRepository.mockReturnValue(repo);
        }

        const el = await JobResultPage({
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
  // Malformed nested payload: strict validation rejects bad data
  // ------------------------------------------------------------------

  describe("Malformed nested payload component validation", () => {
    it("non-finite overallScore (NaN) renders degraded state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          target: "https://example.com",
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: NaN,
            band: "good",
            modules: [
              { key: "content_quality_intent", name: "Content Quality & Intent", score: 10, maxScore: 20, status: "good", issues: [] },
            ],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report data is incomplete");
      expect(text).not.toMatch(/\b\d+\/100\b/);
    });

    it("non-finite overallScore (Infinity) renders degraded state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: Infinity,
            band: "good",
            modules: [
              { key: "content_quality_intent", name: "Content Quality & Intent", score: 10, maxScore: 20, status: "good", issues: [] },
            ],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report data is incomplete");
    });

    it("non-finite overallScore (-Infinity) renders degraded state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: -Infinity,
            band: "good",
            modules: [],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report data is incomplete");
    });

    it("non-finite module score renders degraded state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: 75,
            band: "good",
            modules: [
              { key: "content_quality_intent", name: "Content Quality & Intent", score: NaN, maxScore: 20, status: "good", issues: [] },
            ],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report data is incomplete");
      expect(text).not.toContain("75/100");
    });

    it("non-finite module maxScore renders degraded state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: 75,
            band: "good",
            modules: [
              { key: "content_quality_intent", name: "Content Quality & Intent", score: 10, maxScore: Infinity, status: "good", issues: [] },
            ],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report data is incomplete");
    });

    it("non-finite pointLoss in issue renders degraded state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: 75,
            band: "good",
            modules: [
              {
                key: "content_quality_intent", name: "Content Quality & Intent", score: 10, maxScore: 20, status: "good",
                issues: [
                  { code: "C001", message: "Issue", pointLoss: NaN, severity: "warning", module: "m1" },
                ],
              },
            ],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report data is incomplete");
    });

    it("unknown module status renders degraded state, no 'good' coercion", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: 75,
            band: "good",
            modules: [
              { key: "content_quality_intent", name: "Content Quality & Intent", score: 10, maxScore: 20, status: "UNKNOWN_BOGUS_STATUS", issues: [] },
            ],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report data is incomplete");
      expect(text).not.toContain("75/100");
    });

    it("unknown issue severity renders degraded state", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: 75,
            band: "good",
            modules: [
              {
                key: "content_quality_intent", name: "Content Quality & Intent", score: 10, maxScore: 20, status: "good",
                issues: [
                  { code: "C001", message: "Issue", pointLoss: -5, severity: "FATALITY", module: "m1" },
                ],
              },
            ],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);
      expect(text).toContain("Report data is incomplete");
    });

    it("valid platformReadiness entries survive; malformed entries are silently dropped", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          target: "https://example.com",
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: 75,
            band: "good",
            modules: canonicalModules(),
            platformReadiness: [
              // Valid entry
              { platform: "google", score: 80, confidence: 0.9, rationale: "Strong", experimental: false },
              // Malformed: missing platform string
              { platform: 123, score: 50, confidence: 0.5, rationale: "bad" },
              // Malformed: missing score
              { platform: "malformed", confidence: 0.3, rationale: "bad" },
              // Malformed: non-object
              null,
              // Valid entry
              { platform: "chatgpt", score: 65, confidence: 0.7, rationale: "Good", experimental: true },
            ],
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);

      // The page should render successfully (no crash) with the valid entries
      expect(text).toContain("75/100");

      // Valid platform entries should appear
      expect(text).toContain("google");
      expect(text).toContain("chatgpt");

      // Malformed entries must NOT leak their raw content
      expect(text).not.toContain("123");  // numeric platform field
      expect(text).not.toContain("malformed");
    });

    it("invalid matchedServices entries are silently dropped without crashing", async () => {
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          target: "https://example.com",
          breakdown: {
            scoreVersion: "seovista-score-v1.2-decoupled",
            overallScore: 75,
            band: "good",
            modules: canonicalModules(),
          },
          matchedServices: [
            // Valid entry
            {
              service_id: "svc-1",
              name: "Content Optimization",
              description: "Improve content",
              matchedTags: ["technical-seo", "content-depth"],
              relevanceScore: 85,
              addressedIssueCodes: ["C001"],
            },
            // Malformed: missing required fields
            { service_id: "svc-2" },
            // Malformed: non-object
            null,
            // Malformed: empty object
            {},
            // Valid entry with invalid tags that should be filtered
            {
              service_id: "svc-3",
              name: "Technical Audit",
              description: "Fix technical issues",
              matchedTags: ["technical-seo", "INVALID_TAG_XYZ", 123],
              relevanceScore: 90,
              addressedIssueCodes: [],
            },
          ],
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);

      // The page should render the valid services
      expect(text).toContain("Content Optimization");

      // The valid entry with filtered tags should appear
      expect(text).toContain("Technical Audit");

      // Malformed entries must NOT crash the page
      expect(text).not.toContain("digest");
      expect(text).not.toContain("stack");

      // INVALID_TAG_XYZ must not appear (filtered by IssueTag guard)
      expect(text).not.toContain("INVALID_TAG_XYZ");
    });
  });

  // ------------------------------------------------------------------
  // No synthesized SERP/AI preview claims
  // ------------------------------------------------------------------

  describe("No synthesized SERP/AI-answer preview claims", () => {
    it("does not render SERP preview when no preview data exists in payload", async () => {
      // Payload has no `previewTitle` or `previewSnippet` fields
      const validPayload = buildValidPayload();
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          ...validPayload,
          // No previewTitle / previewSnippet fields
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);

      // SERP previews should NOT appear without explicit preview data
      // The current implementation synthesizes them from score/band/target;
      // after hardening they must only appear with actual preview data.
      expect(text).not.toContain("SERP Preview");
      expect(text).not.toContain("AI Overview Citation Preview");
    });

    it("renders SERP preview only when persisted preview data passes structural validation", async () => {
      const validPayload = buildValidPayload();
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          ...validPayload,
          serpPreview: {
            title: "Example Domain - AI Search",
            snippet: "This domain demonstrates strong generative engine optimization readiness.",
            url: "https://example.com/serp",
            sourceMode: "simulated" as const,
            displayType: "serp" as const,
            provider: "deterministic-fixture",
            fixtureId: "preview-fixture-serp",
            requestId: "request-serp",
            operationKey: "audit-operation-1",
            runId: "run-1",
            capturedAt: "2026-07-29T00:00:00.000Z",
            ttlSeconds: 3600,
            freshness: "fresh" as const,
            outcome: "success" as const,
          },
          aiPreview: {
            title: "Example Domain GEO Analysis",
            snippet: "According to audit, the domain shows high AI visibility.",
            url: "https://example.com/ai-answer",
            sourceMode: "simulated" as const,
            displayType: "ai" as const,
            provider: "deterministic-fixture",
            fixtureId: "preview-fixture-ai",
            requestId: "request-ai",
            operationKey: "audit-operation-1",
            runId: "run-1",
            capturedAt: "2026-07-29T00:00:00.000Z",
            ttlSeconds: 3600,
            freshness: "fresh" as const,
            outcome: "success" as const,
          },
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);

      expect(text).toContain("Provider: deterministic-fixture (simulated)");
      expect(text).toContain("Fixture: preview-fixture-serp");

      // SERP preview content from actual preview data
      expect(text).toContain("Example Domain - AI Search");
      expect(text).toContain("This domain demonstrates strong generative engine optimization readiness.");

      // AI preview content from actual preview data
      expect(text).toContain("Example Domain GEO Analysis");

      // Must NOT contain synthesized fallback content
      expect(text).not.toContain("SeoVista GEO Readiness score:");
      expect(text).not.toContain("According to SeoVista GEO Audit,");
    });

    it("does not render previews when preview data is structurally invalid", async () => {
      const validPayload = buildValidPayload();
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          ...validPayload,
          serpPreview: { title: 12345, snippet: null, url: "https://example.com/serp", mode: "serp" },  // invalid: title is number, snippet null
          aiPreview: { title: "", snippet: 67890, url: "https://example.com/ai-answer", mode: "ai_answer" },  // invalid: empty title
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);

      // Must NOT render invalid preview data, and must NOT synthesize fallbacks
      expect(text).not.toContain("SERP Preview");
      expect(text).not.toContain("AI Overview Citation Preview");
      expect(text).not.toContain("SeoVista GEO Readiness score:");
    });

    it("does not synthesize titles, snippets, or readiness statements from score, band, or target", async () => {
      // A valid completed payload with score/band/target but NO preview data
      const validPayload = buildValidPayload();
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: {
          ...validPayload,
          // Deliberately no serpPreview or aiPreview fields
        },
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({ jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      });

      const text = renderToString(el);

      // The score breakdown should still render
      expect(text).toContain("75/100");
      expect(text).not.toContain("Erişim");
      expect(text).not.toContain("Başarılı");

      // But NO synthesized preview claims from score, band, or target
      expect(text).not.toContain("SERP Preview");
      expect(text).not.toContain("AI Overview Citation Preview");

      // No synthesized readiness statements
      expect(text).not.toContain("demonstrates");
      expect(text).not.toContain("generative engine optimization readiness");
    });
  });

  // ------------------------------------------------------------------
  // Completed with valid payload renders truthfully
  // ------------------------------------------------------------------

  describe("Completed state with valid payload renders truthfully", () => {
    it("renders score and target from payload", async () => {
      const validPayload = buildValidPayload();
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: validPayload,
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      const text = renderToString(el);

      // Truthful score rendered
      expect(text).toContain("75/100");

      // VerdictCard exposes the score to assistive tech
      expect(text).toContain("Score: 75 out of 100");

      // Truthful target rendered
      expect(text).toContain("https://example.com");
    });

    it("renders breakdown only when structurally validated", async () => {
      const validPayload = buildValidPayload();
      const repo = makeMockRepo({
        getJobRecord: {
          status: "completed",
          lead_id: "lead-1",
          work_email: null,
        },
        getJobResultPayload: validPayload,
      });
      mockCreateGeoAuditRepository.mockReturnValue(repo);

      const el = await JobResultPage({
        params: Promise.resolve({
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      });

      // Verify ScoreBreakdownView is rendered (has the breakdown)
      const text = renderToString(el);
      expect(text).toContain("Modül Skor Dağılımı");
      expect(text).toContain("75/100");
    });
  });
});
