/**
 * Focused regression tests for dockerComposeUp and extractErrorOutput.
 *
 * Covers the five required scenarios through injectable exec/sleep
 * dependencies without touching real Docker.
 */

import { describe, it, expect, vi } from "vitest";
import { dockerComposeUp, extractErrorOutput, type ExecFn, type SleepFn } from "./test-env.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cast Error to a mutable record so we can attach stdout/stderr. */
function attachExecOutput(err: Error, stderr: string, stdout = ""): void {
  const rec = err as unknown as Record<string, unknown>;
  rec.stderr = Buffer.from(stderr);
  rec.stdout = Buffer.from(stdout);
  rec.status = 1;
}

/** Create a mock exec that fails with the given output on each call. */
function execThatFails(output: string): ExecFn {
  return vi.fn(() => {
    const err = new Error("Command failed: docker compose up -d postgres redis");
    attachExecOutput(err, output);
    throw err;
  });
}

/** Create a mock exec that succeeds. */
function execThatSucceeds(): ExecFn {
  return vi.fn(() => {
    // success – no throw
  });
}

/** Create a mock exec that fails with the specified outputs in sequence. */
function execSequence(
  outputs: Array<{ type: "success" } | { type: "failure"; stderr: string }>
): ExecFn {
  let callCount = 0;
  return vi.fn(() => {
    const item = outputs[callCount++];
    if (!item) {
      throw new Error("exec called more times than expected");
    }
    if (item.type === "success") {
      return;
    }
    const err = new Error("Command failed: docker compose up -d postgres redis");
    attachExecOutput(err, item.stderr);
    throw err;
  });
}

/** Deterministic sleep that records calls. */
function recordingSleep(): { sleep: SleepFn; calls: number[] } {
  const calls: number[] = [];
  const sleep: SleepFn = vi.fn((ms: number) => {
    calls.push(ms);
    return Promise.resolve();
  });
  return { sleep, calls };
}

// ---------------------------------------------------------------------------
// Container-name conflict error strings
// ---------------------------------------------------------------------------

/** Realistic Docker error for the known container-name creation race. */
const CONFLICT_STDERR =
  'Conflict. The container name "/seovista-postgres" is already in use ' +
  'by container "a1b2c3d4e5f6". You have to remove (or rename) that container ' +
  "to be able to reuse that name.";

/** Unrelated Docker error (port conflict). */
const PORT_CONFLICT_STDERR =
  "Error response from daemon: Ports are not available: exposing port TCP " +
  "0.0.0.0:55432 -> 0.0.0.0:0: listen tcp 0.0.0.0:55432: bind: An attempt " +
  "was made to access a socket in a way forbidden by its access permissions.";

/** Unrelated Docker error (generic). */
const GENERIC_DOCKER_ERROR_STDERR =
  "Error response from daemon: Cannot connect to the Docker daemon at " +
  "unix:///var/run/docker.sock. Is the docker daemon running?";

/** Error that contains "Conflict" but is NOT the container name race. */
const NETWORK_CONFLICT_STDERR = 'Conflict. The network "seovista_default" was not found.';

