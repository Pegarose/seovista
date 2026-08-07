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
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ActionState } from "@/lib/geo-checker/actions";
import { type SchemaActionState } from "@/lib/schema-checker/actions";
import { type AiCrawlerActionState } from "@/lib/ai-crawler-checker/actions";
import { type KeywordRankActionState } from "@/lib/keyword-rank-checker/actions";
import { type RenderParityActionState } from "@/lib/render-parity-diff/actions";
import { type AttributionTraceActionState } from "@/lib/attribution-trace/actions";
import { type SchemaTruthActionState } from "@/lib/schema-truth-check/actions";
import GeoReadinessCheckerPage from "../../app/tools/geo-readiness-checker/page";
import SchemaCheckerPage from "../../app/tools/schema-checker/page";
import AiCrawlerCheckerPage from "../../app/tools/ai-crawler-checker/page";
import KeywordRankCheckerPage from "../../app/tools/keyword-rank-checker/page";
import RenderParityDiffPage from "../../app/tools/render-parity-diff/page";
import AttributionTracePage from "../../app/tools/attribution-trace/page";
import SchemaTruthCheckPage from "../../app/tools/schema-truth-check/page";
import SerpPreviewPage from "../../app/tools/serp-preview/page";

const { mockStartGeoAuditAction } = vi.hoisted(() => ({
  mockStartGeoAuditAction: vi.fn<(prev: ActionState, formData: FormData) => Promise<ActionState>>(),
}));

const { mockStartSchemaAuditAction } = vi.hoisted(() => ({
  mockStartSchemaAuditAction: vi.fn<(prev: SchemaActionState, formData: FormData) => Promise<SchemaActionState>>(),
}));

const { mockStartAiCrawlerAuditAction } = vi.hoisted(() => ({
  mockStartAiCrawlerAuditAction: vi.fn<(prev: AiCrawlerActionState, formData: FormData) => Promise<AiCrawlerActionState>>(),
}));

const { mockStartKeywordRankCheckAction } = vi.hoisted(() => ({
  mockStartKeywordRankCheckAction: vi.fn<(prev: KeywordRankActionState, formData: FormData) => Promise<KeywordRankActionState>>(),
}));

const { mockStartRenderParityCheckAction } = vi.hoisted(() => ({
  mockStartRenderParityCheckAction: vi.fn<(prev: RenderParityActionState, formData: FormData) => Promise<RenderParityActionState>>(),
}));

const { mockStartAttributionTraceAction } = vi.hoisted(() => ({
  mockStartAttributionTraceAction: vi.fn<(prev: AttributionTraceActionState, formData: FormData) => Promise<AttributionTraceActionState>>(),
}));

const { mockStartSchemaTruthCheckAction } = vi.hoisted(() => ({
  mockStartSchemaTruthCheckAction: vi.fn<(prev: SchemaTruthActionState, formData: FormData) => Promise<SchemaTruthActionState>>(),
}));

vi.mock("@/lib/geo-checker/actions", () => ({
  startGeoAuditAction: mockStartGeoAuditAction,
}));

vi.mock("@/lib/schema-checker/actions", () => ({
  startSchemaAuditAction: mockStartSchemaAuditAction,
}));

vi.mock("@/lib/ai-crawler-checker/actions", () => ({
  startAiCrawlerAuditAction: mockStartAiCrawlerAuditAction,
}));

vi.mock("@/lib/keyword-rank-checker/actions", () => ({
  startKeywordRankCheckAction: mockStartKeywordRankCheckAction,
}));

vi.mock("@/lib/render-parity-diff/actions", () => ({
  startRenderParityCheckAction: mockStartRenderParityCheckAction,
}));

vi.mock("@/lib/attribution-trace/actions", () => ({
  startAttributionTraceAction: mockStartAttributionTraceAction,
}));

