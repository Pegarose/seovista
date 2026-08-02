import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { randomUUID } from "node:crypto";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/tracker/actions", () => ({
  deactivateTrackerTargetAction: vi.fn(),
}));

describe("TrackerTargetCard", () => {
  function makeTarget(overrides: Partial<{
    id: string;
    keyword: string;
    domain: string;
    active: boolean;
    latestPosition: number | null;
    latestCheckedAt: string | null;
    recentObservations: Array<{ position: number; checkedAt: string; topCompetitors: Array<{ rank: number; domain: string }> }>;
  }> = {}) {
    return {
      id: overrides.id ?? randomUUID(),
      keyword: overrides.keyword ?? "seo denetimi",
      domain: overrides.domain ?? "example.com",
      locale: "tr-TR",
      active: overrides.active ?? true,
      createdAt: new Date("2026-07-01"),
      lastCheckedAt: overrides.latestCheckedAt ? new Date(overrides.latestCheckedAt) : null,
      latestPosition: "latestPosition" in overrides ? overrides.latestPosition : 3,
      latestCheckedAt: "latestCheckedAt" in overrides ? overrides.latestCheckedAt : "2026-08-01T03:00:00.000Z",
      recentObservations: overrides.recentObservations ?? [
        { position: 5, checkedAt: "2026-07-30T03:00:00.000Z", topCompetitors: [] },
        { position: 3, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [] },
      ],
    };
  }

  it("renders an h2 with the keyword", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ keyword: "seo danışmanlığı" }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("<h2");
    expect(markup).toContain("seo danışmanlığı");
  });

  it("renders the domain in font-mono", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ domain: "test.com" }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("test.com");
    expect(markup).toContain("font-mono");
  });

  it("renders latest position as #3 when position is 3", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ latestPosition: 3 }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("#3");
  });

  it("renders 'İlk 10'da yok' when latestPosition is 0", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ latestPosition: 0 }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("İlk 10'da yok");
  });

  it("renders 'Henüz kontrol edilmedi' when latestPosition is null", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ latestPosition: null, latestCheckedAt: null }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("Henüz kontrol edilmedi");
  });

  it("renders empty state text when observations is empty", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({
          latestPosition: null,
          latestCheckedAt: null,
          recentObservations: [],
        }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("İlk kontrol bu gece 03:00 UTC'de yapılacak");
  });

  it("renders Pasif badge and no Kaldır button when inactive", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ active: false }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("Pasif");
    expect(markup).not.toContain("Kaldır");
  });
});