/** Error containing "already in use" but not about containers. */
const VOLUME_IN_USE_STDERR =
  'Error response from daemon: volume "seovista_postgres_data" already in use';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dockerComposeUp", () => {
  it("succeeds immediately when exec passes on first try", async () => {
    const exec = execThatSucceeds();
    const { sleep, calls } = recordingSleep();

    await dockerComposeUp({ exec, sleep });

    expect(exec).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0); // no sleep needed
  });

  it("retries and succeeds after a single container-name conflict", async () => {
    const exec = execSequence([{ type: "failure", stderr: CONFLICT_STDERR }, { type: "success" }]);
    const { sleep, calls } = recordingSleep();

    await dockerComposeUp({ exec, sleep });

    expect(exec).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([200]); // linear backoff: 200ms first retry
  });

  it("retries and succeeds after two container-name conflicts", async () => {
    const exec = execSequence([
      { type: "failure", stderr: CONFLICT_STDERR },
      { type: "failure", stderr: CONFLICT_STDERR },
      { type: "success" },
    ]);
    const { sleep, calls } = recordingSleep();

    await dockerComposeUp({ exec, sleep });

    expect(exec).toHaveBeenCalledTimes(3);
    expect(calls).toEqual([200, 400]); // linear backoff
  });

  it("fails immediately on unrelated Docker error without retry", async () => {
    const exec = execThatFails(PORT_CONFLICT_STDERR);
    const { sleep, calls } = recordingSleep();

    await expect(dockerComposeUp({ exec, sleep })).rejects.toThrow();
    expect(exec).toHaveBeenCalledTimes(1); // no retry
    expect(calls).toHaveLength(0);
  });

  it("fails immediately on generic Docker daemon error", async () => {
    const exec = execSequence([
      { type: "failure", stderr: GENERIC_DOCKER_ERROR_STDERR },
      { type: "success" }, // should never be reached
    ]);
    const { sleep } = recordingSleep();

    await expect(dockerComposeUp({ exec, sleep })).rejects.toThrow();
    expect(exec).toHaveBeenCalledTimes(1); // no retry
  });

  it("does not retry on network conflict (not a container name race)", async () => {
    const exec = execSequence([
      { type: "failure", stderr: NETWORK_CONFLICT_STDERR },
      { type: "success" },
    ]);
    const { sleep } = recordingSleep();

    await expect(dockerComposeUp({ exec, sleep })).rejects.toThrow();
    expect(exec).toHaveBeenCalledTimes(1); // no retry — not container name conflict
  });

  it("does not retry on volume already-in-use error", async () => {
    const exec = execSequence([
      { type: "failure", stderr: VOLUME_IN_USE_STDERR },
      { type: "success" },
    ]);
    const { sleep } = recordingSleep();

    await expect(dockerComposeUp({ exec, sleep })).rejects.toThrow();
    expect(exec).toHaveBeenCalledTimes(1); // no retry — wrong kind of "in use"
  });

  it("throws after exhausting all retries on repeated container-name conflict", async () => {
    const exec = execSequence([
      { type: "failure", stderr: CONFLICT_STDERR },
      { type: "failure", stderr: CONFLICT_STDERR },
      { type: "failure", stderr: CONFLICT_STDERR },
      { type: "failure", stderr: CONFLICT_STDERR }, // attempt 3 = last retry (maxRetries=3)
    ]);
    const { sleep, calls } = recordingSleep();

    await expect(dockerComposeUp({ exec, sleep })).rejects.toThrow();
    expect(exec).toHaveBeenCalledTimes(4); // 0+retries, where retries=3
    expect(calls).toEqual([200, 400, 600]); // all three retries
  });

  it("respects custom maxRetries and baseDelayMs", async () => {
    const exec = execSequence([
      { type: "failure", stderr: CONFLICT_STDERR },
      { type: "failure", stderr: CONFLICT_STDERR },
      { type: "success" },
    ]);
    const { sleep, calls } = recordingSleep();

    await dockerComposeUp({ exec, sleep, maxRetries: 2, baseDelayMs: 100 });

    expect(exec).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(calls).toEqual([100, 200]);
  });

  it("throws the original error object on non-retryable failure", async () => {
    const originalError = new Error("docker: command not found");
    const exec = vi.fn(() => {
      throw originalError;
    });
    const { sleep } = recordingSleep();

    await expect(dockerComposeUp({ exec, sleep })).rejects.toBe(originalError);
  });

  it("throws the original error object after retry exhaustion", async () => {
    const originalError = new Error("Command failed: docker compose up -d postgres redis");
    attachExecOutput(originalError, CONFLICT_STDERR);
    const exec = vi.fn(() => {
      throw originalError;
    });
    const { sleep } = recordingSleep();

    await expect(dockerComposeUp({ exec, sleep, maxRetries: 1 })).rejects.toBe(originalError);
    expect(exec).toHaveBeenCalledTimes(2); // initial + 1 retry
  });
});

describe("extractErrorOutput", () => {
  it("extracts message from a plain Error", () => {
    const err = new Error("something went wrong");
    const output = extractErrorOutput(err);
    expect(output).toContain("something went wrong");
  });

  it("extracts stderr from an execSync-style error", () => {
    const err = new Error("Command failed: docker compose up -d");
    attachExecOutput(err, "stderr line 1\nstderr line 2");
    const output = extractErrorOutput(err);
    expect(output).toContain("Command failed");
    expect(output).toContain("stderr line 1");
    expect(output).toContain("stderr line 2");
  });

  it("extracts stdout from an execSync-style error", () => {
    const err = new Error("Command failed");
    attachExecOutput(err, "", "stdout info");
    const output = extractErrorOutput(err);
    expect(output).toContain("stdout info");
  });

  it("handles non-Error throws gracefully", () => {
    expect(extractErrorOutput("plain string")).toBe("plain string");
    expect(extractErrorOutput(42)).toBe("42");
    expect(extractErrorOutput(null)).toBe("null");
    expect(extractErrorOutput(undefined)).toBe("undefined");
  });

  it("distinguishes container name conflict from unrelated errors", () => {
    const conflictErr = new Error("fail");
    attachExecOutput(conflictErr, CONFLICT_STDERR);
    const portErr = new Error("fail");
    attachExecOutput(portErr, PORT_CONFLICT_STDERR);

    const conflictOutput = extractErrorOutput(conflictErr);
    const portOutput = extractErrorOutput(portErr);

    // Only the container name conflict should match the known pattern
    expect(conflictOutput).toMatch(/is already in use by container/);
    expect(portOutput).not.toMatch(/is already in use by container/);
  });
});