vi.mock("@/lib/schema-truth-check/actions", () => ({
  startSchemaTruthCheckAction: mockStartSchemaTruthCheckAction,
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
    mockStartKeywordRankCheckAction.mockReset();
    mockStartKeywordRankCheckAction.mockResolvedValue({ status: "idle" });
    mockStartRenderParityCheckAction.mockReset();
    mockStartRenderParityCheckAction.mockResolvedValue({ status: "idle" });
    mockStartAttributionTraceAction.mockReset();
    mockStartAttributionTraceAction.mockResolvedValue({ status: "idle" });
    mockStartSchemaTruthCheckAction.mockReset();
    mockStartSchemaTruthCheckAction.mockResolvedValue({ status: "idle" });
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

  describe("schema-checker", () => {
    const idleState: SchemaActionState = { status: "idle" };
    const failureState: SchemaActionState = {
      status: "error",
      errors: {
        form: ["Saatlik audit limitine (10) ulaştınız. Lütfen daha sonra tekrar deneyiniz."],
      },
    };

    beforeEach(() => {
      mockStartSchemaAuditAction.mockReset();
      mockStartSchemaAuditAction.mockResolvedValue(idleState);
    });

    async function renderSchemaPage(): Promise<string> {
      let page!: React.ReactElement;
      await act(async () => {
        page = <SchemaCheckerPage />;
      });
      await act(async () => {
        root.render(page);
      });
      return container.innerHTML;
    }

    it("renders one main + one h1 with the url field and no retired tokens", async () => {
      const markup = await renderSchemaPage();

      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">Schema &amp; Yapısal Veri Denetleyicisi</h1>");
      expect(markup).toContain("Seovista / Instruments");

      expect(markup).toContain('id="url"');
      expect(markup).toContain('for="url"');
      const label = container.querySelector('label[for="url"]');
      expect(label).not.toBeNull();
      expect(label!.getAttribute("for")).toBe("url");
      expect(container.querySelector("#url")).not.toBeNull();

      // Idle submit button is enabled with the idle label.
      expect(markup).toContain(">Schema Denetimini Başlat</button>");
      const idleButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(idleButton).not.toBeNull();
      expect(idleButton!.hasAttribute("disabled")).toBe(false);
      expect(idleButton!.textContent).toContain("Schema Denetimini Başlat");
      expect(idleButton!.textContent).not.toContain("Denetim Başlatılıyor...");

      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("surfaces the form error note when the action returns the failure branch", async () => {
      mockStartSchemaAuditAction.mockResolvedValue(failureState);
      await renderSchemaPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartSchemaAuditAction).toHaveBeenCalledTimes(1);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain("limitine");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("renders no error note on the success branch", async () => {
      mockStartSchemaAuditAction.mockResolvedValue(idleState);
      await renderSchemaPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartSchemaAuditAction).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      const button = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.hasAttribute("disabled")).toBe(false);
      expect(button!.textContent).toContain("Schema Denetimini Başlat");
      expect(container.innerHTML).toContain(">Schema Denetimini Başlat</button>");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("disables the submit button while pending, then returns to idle on resolution", async () => {
      let deferredResolve!: (state: SchemaActionState) => void;
      const deferredPromise = new Promise<SchemaActionState>((resolve) => {
        deferredResolve = resolve;
      });
      mockStartSchemaAuditAction.mockImplementationOnce(() => deferredPromise);

      await renderSchemaPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();

      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartSchemaAuditAction).toHaveBeenCalledTimes(1);

      const pendingButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(pendingButton).not.toBeNull();
      expect(pendingButton!.hasAttribute("disabled")).toBe(true);
      expect(pendingButton!.textContent).toContain("Denetim Başlatılıyor...");
      expect(pendingButton!.textContent).not.toContain("Schema Denetimini Başlat");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);

      await act(async () => {
        deferredResolve(idleState);
      });
      await act(async () => {});

      const settledButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(settledButton).not.toBeNull();
      expect(settledButton!.hasAttribute("disabled")).toBe(false);
      expect(settledButton!.textContent).toContain("Schema Denetimini Başlat");
      expect(settledButton!.textContent).not.toContain("Denetim Başlatılıyor...");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });
  });

  describe("ai-crawler-checker", () => {
    const idleState: AiCrawlerActionState = { status: "idle" };
    const failureState: AiCrawlerActionState = {
      status: "error",
      errors: {
        form: ["Saatlik audit limitine (10) ulaştınız. Lütfen daha sonra tekrar deneyiniz."],
      },
    };

    beforeEach(() => {
      mockStartAiCrawlerAuditAction.mockReset();
      mockStartAiCrawlerAuditAction.mockResolvedValue(idleState);
    });

    async function renderAiCrawlerPage(): Promise<string> {
      let page!: React.ReactElement;
      await act(async () => {
        page = <AiCrawlerCheckerPage />;
      });
      await act(async () => {
        root.render(page);
      });
      return container.innerHTML;
    }

    it("renders one main + one h1 with the url field and no retired tokens", async () => {
      const markup = await renderAiCrawlerPage();

      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">AI Crawler Checker</h1>");
      expect(markup).toContain("Seovista / Instruments");

      expect(markup).toContain('id="url"');
      expect(markup).toContain('for="url"');
      const label = container.querySelector('label[for="url"]');
      expect(label).not.toBeNull();
      expect(label!.getAttribute("for")).toBe("url");
      expect(container.querySelector("#url")).not.toBeNull();

      // Idle submit button is enabled with the idle label.
      expect(markup).toContain(">AI Crawler Denetimini Başlat</button>");
      const idleButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(idleButton).not.toBeNull();
      expect(idleButton!.hasAttribute("disabled")).toBe(false);
      expect(idleButton!.textContent).toContain("AI Crawler Denetimini Başlat");
      expect(idleButton!.textContent).not.toContain("Denetim Başlatılıyor...");

      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("surfaces the form error note when the action returns the failure branch", async () => {
      mockStartAiCrawlerAuditAction.mockResolvedValue(failureState);
      await renderAiCrawlerPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartAiCrawlerAuditAction).toHaveBeenCalledTimes(1);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain("limitine");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("renders no error note on the success branch", async () => {
      mockStartAiCrawlerAuditAction.mockResolvedValue(idleState);
      await renderAiCrawlerPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartAiCrawlerAuditAction).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      const button = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.hasAttribute("disabled")).toBe(false);
      expect(button!.textContent).toContain("AI Crawler Denetimini Başlat");
      expect(container.innerHTML).toContain(">AI Crawler Denetimini Başlat</button>");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("disables the submit button while pending, then returns to idle on resolution", async () => {
      let deferredResolve!: (state: AiCrawlerActionState) => void;
      const deferredPromise = new Promise<AiCrawlerActionState>((resolve) => {
        deferredResolve = resolve;
      });
      mockStartAiCrawlerAuditAction.mockImplementationOnce(() => deferredPromise);

      await renderAiCrawlerPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();

      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartAiCrawlerAuditAction).toHaveBeenCalledTimes(1);

      const pendingButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(pendingButton).not.toBeNull();
      expect(pendingButton!.hasAttribute("disabled")).toBe(true);
      expect(pendingButton!.textContent).toContain("Denetim Başlatılıyor...");
      expect(pendingButton!.textContent).not.toContain("AI Crawler Denetimini Başlat");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);

      await act(async () => {
        deferredResolve(idleState);
      });
      await act(async () => {});

      const settledButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(settledButton).not.toBeNull();
      expect(settledButton!.hasAttribute("disabled")).toBe(false);
      expect(settledButton!.textContent).toContain("AI Crawler Denetimini Başlat");
      expect(settledButton!.textContent).not.toContain("Denetim Başlatılıyor...");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });
  });

  describe("keyword-rank-checker", () => {
    const idleState: KeywordRankActionState = { status: "idle" };
    const failureState: KeywordRankActionState = {
      status: "error",
      errors: {
        form: ["Saatlik audit limitine (10) ulaştınız. Lütfen daha sonra tekrar deneyiniz."],
      },
    };

    beforeEach(() => {
      mockStartKeywordRankCheckAction.mockReset();
      mockStartKeywordRankCheckAction.mockResolvedValue(idleState);
    });

    async function renderKeywordRankPage(): Promise<string> {
      let page!: React.ReactElement;
      await act(async () => {
        page = <KeywordRankCheckerPage />;
      });
      await act(async () => {
        root.render(page);
      });
      return container.innerHTML;
    }

    it("renders one main + one h1 with domain/keyword/locale fields", async () => {
      const markup = await renderKeywordRankPage();

      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">Anahtar Kelime Sıralama Kontrolü</h1>");
      expect(markup).toContain("Seovista / Instruments");

      for (const controlId of ["domain", "keyword", "locale"]) {
        expect(markup).toContain(`id="${controlId}"`);
        expect(markup).toContain(`for="${controlId}"`);
        const label = container.querySelector(`label[for="${controlId}"]`);
        expect(label).not.toBeNull();
        expect(label!.getAttribute("for")).toBe(controlId);
        expect(container.querySelector(`#${controlId}`)).not.toBeNull();
      }

      // Idle submit button is enabled with the idle label.
      expect(markup).toContain(">Sıralamayı Kontrol Et</button>");
      const idleButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(idleButton).not.toBeNull();
      expect(idleButton!.hasAttribute("disabled")).toBe(false);
      expect(idleButton!.textContent).toContain("Sıralamayı Kontrol Et");
      expect(idleButton!.textContent).not.toContain("Kontrol Ediliyor...");

      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("surfaces the form error note when the action returns the failure branch", async () => {
      mockStartKeywordRankCheckAction.mockResolvedValue(failureState);
      await renderKeywordRankPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartKeywordRankCheckAction).toHaveBeenCalledTimes(1);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain("limitine");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("renders no error note on the success branch", async () => {
      mockStartKeywordRankCheckAction.mockResolvedValue(idleState);
      await renderKeywordRankPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartKeywordRankCheckAction).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      const button = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.hasAttribute("disabled")).toBe(false);
      expect(button!.textContent).toContain("Sıralamayı Kontrol Et");
      expect(container.innerHTML).toContain(">Sıralamayı Kontrol Et</button>");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("disables the submit button while pending, then returns to idle on resolution", async () => {
      let deferredResolve!: (state: KeywordRankActionState) => void;
      const deferredPromise = new Promise<KeywordRankActionState>((resolve) => {
        deferredResolve = resolve;
      });
      mockStartKeywordRankCheckAction.mockImplementationOnce(() => deferredPromise);

      await renderKeywordRankPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();

      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartKeywordRankCheckAction).toHaveBeenCalledTimes(1);

      const pendingButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(pendingButton).not.toBeNull();
      expect(pendingButton!.hasAttribute("disabled")).toBe(true);
      expect(pendingButton!.textContent).toContain("Kontrol Ediliyor...");
      expect(pendingButton!.textContent).not.toContain("Sıralamayı Kontrol Et");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);

      await act(async () => {
        deferredResolve(idleState);
      });
      await act(async () => {});

      const settledButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(settledButton).not.toBeNull();
      expect(settledButton!.hasAttribute("disabled")).toBe(false);
      expect(settledButton!.textContent).toContain("Sıralamayı Kontrol Et");
      expect(settledButton!.textContent).not.toContain("Kontrol Ediliyor...");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });
  });

  describe("render-parity-diff", () => {
    const idleState: RenderParityActionState = { status: "idle" };
    const failureState: RenderParityActionState = {
      status: "error",
      errors: {
        form: ["Saatlik audit limitine (10) ulaştınız. Lütfen daha sonra tekrar deneyiniz."],
      },
    };

    beforeEach(() => {
      mockStartRenderParityCheckAction.mockReset();
      mockStartRenderParityCheckAction.mockResolvedValue(idleState);
    });

    async function renderRenderParityPage(): Promise<string> {
      let page!: React.ReactElement;
      await act(async () => {
        page = <RenderParityDiffPage />;
      });
      await act(async () => {
        root.render(page);
      });
      return container.innerHTML;
    }

    it("renders one main + one h1 with the url field and the bot-typo fix", async () => {
      const markup = await renderRenderParityPage();

      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">Render Parity Karşılaştırması</h1>");
      expect(markup).toContain("Seovista / Instruments");

      expect(markup).toContain('id="url"');
      expect(markup).toContain('for="url"');
      const label = container.querySelector('label[for="url"]');
      expect(label).not.toBeNull();
      expect(label!.getAttribute("for")).toBe("url");
      expect(container.querySelector("#url")).not.toBeNull();

      // The helper carries the single bot User-Agent reference (typo fixed).
      expect(markup).toContain("bir kez bir bot User-Agent'ı ile");
      expect(markup).not.toContain("bir kez bir tarayıcı\nUser-Agent'ı ile");

      // Idle submit button is enabled with the idle label.
      expect(markup).toContain(">Karşılaştırmayı Başlat</button>");
      const idleButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(idleButton).not.toBeNull();
      expect(idleButton!.hasAttribute("disabled")).toBe(false);
      expect(idleButton!.textContent).toContain("Karşılaştırmayı Başlat");
      expect(idleButton!.textContent).not.toContain("Karşılaştırılıyor...");

      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("surfaces the form error note when the action returns the failure branch", async () => {
      mockStartRenderParityCheckAction.mockResolvedValue(failureState);
      await renderRenderParityPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartRenderParityCheckAction).toHaveBeenCalledTimes(1);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain("limitine");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("renders no error note on the success branch", async () => {
      mockStartRenderParityCheckAction.mockResolvedValue(idleState);
      await renderRenderParityPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartRenderParityCheckAction).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      const button = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.hasAttribute("disabled")).toBe(false);
      expect(button!.textContent).toContain("Karşılaştırmayı Başlat");
      expect(container.innerHTML).toContain(">Karşılaştırmayı Başlat</button>");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("disables the submit button while pending, then returns to idle on resolution", async () => {
      let deferredResolve!: (state: RenderParityActionState) => void;
      const deferredPromise = new Promise<RenderParityActionState>((resolve) => {
        deferredResolve = resolve;
      });
      mockStartRenderParityCheckAction.mockImplementationOnce(() => deferredPromise);

      await renderRenderParityPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();

      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartRenderParityCheckAction).toHaveBeenCalledTimes(1);

      const pendingButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(pendingButton).not.toBeNull();
      expect(pendingButton!.hasAttribute("disabled")).toBe(true);
      expect(pendingButton!.textContent).toContain("Karşılaştırılıyor...");
      expect(pendingButton!.textContent).not.toContain("Karşılaştırmayı Başlat");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);

      await act(async () => {
        deferredResolve(idleState);
      });
      await act(async () => {});

      const settledButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(settledButton).not.toBeNull();
      expect(settledButton!.hasAttribute("disabled")).toBe(false);
      expect(settledButton!.textContent).toContain("Karşılaştırmayı Başlat");
      expect(settledButton!.textContent).not.toContain("Karşılaştırılıyor...");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });
  });

  describe("attribution-trace", () => {
    const idleState: AttributionTraceActionState = { status: "idle" };
    const failureState: AttributionTraceActionState = {
      status: "error",
      errors: {
        form: ["Saatlik audit limitine (10) ulaştınız. Lütfen daha sonra tekrar deneyiniz."],
      },
    };

    beforeEach(() => {
      mockStartAttributionTraceAction.mockReset();
      mockStartAttributionTraceAction.mockResolvedValue(idleState);
    });

    async function renderAttributionTracePage(): Promise<string> {
      let page!: React.ReactElement;
      await act(async () => {
        page = <AttributionTracePage />;
      });
      await act(async () => {
        root.render(page);
      });
      return container.innerHTML;
    }

    it("renders one main + one h1 with domain/keyword/answer fields and no retired tokens", async () => {
      const markup = await renderAttributionTracePage();

      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">Attribution Trace</h1>");
      expect(markup).toContain("Seovista / Instruments");

      for (const controlId of ["domain", "keyword", "answer"]) {
        expect(markup).toContain(`id="${controlId}"`);
        expect(markup).toContain(`for="${controlId}"`);
        const label = container.querySelector(`label[for="${controlId}"]`);
        expect(label).not.toBeNull();
        expect(label!.getAttribute("for")).toBe(controlId);
        expect(container.querySelector(`#${controlId}`)).not.toBeNull();
      }

      // Idle submit button is enabled with the idle label.
      expect(markup).toContain(">Attribution Trace Başlat</button>");
      const idleButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(idleButton).not.toBeNull();
      expect(idleButton!.hasAttribute("disabled")).toBe(false);
      expect(idleButton!.textContent).toContain("Attribution Trace Başlat");
      expect(idleButton!.textContent).not.toContain("İzleniyor...");

      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("surfaces the form error note when the action returns the failure branch", async () => {
      mockStartAttributionTraceAction.mockResolvedValue(failureState);
      await renderAttributionTracePage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartAttributionTraceAction).toHaveBeenCalledTimes(1);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain("limitine");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("renders no error note on the success branch", async () => {
      mockStartAttributionTraceAction.mockResolvedValue(idleState);
      await renderAttributionTracePage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartAttributionTraceAction).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      const button = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.hasAttribute("disabled")).toBe(false);
      expect(button!.textContent).toContain("Attribution Trace Başlat");
      expect(container.innerHTML).toContain(">Attribution Trace Başlat</button>");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("disables the submit button while pending, then returns to idle on resolution", async () => {
      let deferredResolve!: (state: AttributionTraceActionState) => void;
      const deferredPromise = new Promise<AttributionTraceActionState>((resolve) => {
        deferredResolve = resolve;
      });
      mockStartAttributionTraceAction.mockImplementationOnce(() => deferredPromise);

      await renderAttributionTracePage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();

      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartAttributionTraceAction).toHaveBeenCalledTimes(1);

      const pendingButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(pendingButton).not.toBeNull();
      expect(pendingButton!.hasAttribute("disabled")).toBe(true);
      expect(pendingButton!.textContent).toContain("İzleniyor...");
      expect(pendingButton!.textContent).not.toContain("Attribution Trace Başlat");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);

      await act(async () => {
        deferredResolve(idleState);
      });
      await act(async () => {});

      const settledButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(settledButton).not.toBeNull();
      expect(settledButton!.hasAttribute("disabled")).toBe(false);
      expect(settledButton!.textContent).toContain("Attribution Trace Başlat");
      expect(settledButton!.textContent).not.toContain("İzleniyor...");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });
  });

  describe("schema-truth-check", () => {
    const idleState: SchemaTruthActionState = { status: "idle" };
    const failureState: SchemaTruthActionState = {
      status: "error",
      errors: {
        form: ["Saatlik audit limitine (10) ulaştınız. Lütfen daha sonra tekrar deneyiniz."],
      },
    };

    beforeEach(() => {
      mockStartSchemaTruthCheckAction.mockReset();
      mockStartSchemaTruthCheckAction.mockResolvedValue(idleState);
    });

    async function renderSchemaTruthCheckPage(): Promise<string> {
      let page!: React.ReactElement;
      await act(async () => {
        page = <SchemaTruthCheckPage />;
      });
      await act(async () => {
        root.render(page);
      });
      return container.innerHTML;
    }

    it("renders one main + one h1 with the url field and no retired tokens", async () => {
      const markup = await renderSchemaTruthCheckPage();

      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">Schema Doğruluk Denetimi</h1>");
      expect(markup).toContain("Seovista / Instruments");

      expect(markup).toContain('id="url"');
      expect(markup).toContain('for="url"');
      const label = container.querySelector('label[for="url"]');
      expect(label).not.toBeNull();
      expect(label!.getAttribute("for")).toBe("url");
      expect(container.querySelector("#url")).not.toBeNull();

      // Idle submit button is enabled with the idle label.
      expect(markup).toContain(">Denetimi Başlat</button>");
      const idleButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(idleButton).not.toBeNull();
      expect(idleButton!.hasAttribute("disabled")).toBe(false);
      expect(idleButton!.textContent).toContain("Denetimi Başlat");
      expect(idleButton!.textContent).not.toContain("Denetleniyor...");

      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("surfaces the form error note when the action returns the failure branch", async () => {
      mockStartSchemaTruthCheckAction.mockResolvedValue(failureState);
      await renderSchemaTruthCheckPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartSchemaTruthCheckAction).toHaveBeenCalledTimes(1);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain("limitine");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("renders no error note on the success branch", async () => {
      mockStartSchemaTruthCheckAction.mockResolvedValue(idleState);
      await renderSchemaTruthCheckPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartSchemaTruthCheckAction).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      const button = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.hasAttribute("disabled")).toBe(false);
      expect(button!.textContent).toContain("Denetimi Başlat");
      expect(container.innerHTML).toContain(">Denetimi Başlat</button>");
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });

    it("disables the submit button while pending, then returns to idle on resolution", async () => {
      let deferredResolve!: (state: SchemaTruthActionState) => void;
      const deferredPromise = new Promise<SchemaTruthActionState>((resolve) => {
        deferredResolve = resolve;
      });
      mockStartSchemaTruthCheckAction.mockImplementationOnce(() => deferredPromise);

      await renderSchemaTruthCheckPage();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();

      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(mockStartSchemaTruthCheckAction).toHaveBeenCalledTimes(1);

      const pendingButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(pendingButton).not.toBeNull();
      expect(pendingButton!.hasAttribute("disabled")).toBe(true);
      expect(pendingButton!.textContent).toContain("Denetleniyor...");
      expect(pendingButton!.textContent).not.toContain("Denetimi Başlat");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);

      await act(async () => {
        deferredResolve(idleState);
      });
      await act(async () => {});

      const settledButton = container.querySelector("button[type='submit']") as HTMLButtonElement | null;
      expect(settledButton).not.toBeNull();
      expect(settledButton!.hasAttribute("disabled")).toBe(false);
      expect(settledButton!.textContent).toContain("Denetimi Başlat");
      expect(settledButton!.textContent).not.toContain("Denetleniyor...");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.innerHTML).not.toMatch(RETIRED_TOKEN_RE);
    });
  });

  describe("serp-preview", () => {
    it("renders one main + one h1 in the FormShell frame", async () => {
      const el = await SerpPreviewPage({ searchParams: Promise.resolve({}) });
      const markup = renderToStaticMarkup(el);
      expect(countTag(markup, "main")).toBe(1);
      expect(countTag(markup, "h1")).toBe(1);
      expect(markup).toContain(">SERP Preview</h1>");
      expect(markup).toContain("Seovista / Instruments");
      expect(markup).not.toMatch(RETIRED_TOKEN_RE);
    });
  });
});
