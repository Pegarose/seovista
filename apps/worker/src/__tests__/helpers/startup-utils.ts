/**
 * Worker startup diagnostics utilities.
 *
 * Provides robust worker-process lifecycle management for integration tests:
 * - Handles split readiness JSON across stdout chunks
 * - Handles child error/exit/close before readiness
 * - Recognizes structured startup_failed across stream chunks
 * - Enforces bounded output with secret redaction
 * - Ensures timer and listener cleanup on every settlement path
 * - Supports partial teardown after startup failures
 */

import { type ChildProcess } from "node:child_process";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of output bytes to buffer before truncation. */
const MAX_OUTPUT_BYTES = 64_000;

/** Patterns that indicate secrets in output and must be redacted. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/postgresql:\/\/[^\s"'}\]]+/gi, "[REDACTED_DATABASE_URL]"],
  [/redis:\/\/[^\s"'}\]]+/gi, "[REDACTED_REDIS_URL]"],
  [/DATABASE_URL[=:]\s*["']?[^\s"',}\]]+/gi, "[REDACTED_DATABASE_URL]"],
  [/REDIS_URL[=:]\s*["']?[^\s"',}\]]+/gi, "[REDACTED_REDIS_URL]"],
  [/api[_-]?key[=:]\s*["']?[^\s"',}\]]+/gi, "[REDACTED_API_KEY]"],
  [/token[=:]\s*["']?[^\s"',}\]]+/gi, "[REDACTED_TOKEN]"],
  [/secret[=:]\s*["']?[^\s"',}\]]+/gi, "[REDACTED_SECRET]"],
  [/password[=:]\s*["']?[^\s"',}\]]+/gi, "[REDACTED_PASSWORD]"],
  [/credential[=:]\s*["']?[^\s"',}\]]+/gi, "[REDACTED_CREDENTIAL]"],
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "[REDACTED_BEARER_TOKEN]"],
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkerReadyResult {
  /** Whether the worker emitted the structured started event. */
  started: boolean;
  /** The parsed started JSON payload if available. */
  startedPayload: Record<string, unknown> | null;
  /** Bounded, redacted combined stdout + stderr. */
  output: string;
  /** Exit code (null if process is still running). */
  exitCode: number | null;
  /** Signal that terminated the process (null if exited normally or still running). */
  signal: NodeJS.Signals | null;
}

export interface WorkerReadyOptions {
  /** Timeout in milliseconds (default 30_000). */
  timeoutMs?: number;
  /** Whether to also collect startup_failed payloads (default true). */
  captureFailed?: boolean;
}

export interface WorkerFailedResult {
  /** The parsed startup_failed JSON payload if available. */
  failedPayload: Record<string, unknown> | null;
  /** Whether the process exited before readiness. */
  exited: boolean;
  /** Exit code (null if process is still running). */
  exitCode: number | null;
  /** Signal that terminated the process. */
  signal: NodeJS.Signals | null;
  /** Bounded, redacted combined stdout + stderr. */
  output: string;
}

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

/**
 * Redact known secret patterns from output text.
 * Returns the redacted text.
 */
