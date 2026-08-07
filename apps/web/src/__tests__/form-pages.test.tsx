// @vitest-environment happy-dom
//
// Form Pages Editorial Lab — shared client-page test pattern (Tasks 2-5).
//
// Each tool's form page is a Client component driven by useActionState. We
// mount it with createRoot + act (a real DOM via happy-dom) so assertions run
// against the exact markup the browser receives, including the one-main /
// one-h1 landmark contract, the design-token vocabulary (never slate-*), and
// the live failure branch produced by the tool's server action.
//
// Mocking the tool's actions module follows the repo's alias-based convention
// (same as result-shell.test.tsx): vi.mock resolves by module id, so the alias
// specifier intercepts the page's relative import of the same file.
// startGeoAuditAction is declared externally (vi.hoisted) and reconfigured per
// test to return the failure branch ({status:'error', errors}) or the success
// branch ({status:'idle'}).

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ActionState } from "@/lib/geo-checker/actions";
import GeoReadinessCheckerPage from "../../app/tools/geo-readiness-checker/page";

const { mockStartGeoAuditAction } = vi.hoisted(() => ({
  mockStartGeoAuditAction: vi.fn<(prev: ActionState, formData: FormData) => Promise<ActionState>>(),
}));

vi.mock("@/lib/geo-checker/actions", () => ({
  startGeoAuditAction: mockStartGeoAuditAction,
}));

const RETIRED_TOKEN_RE = /slate-|gray-|indigo-|blue-|red-|green-|amber-|emerald-|sky-|rose-/;

const FAILURE_STATE: ActionState = {
  status: "error",
  errors: {
    form: ["Failed to start audit due to a system error. Please try again later."],
  },
};

function countTag(markup: string, tag: string): number {
  const re = new RegExp(`<${tag}[\\s>]`, "g");
  return (markup.match(re) ?? []).length;
}

async function renderGeoPage(container: HTMLElement, root: Root): Promise<string> {
  let page!: React.ReactElement;
  await act(async () => {
    page = <GeoReadinessCheckerPage />;
  });
  await act(async () => {
    root.render(page);
  });
  return container.innerHTML;
}

describe("Form pages", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    mockStartGeoAuditAction.mockReset();
    mockStartGeoAuditAction.mockResolvedValue({ status: "idle" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  describe("geo-readiness-checker", () => {
    it("renders one main + one h1 in the FormShell frame with all fields", async () => {
      const markup = await renderGeoPage(container, root);

      // Landmark contract.
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">GEO Readiness Checker</h1>");
      expect(markup).toContain("Seovista / Instruments");

      // Every control exposes an id and every label binds to it via htmlFor.
      expect(markup).toContain('id="domain"');
      expect(markup).toContain('id="brandName"');
      expect(markup).toContain('id="primaryMarket"');
      expect(markup).toContain('for="domain"');
      expect(markup).toContain('for="brandName"');
      expect(markup).toContain('for="primaryMarket"');
      for (const controlId of ["domain", "brandName", "primaryMarket"]) {
        const label = container.querySelector(`label[for="${controlId}"]`);
        expect(label).not.toBeNull();
        expect(label!.getAttribute("for")).toBe(controlId);
        expect(container.querySelector(`#${controlId}`)).not.toBeNull();
      }

      // Idle submit button is enabled (no disabled attribute) with idle label.
      expect(markup).toContain(">Start Free Audit</button>");
      const idleButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(idleButton).not.toBeNull();
      expect(idleButton!.hasAttribute("disabled")).toBe(false);
      expect(idleButton!.textContent).toContain("Start Free Audit");
      expect(idleButton!.textContent).not.toContain("Starting Audit...");

      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("surfaces the form error note when the audit action returns the failure branch", async () => {
      mockStartGeoAuditAction.mockResolvedValue(FAILURE_STATE);
      await renderGeoPage(container, root);
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartGeoAuditAction).toHaveBeenCalledTimes(1);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain("Failed to start audit");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("renders no error note on the success branch", async () => {
      mockStartGeoAuditAction.mockResolvedValue({ status: "idle" });
      await renderGeoPage(container, root);
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartGeoAuditAction).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      const button = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.hasAttribute("disabled")).toBe(false);
      expect(button!.textContent).toContain("Start Free Audit");
      expect(container.innerHTML).toContain(">Start Free Audit</button>");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("disables the submit button while pending, then returns to idle on resolution", async () => {
      // Manually-deferred action so useActionState stays in isPending until we resolve.
      let deferredResolve!: (state: ActionState) => void;
      const deferredPromise = new Promise<ActionState>((resolve) => {
        deferredResolve = resolve;
      });
      mockStartGeoAuditAction.mockImplementationOnce(() => deferredPromise);

      await renderGeoPage(container, root);

      const form = container.querySelector("form");
      expect(form).not.toBeNull();

      // Dispatch -> useActionState enters the pending branch.
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartGeoAuditAction).toHaveBeenCalledTimes(1);

      const pendingButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(pendingButton).not.toBeNull();
      expect(pendingButton!.hasAttribute("disabled")).toBe(true);
      expect(pendingButton!.textContent).toContain("Starting Audit...");
      expect(pendingButton!.textContent).not.toContain("Start Free Audit");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);

      // Resolve to the success branch -> post-action flush -> back to idle.
      await act(async () => {
        deferredResolve({ status: "idle" });
      });
      await act(async () => {});

      const settledButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(settledButton).not.toBeNull();
      expect(settledButton!.hasAttribute("disabled")).toBe(false);
      expect(settledButton!.textContent).toContain("Start Free Audit");
      expect(settledButton!.textContent).not.toContain("Starting Audit...");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });
  });
});
