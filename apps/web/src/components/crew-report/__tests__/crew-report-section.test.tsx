// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrewReportSection } from "../crew-report-section";
import * as actions from "@/lib/crew-report/actions";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("@/lib/crew-report/actions", () => ({
  startCrewReportAction: vi.fn(),
  checkCrewReportStatusAction: vi.fn(),
}));

const mockStart = vi.mocked(actions.startCrewReportAction);
const mockCheck = vi.mocked(actions.checkCrewReportStatusAction);

const SOURCE_JOB_ID = "11111111-2222-4333-8444-555555555555";
const CREW_JOB_ID = "00000000-0000-4000-8000-000000000001";

const REPORT = {
  kind: "crew-report" as const,
  dataSource: "crew-agency" as const,
  sourceJobId: SOURCE_JOB_ID,
  tool: "geo-readiness" as const,
  endpoint: "/api/rapor-uret",
  reportMarkdown: "# Örnek Rapor\n\nStrateji önerileri.",
  crewJobId: "crew-abc",
  generatedAt: "2026-08-01T00:00:00.000Z",
};

async function renderSection(root: Root) {
  await act(async () => {
    root.render(<CrewReportSection sourceJobId={SOURCE_JOB_ID} tool="geo-readiness" />);
    await Promise.resolve();
  });
}

async function flushMicrotasks(times = 4) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

async function submitGateForm(container: HTMLElement) {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  const email = form!.querySelector('input[name="email"]') as HTMLInputElement;
  const consent = form!.querySelector('input[name="consent"]') as HTMLInputElement;
  email.value = "kullanici@example.com";
  consent.checked = true;
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
  });
}

describe("CrewReportSection", () => {
  let container: HTMLDivElement;
  let root: Root;
  let mounted = false;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mounted = true;
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        root.unmount();
      });
    }
    container.remove();
    vi.useRealTimers();
  });

  it("renders the locked gate with email, consent and submit (and no h1)", async () => {
    await renderSection(root);

    expect(container.querySelector("form")).not.toBeNull();
    expect(container.querySelector('input[name="email"]')).not.toBeNull();
    expect(container.querySelector('input[name="consent"]')).not.toBeNull();
    expect(
      container.querySelector('input[name="sourceJobId"]')?.getAttribute("value")
    ).toBe(SOURCE_JOB_ID);
    expect(container.querySelector('input[name="tool"]')?.getAttribute("value")).toBe(
      "geo-readiness"
    );
    expect(container.querySelector('button[type="submit"]')).not.toBeNull();
    expect(container.textContent).toContain("AI Strategy Report");
    // One-<h1>-per-page rule: the section must not introduce its own h1.
    expect(container.querySelectorAll("h1")).toHaveLength(0);
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(0);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("submits the gate form and switches to the in-flight polling state", async () => {
    mockStart.mockResolvedValue({ status: "started", crewJobId: CREW_JOB_ID });
    mockCheck.mockResolvedValue({ success: true, data: { status: "running" } });

    await renderSection(root);
    await submitGateForm(container);

    expect(mockStart).toHaveBeenCalledTimes(1);
    const formData = mockStart.mock.calls[0]![1] as FormData;
    expect(formData.get("sourceJobId")).toBe(SOURCE_JOB_ID);
    expect(formData.get("tool")).toBe("geo-readiness");
    expect(formData.get("email")).toBe("kullanici@example.com");
    expect(formData.get("consent")).toBe("true");

    // The gate form is replaced by the in-flight status.
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).toContain("Your AI strategy report is being generated");
    expect(mockCheck).toHaveBeenCalledWith(CREW_JOB_ID);

    // Keeps polling on the 3s interval while the job stays in flight.
    const callsBefore = mockCheck.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(mockCheck.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("renders the report region when polling reports completed", async () => {
    mockStart.mockResolvedValue({ status: "started", crewJobId: CREW_JOB_ID });
    mockCheck.mockResolvedValue({ success: true, data: { status: "completed", report: REPORT } });

    await renderSection(root);
    await submitGateForm(container);
    await act(async () => {
      await flushMicrotasks();
    });

    const reportRegion = container.querySelector('[data-testid="crew-report-content"]');
    expect(reportRegion).not.toBeNull();
    expect(reportRegion!.textContent).toContain("Örnek Rapor");

    // Polling stops once the report is rendered.
    const callsAfterComplete = mockCheck.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(mockCheck.mock.calls.length).toBe(callsAfterComplete);
  });

  it.each(["failed", "timeout"] as const)(
    "renders the error and a retry button when the job ends as %s",
    async (status) => {
      mockStart.mockResolvedValue({ status: "started", crewJobId: CREW_JOB_ID });
      mockCheck.mockResolvedValue({ success: true, data: { status } });

      await renderSection(root);
      await submitGateForm(container);
      await act(async () => {
        await flushMicrotasks();
      });

      expect(container.textContent).toContain("The report failed or timed out. Please try again.");
      const retryButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Try again")
      );
      expect(retryButton).toBeDefined();

      await act(async () => {
        retryButton!.click();
        await flushMicrotasks();
      });

      // Retry returns to the locked gate.
      expect(container.querySelector("form")).not.toBeNull();
    }
  );

  it("stays locked and shows the action form error", async () => {
    mockStart.mockResolvedValue({
      status: "error",
      errors: { form: ["AI strateji raporu servisi henüz yapılandırılmadı."] },
    });

    await renderSection(root);
    await submitGateForm(container);

    expect(container.querySelector("form")).not.toBeNull();
    expect(container.textContent).toContain("AI strateji raporu servisi henüz yapılandırılmadı.");
    expect(mockCheck).not.toHaveBeenCalled();
  });
});