export function redactSecrets(text: string): string {
  let redacted = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

// ---------------------------------------------------------------------------
// Output buffering
// ---------------------------------------------------------------------------

/**
 * Bounded output collector that truncates at MAX_OUTPUT_BYTES.
 */
class OutputBuffer {
  private buffer = "";
  private truncated = false;

  append(chunk: string): void {
    if (this.truncated) return;
    this.buffer += chunk;
    if (this.buffer.length > MAX_OUTPUT_BYTES) {
      this.buffer = this.buffer.slice(0, MAX_OUTPUT_BYTES);
      this.truncated = true;
    }
  }

  toString(): string {
    let result = this.buffer;
    if (this.truncated) {
      result += "\n[OUTPUT TRUNCATED]";
    }
    return redactSecrets(result);
  }
}

// ---------------------------------------------------------------------------
// Worker readiness waiting
// ---------------------------------------------------------------------------

/**
 * Wait for the worker process to emit a structured started event.
 *
 * Handles:
 * - Split JSON across stdout chunks (buffers lines and tries to parse JSON)
 * - Child process error, exit, or close before readiness (rejects immediately)
 * - Structured startup_failed recognition across stream chunks
 * - Timer and listener cleanup on every settlement path
 * - Bounded output with secret redaction
 */
export function waitForWorkerReady(
  process: ChildProcess,
  options: WorkerReadyOptions = {}
): Promise<WorkerReadyResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const captureFailed = options.captureFailed ?? true;

  return new Promise<WorkerReadyResult>((resolve, reject) => {
    const output = new OutputBuffer();
    let settled = false;

    // ---- Timer ----
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();

      reject(
        Object.assign(
          new Error(
            `Worker did not start within ${timeoutMs}ms timeout`
          ),
          {
            code: "WORKER_STARTUP_TIMEOUT",
            output: output.toString(),
            exitCode: process.exitCode,
            signal: process.signalCode,
          }
        )
      );
    }, timeoutMs);

    // ---- Cleanup helpers ----
    function cleanup(): void {
      clearTimeout(timer);
      process.stdout?.removeAllListeners("data");
      process.stderr?.removeAllListeners("data");
      process.removeAllListeners("error");
      process.removeAllListeners("exit");
      process.removeAllListeners("close");
    }

    function settleSuccess(payload: Record<string, unknown> | null): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        started: true,
        startedPayload: payload,
        output: output.toString(),
        exitCode: process.exitCode ?? null,
        signal: (process.signalCode as NodeJS.Signals) ?? null,
      });
    }

    function settleFailure(reason: string, extra?: Record<string, unknown>): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        Object.assign(new Error(reason), {
          code: "WORKER_STARTUP_FAILED",
          output: output.toString(),
          exitCode: process.exitCode ?? null,
          signal: (process.signalCode as NodeJS.Signals) ?? null,
          ...extra,
        })
      );
    }

    // ---- stdout: look for JSON lines containing "started" or "startup_failed" ----
    let stdoutBuffer = "";

    function onStdout(data: Buffer): void {
      const text = data.toString();
      output.append(text);
      stdoutBuffer += text;

      // Try to extract complete JSON lines
      const lines = stdoutBuffer.split("\n");
      // Keep the last (possibly incomplete) line in the buffer
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.includes('"status":"started"') || trimmed.includes('"status": "started"')) {
          try {
            const payload = JSON.parse(trimmed) as Record<string, unknown>;
            settleSuccess(payload);
            return;
          } catch {
            // Partial/not JSON yet — continue buffering
            stdoutBuffer = trimmed + "\n" + stdoutBuffer;
          }
        }

        if (captureFailed && (trimmed.includes("startup_failed") || trimmed.includes('"status":"startup_failed"'))) {
          try {
            const payload = JSON.parse(trimmed) as Record<string, unknown>;
            settleFailure("Worker reported startup_failed", { failedPayload: payload });
            return;
          } catch {
            // Keep buffering
            stdoutBuffer = trimmed + "\n" + stdoutBuffer;
          }
        }
      }
    }

    // ---- stderr: buffer and look for startup_failed ----
    let stderrBuffer = "";

    function onStderr(data: Buffer): void {
      const text = data.toString();
      output.append(text);
      stderrBuffer += text;

      // Try to extract complete JSON lines
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (captureFailed && (trimmed.includes("startup_failed") || trimmed.includes('"status":"startup_failed"'))) {
          try {
            const payload = JSON.parse(trimmed) as Record<string, unknown>;
            settleFailure("Worker reported startup_failed on stderr", { failedPayload: payload });
            return;
          } catch {
            stderrBuffer = trimmed + "\n" + stderrBuffer;
          }
        }

        // If stderr contains a readiness-not-ready message, treat as failure
        if (trimmed.includes('"readiness":"not_ready"') || trimmed.includes('"readiness": "not_ready"')) {
          try {
            const payload = JSON.parse(trimmed) as Record<string, unknown>;
            settleFailure("Worker reported not_ready on stderr", { failedPayload: payload });
            return;
          } catch {
            stderrBuffer = trimmed + "\n" + stderrBuffer;
          }
        }
      }
    }

    // ---- process events ----
    function onError(err: Error): void {
      output.append(`[process error: ${err.message}]`);
      settleFailure(`Worker process error: ${err.message}`, {
        processError: err.message,
      });
    }

    function onExit(code: number | null, signal: NodeJS.Signals | null): void {
      output.append(`[process exited with code ${code}, signal ${signal}]`);
      if (!settled) {
        settleFailure(
          `Worker exited before readiness (code=${code}, signal=${signal})`,
          { exitCode: code, signal }
        );
      }
    }

    function onClose(code: number | null, signal: NodeJS.Signals | null): void {
      output.append(`[process closed with code ${code}, signal ${signal}]`);
      if (!settled) {
        settleFailure(
          `Worker closed before readiness (code=${code}, signal=${signal})`,
          { exitCode: code, signal }
        );
      }
    }

    // ---- attach listeners ----
    process.stdout?.on("data", onStdout);
    process.stderr?.on("data", onStderr);
    process.on("error", onError);
    process.on("exit", onExit);
    process.on("close", onClose);

    // Handle case where process already exited
    if (process.exitCode !== null || process.killed) {
      settleFailure(
        `Worker already exited (code=${process.exitCode}, killed=${process.killed})`,
        { exitCode: process.exitCode }
      );
    }
  });
}

/**
 * Wait for a worker process to exit with a non-zero code,
 * collecting bounded redacted output.
 */
export function waitForWorkerExit(
  process: ChildProcess,
  timeoutMs = 10_000
): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; output: string }> {
  return new Promise((resolve, reject) => {
    const output = new OutputBuffer();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      // Kill the process if still running
      if (!process.killed) {
        process.kill("SIGKILL");
      }
      reject(new Error("Worker did not exit within timeout"));
    }, timeoutMs);

    function cleanup(): void {
      clearTimeout(timer);
      process.stdout?.removeAllListeners("data");
      process.stderr?.removeAllListeners("data");
      process.removeAllListeners("error");
      process.removeAllListeners("exit");
      process.removeAllListeners("close");
    }

    process.stdout?.on("data", (data: Buffer) => output.append(data.toString()));
    process.stderr?.on("data", (data: Buffer) => output.append(data.toString()));

    process.on("error", (err: Error) => {
      output.append(`[process error: ${err.message}]`);
    });

    process.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ exitCode: code, signal, output: output.toString() });
    });

    process.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ exitCode: code, signal, output: output.toString() });
    });

    // Already exited
    if (process.exitCode !== null || process.killed) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        exitCode: process.exitCode ?? null,
        signal: (process.signalCode as NodeJS.Signals) ?? null,
        output: output.toString(),
      });
    }
  });
}
