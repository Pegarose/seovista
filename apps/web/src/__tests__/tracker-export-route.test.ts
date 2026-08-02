import { describe, it, expect, vi, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

const mockListTrackerTargets = vi.fn();

vi.mock("@seovista/worker", () => ({
  createTrackerRepository: vi.fn(),
}));

vi.mock("@/lib/admin/db", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/tracker/actions", () => ({
  listTrackerTargetsAction: mockListTrackerTargets,
}));

let GET: (request: Request, context: { params: Promise<{ token: string }> }) => Promise<Response>;

beforeAll(async () => {
  const mod = await import("../../app/tracker/[token]/export/route");
  GET = mod.GET;
});

describe("CSV Export Route", () => {
  it("returns 404 for malformed token", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: "not-a-uuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown token", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: false,
      error: "Takip paneli bulunamadı.",
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    expect(res.status).toBe(404);
  });

  it("returns CSV with BOM and semicolon header for valid token with targets", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [
        {
          id: randomUUID(),
          keyword: "seo denetimi",
          domain: "example.com",
          locale: "tr-TR",
          active: true,
          createdAt: new Date("2026-07-01"),
          lastCheckedAt: new Date("2026-08-01"),
          latestPosition: 3,
          latestCheckedAt: "2026-08-01T03:00:00.000Z",
          recentObservations: [
            { position: 5, checkedAt: "2026-07-31T03:00:00.000Z", topCompetitors: [{ rank: 1, domain: "rival.com" }] },
            { position: 3, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [{ rank: 1, domain: "rival.com" }] },
          ],
        },
      ],
    });
    const token = randomUUID();
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");

    // BOM present: verify via raw bytes since Response.text() strips a
    // leading UTF-8 BOM per the WHATWG fetch spec. Decode with ignoreBOM
    // so the BOM is preserved in the resulting string for the charCodeAt
    // assertion and subsequent content checks.
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(buf));
    expect(text.charCodeAt(0)).toBe(0xfeff);
    // Semicolon-delimited header
    expect(text).toContain("keyword;domain;date;position;top_competitors");
    // Data rows
    expect(text).toContain("seo denetimi;example.com");
    expect(text).toContain(";5;");
    expect(text).toContain(";3;");
    // top_competitors in comma-separated format
    expect(text).toContain("rival.com(#1)");
  });

  it("returns CSV with header only for valid token with no targets", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [],
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("keyword;domain;date;position;top_competitors");
    // Only header + BOM, no data rows
    const lines = text.split("\n");
    expect(lines.length).toBe(2); // header + trailing newline
  });

  it("escapes keyword containing semicolon with double quotes", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [
        {
          id: randomUUID(),
          keyword: "seo;denetimi",
          domain: "example.com",
          locale: "tr-TR",
          active: true,
          createdAt: new Date("2026-07-01"),
          lastCheckedAt: new Date("2026-08-01"),
          latestPosition: 3,
          latestCheckedAt: "2026-08-01T03:00:00.000Z",
          recentObservations: [
            { position: 3, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [] },
          ],
        },
      ],
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    const text = await res.text();
    expect(text).toContain('"seo;denetimi"');
  });

  it("includes Content-Disposition with date-stamped filename", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [],
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    const cd = res.headers.get("Content-Disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain(".csv");
  });

  it("renders position=0 as raw 0 in the position column", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [
        {
          id: randomUUID(),
          keyword: "seo",
          domain: "example.com",
          locale: "tr-TR",
          active: true,
          createdAt: new Date("2026-07-01"),
          lastCheckedAt: new Date("2026-08-01"),
          latestPosition: 0,
          latestCheckedAt: "2026-08-01T03:00:00.000Z",
          recentObservations: [
            { position: 0, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [] },
          ],
        },
      ],
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    const text = await res.text();
    // The position column should contain 0, not "İlk 10'da yok"
    expect(text).toContain(";0;");
    expect(text).not.toContain("İlk 10'da yok");
  });
});
