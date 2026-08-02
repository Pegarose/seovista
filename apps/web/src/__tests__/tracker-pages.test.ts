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
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockListTrackerTargets = vi.fn();

vi.mock("@seovista/worker", () => ({
  createTrackerRepository: vi.fn(),
}));

vi.mock("@/lib/admin/db", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetAction: vi.fn(),
  listTrackerTargetsAction: mockListTrackerTargets,
  deactivateTrackerTargetAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

const VALID_TOKEN = "fixture-token";

let TrackerPage: () => React.ReactElement;
let TrackerTokenPage: (props: { params: Promise<{ token: string }> }) => Promise<React.ReactElement>;

beforeAll(async () => {
  const trackerMod = await import("../../app/tracker/page");
  TrackerPage = trackerMod.default;

  const tokenMod = await import("../../app/tracker/[token]/page");
  TrackerTokenPage = tokenMod.default;

  // Mock listTrackerTargetsAction to return an empty list by default
  mockListTrackerTargets.mockResolvedValue({ success: true, targets: [], email: "user@example.com" });
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
});
