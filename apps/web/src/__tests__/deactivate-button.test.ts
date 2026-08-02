import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/tracker/actions", () => ({
  deactivateTrackerTargetAction: vi.fn().mockResolvedValue({ success: true }),
}));

describe("DeactivateButton", () => {
  it("renders Kaldır button when active", async () => {
    const { DeactivateButton } = await import("../components/tracker/deactivate-button");
    const markup = renderToStaticMarkup(
      React.createElement(DeactivateButton, {
        token: "token-abc",
        targetId: "target-xyz",
        active: true,
      }),
    );
    expect(markup).toContain("Kaldır");
    expect(markup).toContain("<button");
  });

  it("renders nothing when inactive", async () => {
    const { DeactivateButton } = await import("../components/tracker/deactivate-button");
    const markup = renderToStaticMarkup(
      React.createElement(DeactivateButton, {
        token: "token-abc",
        targetId: "target-xyz",
        active: false,
      }),
    );
    expect(markup).not.toContain("Kaldır");
  });
});
