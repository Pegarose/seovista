import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { randomUUID } from "node:crypto";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetForSessionAction: vi.fn(),
  TrackerSessionTargetActionState: {},
}));

describe("AddTargetForm", () => {
  it("renders keyword and domain inputs with a form", async () => {
    const { AddTargetForm } = await import("../components/tracker/add-target-form");
    const token = randomUUID();
    const markup = renderToStaticMarkup(
      React.createElement(AddTargetForm, { token }),
    );
    expect(markup).toContain("<form");
    expect(markup).toContain('name="keyword"');
    expect(markup).toContain('name="domain"');
    expect(markup).toContain('type="submit"');
  });

  it("does not include an email input (email is implicit from session)", async () => {
    const { AddTargetForm } = await import("../components/tracker/add-target-form");
    const token = randomUUID();
    const markup = renderToStaticMarkup(
      React.createElement(AddTargetForm, { token }),
    );
    expect(markup).not.toContain('name="email"');
  });
});
