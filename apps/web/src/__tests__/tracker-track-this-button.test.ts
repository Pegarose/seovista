/**
 * TrackThisButton contract test — verifies the component renders the
 * "Bu anahtarı takip et" CTA in its initial (collapsed) state.
 * The expanded form with email input is tested via e2e (B1 minimal).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetAction: vi.fn(),
}));

describe("TrackThisButton", () => {
  it("renders the track-this CTA with Turkish text in collapsed state", async () => {
    const { TrackThisButton } = await import("../components/tracker/track-this-button");
    const markup = renderToStaticMarkup(
      React.createElement(TrackThisButton, { keyword: "seo denetimi", domain: "example.com" }),
    );
    expect(markup).toContain("Bu Anahtarı Takip Et");
  });
});

describe("TrackerForm", () => {
  it("renders the alert consent checkbox with Turkish label", async () => {
    const { TrackerForm } = await import("../components/tracker/tracker-form");
    const markup = renderToStaticMarkup(React.createElement(TrackerForm));
    expect(markup).toContain('name="consent"');
    expect(markup).toContain(
      "Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)",
    );
  });
});
