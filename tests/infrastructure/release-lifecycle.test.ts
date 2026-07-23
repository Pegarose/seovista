import { createReleaseRunner } from "../../scripts/release.js";

describe("release lifecycle orchestration", () => {
  it("propagates the exact lifecycle context to gates and teardown", async () => {
    const contextPath = "C:\\temporary\\release-context.json";
    const runLifecycle = vi.fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: `lifecycle ready\n${contextPath}\n`, stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });
    const gateEnvironments: string[] = [];
    const runGate = vi.fn().mockImplementation(async (_name: string, _command: string, _timeout: number, context: string) => {
      gateEnvironments.push(context);
      return { gate: "test", exitCode: 0, durationMs: 1, stdout: "", stderr: "", startedAt: "", completedAt: "" };
    });
    const writeReport = vi.fn().mockResolvedValue("report.json");
    const runner = createReleaseRunner({
      gates: [{ name: "test", command: "synthetic", timeout: 1, needsDocker: true }],
      runLifecycle,
      runGate,
      writeReport,
      killChildren: vi.fn().mockResolvedValue(undefined),
      registerSignal: vi.fn(),
      unregisterSignal: vi.fn(),
    });

    const result = await runner.run();

    expect(result.exitCode).toBe(0);
    expect(gateEnvironments).toEqual([contextPath]);
    expect(writeReport).toHaveBeenCalledWith(result.results, result.failedGates);
    expect(runLifecycle.mock.calls.map(([args]) => args)).toEqual([
      ["start", expect.any(String)],
      ["teardown", contextPath],
    ]);
  });

  it("fails closed when lifecycle infrastructure cannot start", async () => {
    const runLifecycle = vi.fn().mockResolvedValue({
      exitCode: 17,
      stdout: "",
      stderr: "compose startup failed",
    });
    const runGate = vi.fn();
    const writeReport = vi.fn().mockResolvedValue("report.json");
    const killChildren = vi.fn().mockResolvedValue(undefined);
    const runner = createReleaseRunner({
      gates: [{ name: "test", command: "synthetic", timeout: 1, needsDocker: true }],
      runLifecycle,
      runGate,
      writeReport,
      killChildren,
      registerSignal: vi.fn().mockReturnValue(() => undefined),
    });

    const result = await runner.run();

    expect(result.exitCode).toBe(1);
    expect(result.failedGates.map(({ gate }) => gate)).toEqual(["infrastructure-start"]);
    expect(runGate).not.toHaveBeenCalled();
    expect(runLifecycle).toHaveBeenCalledTimes(1);
    expect(runLifecycle.mock.calls[0][0][0]).toBe("start");
    expect(runLifecycle.mock.calls.some(([args]) => args[0] === "teardown")).toBe(false);
    expect(writeReport).toHaveBeenCalledWith(result.results, result.failedGates);
    expect(killChildren).toHaveBeenCalledTimes(1);
  });

  it("cleans children before teardown and returns failure on interruption", async () => {
    const contextPath = "C:\\temporary\\interrupt-context.json";
    const operations: string[] = [];
    let releaseGate!: () => void;
    let signalHandler!: () => Promise<unknown>;
    const runLifecycle = vi.fn().mockImplementation(async ([command, value]: string[]) => {
      operations.push(`${command}:${value ?? ""}`);
      return command === "start"
        ? { exitCode: 0, stdout: contextPath, stderr: "" }
        : { exitCode: 0, stdout: "", stderr: "" };
    });
    const runGate = vi.fn().mockImplementation(() => new Promise((resolve) => {
      releaseGate = () => resolve({ gate: "test", exitCode: 0, durationMs: 1, stdout: "", stderr: "", startedAt: "", completedAt: "" });
    }));
    const writeReport = vi.fn().mockResolvedValue("report.json");
    const runner = createReleaseRunner({
      gates: [{ name: "test", command: "synthetic", timeout: 1, needsDocker: true }],
      runLifecycle,
      runGate,
      writeReport,
      killChildren: vi.fn().mockImplementation(async () => {
        operations.push("kill");
        releaseGate();
      }),
      registerSignal: vi.fn().mockImplementation((signal: string, handler: () => Promise<unknown>) => {
        if (signal === "SIGINT") signalHandler = handler;
      }),
      unregisterSignal: vi.fn(),
    });

    const runPromise = runner.run();
    await vi.waitFor(() => expect(runGate).toHaveBeenCalledTimes(1));
    await signalHandler();
    const result = await runPromise;

    expect(result.exitCode).toBe(1);
    expect(operations).toEqual(expect.arrayContaining(["kill", `teardown:${contextPath}`]));
    expect(operations.indexOf("kill")).toBeLessThan(operations.indexOf(`teardown:${contextPath}`));
    expect(result.failedGates).toEqual([]);
    expect(result.results).toHaveLength(1);
    expect(writeReport).toHaveBeenCalledWith(result.results, result.failedGates);
  });

  it("returns failure when teardown fails after all gates pass", async () => {
    const contextPath = "C:\\temporary\\teardown-context.json";
    const runLifecycle = vi.fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: contextPath, stderr: "" })
      .mockResolvedValueOnce({ exitCode: 9, stdout: "", stderr: "teardown failed" });
    const runGate = vi.fn().mockResolvedValue({ gate: "test", exitCode: 0, durationMs: 1, stdout: "", stderr: "", startedAt: "", completedAt: "" });
    const writeReport = vi.fn().mockResolvedValue("report.json");
    const runner = createReleaseRunner({
      gates: [{ name: "test", command: "synthetic", timeout: 1, needsDocker: true }],
      runLifecycle,
      runGate,
      writeReport,
      killChildren: vi.fn().mockResolvedValue(undefined),
      registerSignal: vi.fn(),
      unregisterSignal: vi.fn(),
    });

    const result = await runner.run();

    expect(result.exitCode).toBe(1);
    expect(result.failedGates.map(({ gate }) => gate)).toEqual(["infrastructure-teardown"]);
    expect(result.results.map(({ gate }) => gate)).toEqual(["test", "infrastructure-teardown"]);
    expect(writeReport).toHaveBeenCalledWith(result.results, result.failedGates);
    expect(writeReport).toHaveBeenCalledTimes(1);
    expect(runGate).toHaveBeenCalledTimes(1);
  });
});
