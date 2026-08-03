/**
 * Tracker page contract tests — verifies the /tracker and /tracker/[token]
 * pages render with the correct landmark structure (one <main id="main">,
 * one <h1>) and the expected Turkish UI text.
 *
 * Follows the keyword-rank-result-states.test.ts pattern: async page
 * components are awaited to resolve their RSC promises, then the resulting
 * React element is passed to renderToStaticMarkup.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockListTrackerTargets = vi.fn();
const mockListAlerts = vi.fn();

vi.mock("@seovista/worker", () => ({
  createTrackerRepository: vi.fn(),
}));

vi.mock("@/lib/admin/db", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetAction: vi.fn(),
  createTrackerTargetForSessionAction: vi.fn(),
  listTrackerTargetsAction: mockListTrackerTargets,
  listAlertsAction: mockListAlerts,
  deactivateTrackerTargetAction: vi.fn(),
  updateAlertConsentAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

// UUID-shaped token: the page rejects non-UUID tokens via notFound() before
// any data access, so tests must use a well-formed value. Generated at
// runtime — the mocked action ignores the value, and no UUID literal is
// hardcoded in the file.
const VALID_TOKEN = randomUUID();

let TrackerPage: () => React.ReactElement;
let TrackerTokenPage: (props: { params: Promise<{ token: string }> }) => Promise<React.ReactElement>;

beforeAll(async () => {
  const trackerMod = await import("../../app/tracker/page");
  TrackerPage = trackerMod.default;

  const tokenMod = await import("../../app/tracker/[token]/page");
  TrackerTokenPage = tokenMod.default;

  // Mock listTrackerTargetsAction to return an empty list by default
  mockListTrackerTargets.mockResolvedValue({ success: true, targets: [], email: "user@example.com", consent: true });
  mockListAlerts.mockResolvedValue({ success: true, alerts: [] });
});

describe("Tracker pages landmark contract", () => {
  it("/tracker page renders one main landmark with id=main and one h1", () => {
    const markup = renderToStaticMarkup(React.createElement(TrackerPage));
    expect(countTag(markup, "main")).toBe(1);
    expect(markup).toContain('id="main"');
    expect(countTag(markup, "h1")).toBe(1);
  });

  it("/tracker page contains Turkish heading", () => {
    const markup = renderToStaticMarkup(React.createElement(TrackerPage));
    expect(markup).toContain("Anahtar Kelime Takibi");
  });

  it("/tracker/[token] page renders one main landmark with id=main and one h1", async () => {
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(countTag(markup, "main")).toBe(1);
    expect(markup).toContain('id="main"');
    expect(countTag(markup, "h1")).toBe(1);
  });

  it("/tracker/[token] throws NEXT_NOT_FOUND for an unknown token", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({ success: false, error: "Takip paneli bulunamadı." });
    await expect(
      TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("/tracker/[token] throws NEXT_NOT_FOUND for a malformed token", async () => {
    mockListTrackerTargets.mockClear();
    await expect(
      TrackerTokenPage({ params: Promise.resolve({ token: "not-a-uuid" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    // The malformed token must be rejected before any data access.
    expect(mockListTrackerTargets).not.toHaveBeenCalled();
  });
});

describe("Tracker [token] page card layout", () => {
  it("renders an export link with download attribute", async () => {
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("export");
    expect(markup).toContain("download");
  });

  it("renders an inline add-target form", async () => {
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain('name="keyword"');
    expect(markup).toContain('name="domain"');
  });

  it("renders empty state text when no targets", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      targets: [],
      email: "user@example.com",
      consent: false,
    });
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("Henüz takip edilen anahtar kelime yok");
  });

  it("renders an h2 for each target card when targets exist", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      targets: [
        {
          id: randomUUID(),
          keyword: "seo test",
          domain: "test.com",
          locale: "tr-TR",
          active: true,
          createdAt: new Date("2026-07-01"),
          lastCheckedAt: new Date("2026-08-01"),
          latestPosition: 3,
          latestCheckedAt: "2026-08-01T03:00:00.000Z",
          recentObservations: [
            { position: 5, checkedAt: "2026-07-31T03:00:00.000Z", topCompetitors: [] },
            { position: 3, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [] },
          ],
        },
      ],
      email: "user@example.com",
      consent: true,
    });
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("seo test");
    expect(countTag(markup, "h2")).toBeGreaterThanOrEqual(1);
    // Still only one h1
    expect(countTag(markup, "h1")).toBe(1);
  });
});
