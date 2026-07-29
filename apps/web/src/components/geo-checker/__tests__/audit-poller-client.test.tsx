// @vitest-environment happy-dom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditPoller } from "../audit-poller";
import * as actions from "@/lib/geo-checker/actions";

const mockRefresh = vi.fn();
const mockRouter = {
  refresh: mockRefresh,
  push: vi.fn(),
  replace: vi.fn(),
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/geo-checker/actions", () => ({
  checkJobStatusAction: vi.fn(),
}));

const checkStatus = vi.mocked(actions.checkJobStatusAction);

function pendingStatusAction() {
  return new Promise<never>(() => undefined);
}

async function renderPoller(root: Root, props: React.ComponentProps<typeof AuditPoller>) {
  await act(async () => {
    root.render(<AuditPoller {...props} />);
    await Promise.resolve();
  });
}

describe("AuditPoller real Client Component lifecycle", () => {
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

  it("cancels the in-flight poll and deadline when unmounted", async () => {
    checkStatus.mockImplementation(pendingStatusAction);

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "running" });
    expect(checkStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    mounted = false;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 10_000);
    });

    expect(checkStatus).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  

  it.each([
    ["queued", "Audit in queue…"],
    ["running", "Running audit…"],
    ["pending", "Audit pending"],
  ] as const)("renders persisted %s immediately without a queued flash", async (initialStatus, label) => {
    checkStatus.mockImplementation(pendingStatusAction);

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus });

    expect(container.textContent).toContain(label);
    if (initialStatus !== "queued") {
      expect(container.textContent).not.toContain("Audit in queue…");
    }
  });

  it.each(["completed", "failed", "timeout", "permanent", "permanent_failure"] as const)(
    "refreshes the route and stops after terminal status %s",
    async (status) => {
      checkStatus.mockResolvedValueOnce({
        success: true,
        data: { status: status as any },
      });

      await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "running" });

      expect(checkStatus).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(checkStatus).toHaveBeenCalledTimes(1);
    },
  );

  it("shows unavailable and stops when the action is rejected", async () => {
    checkStatus.mockResolvedValueOnce({
      success: false,
      error: "Action rejected",
    });

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "pending" });

    expect(container.textContent).toContain("Audit status unavailable");
    expect(mockRefresh).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });

  it("shows unavailable and stops when the status action throws", async () => {
    checkStatus.mockRejectedValueOnce(new Error("Database unavailable"));

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "pending" });

    expect(container.textContent).toContain("Audit status unavailable");
    expect(mockRefresh).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });

  it("shows unavailable and stops when the action returns an unknown status", async () => {
    checkStatus.mockResolvedValueOnce({
      success: true,
      data: {
        status: "unknown" as any,
      },
    });

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "running" });

    expect(container.textContent).toContain("Audit status unavailable");
    expect(mockRefresh).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });

  it("updates in-flight state and keeps polling across queued, running, and pending", async () => {
    checkStatus
      .mockResolvedValueOnce({
        success: true,
        data: { status: "running" as any },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { status: "pending" as any },
      })
      .mockImplementationOnce(pendingStatusAction);

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "queued" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Running audit…");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(container.textContent).toContain("Audit pending");
    expect(checkStatus).toHaveBeenCalledTimes(2);
  });

  it("ignores a status action that resolves after the polling deadline", async () => {
    let resolveStatus: ((value: Awaited<ReturnType<typeof actions.checkJobStatusAction>>) => void) | undefined;
    checkStatus.mockImplementationOnce(() => new Promise((resolve) => {
      resolveStatus = resolve;
    }));

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "running" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(container.textContent).toContain("Audit polling timed out");

    await act(async () => {
      resolveStatus?.({
        success: true,
        data: { status: "completed" as any },
      });
      await Promise.resolve();
    });

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Audit polling timed out");
  });

  it("ignores a status action that resolves after unmount", async () => {
    let resolveStatus: ((value: Awaited<ReturnType<typeof actions.checkJobStatusAction>>) => void) | undefined;
    checkStatus.mockImplementationOnce(() => new Promise((resolve) => {
      resolveStatus = resolve;
    }));

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "running" });
    await act(async () => {
      root.unmount();
    });
    mounted = false;

    await act(async () => {
      resolveStatus?.({
        success: true,
        data: { status: "completed" as any },
      });
      await Promise.resolve();
    });

    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("ignores a rejected status action after unmount", async () => {
    let rejectStatus: ((reason?: unknown) => void) | undefined;
    checkStatus.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectStatus = reject;
    }));

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "running" });
    await act(async () => {
      root.unmount();
    });
    mounted = false;

    await act(async () => {
      rejectStatus?.(new Error("late database failure"));
      await Promise.resolve();
    });

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });

  it("enters timeout state after polling reaches the five-minute deadline", async () => {
    checkStatus.mockResolvedValue({
      success: true,
      data: { status: "running" as any },
    });

    await renderPoller(root, { jobId: "00000000-0000-0000-0000-000000000001", initialStatus: "running" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 2_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Audit polling timed out");
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
