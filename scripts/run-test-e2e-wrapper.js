/* global clearTimeout, console, process, setTimeout */

import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_WORKER_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_WORKER_STOP_TIMEOUT_MS = 10_000;
const closedWorkers = new WeakSet();
const workerStates = new WeakMap();

function trackWorkerLifecycle(worker) {
  const existing = workerStates.get(worker);
  if (existing) return existing;

  const state = { closed: false };
  workerStates.set(worker, state);
  worker.once("close", () => {
    state.closed = true;
    closedWorkers.add(worker);
  });
  return state;
}

function commandFailure(message, status, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  const numericStatus = Number(status);
  error.status = Number.isInteger(numericStatus) && numericStatus > 0 ? numericStatus : 1;
  return error;
}

export function buildWorkerSpawnSpec(platform = process.platform, comSpec = process.env.ComSpec ?? "cmd.exe") {
  if (platform === "win32") {
    return {
      command: comSpec,
      args: ["/d", "/s", "/c", "corepack pnpm --filter @seovista/worker dev"],
      shell: false,
    };
  }

  return {
    command: "corepack",
    args: ["pnpm", "--filter", "@seovista/worker", "dev"],
    shell: false,
  };
}

export function buildWorkerTerminationSpec(platform = process.platform, pid = process.pid) {
  if (platform === "win32" && typeof pid === "number" && pid > 0) {
    return {
      command: "taskkill",
      args: ["/PID", String(pid), "/T", "/F"],
    };
  }

  return null;
}

function defaultSpawnWorker(env) {
  const command = buildWorkerSpawnSpec();
  const options = {
    stdio: ["ignore", "pipe", "pipe"],
    env,
    shell: command.shell,
  };
  if (process.platform !== "win32") {
    // Run the worker as a process-group leader on POSIX so the entire tree
    // (corepack -> pnpm -> node worker) can be signalled together at shutdown.
    options.detached = true;
  }
  return spawn(command.command, command.args, options);
}

function parseWorkerStatus(line) {
  try {
    const payload = JSON.parse(line);
    return payload && typeof payload === "object" && typeof payload.status === "string" ? payload : null;
  } catch {
    return null;
  }
}

export function waitForWorkerReady(worker, options = {}) {
  trackWorkerLifecycle(worker);
  const timeoutMs = options.timeoutMs ?? DEFAULT_WORKER_STARTUP_TIMEOUT_MS;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const forwardOutput = options.forwardOutput ?? true;

  return new Promise((resolve, reject) => {
    let settled = false;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let timer;

    const removeListener = (target, event, listener) => target?.removeListener?.(event, listener);
    const cleanup = () => {
      clearTimeout(timer);
      removeListener(worker.stdout, "data", onStdout);
      removeListener(worker.stderr, "data", onStderr);
      removeListener(worker, "error", onError);
      removeListener(worker, "exit", onExit);
      removeListener(worker, "close", onClose);
    };
    const settleFailure = (message, code, status, cause) => {
      if (settled) return;
      settled = true;
      cleanup();
      const error = commandFailure(message, status, cause);
      error.code = code;
      reject(error);
    };
    const settleSuccess = (payload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };
    const inspectLine = (line) => {
      const payload = parseWorkerStatus(line.trim());
      if (!payload) return;
      if (payload.status === "started") {
        settleSuccess(payload);
      } else if (payload.status === "startup_failed") {
        settleFailure("Worker reported startup_failed", "WORKER_STARTUP_FAILED", 1);
      }
    };
    const inspectChunk = (chunk, source) => {
      const text = chunk.toString();
      if (forwardOutput) {
        try {
          (source === "stdout" ? stdout : stderr).write(text);
        } catch {
          // Logging must not determine worker lifecycle state.
        }
      }
      if (source === "stdout") stdoutBuffer += text;
      else stderrBuffer += text;
      const lines = (source === "stdout" ? stdoutBuffer : stderrBuffer).split(/\r?\n/);
      if (source === "stdout") stdoutBuffer = lines.pop() ?? "";
      else stderrBuffer = lines.pop() ?? "";
      for (const line of lines) inspectLine(line);
    };
    const onStdout = (chunk) => inspectChunk(chunk, "stdout");
    const onStderr = (chunk) => inspectChunk(chunk, "stderr");
    const onError = (error) =>
      settleFailure(`Worker process error: ${error.message}`, "WORKER_PROCESS_ERROR", undefined, error);
    const onExit = (code, signal) => {
      if (!settled) {
        settleFailure(
          `Worker exited before readiness (code=${code ?? "null"}, signal=${signal ?? "none"})`,
          "WORKER_EXITED",
          code,
        );
      }
    };
    const onClose = (code, signal) => {
      if (!settled) {
        settleFailure(
          `Worker closed before readiness (code=${code ?? "null"}, signal=${signal ?? "none"})`,
          "WORKER_CLOSED",
          code,
        );
      }
    };

    timer = setTimeout(
      () => settleFailure(`Worker did not start within ${timeoutMs}ms`, "WORKER_STARTUP_TIMEOUT", 1),
      timeoutMs,
    );
    worker.stdout?.on("data", onStdout);
    worker.stderr?.on("data", onStderr);
    worker.once("error", onError);
    worker.once("exit", onExit);
    worker.once("close", onClose);
  });
}

export function observeWorker(worker, options = {}) {
  trackWorkerLifecycle(worker);
  let failure = null;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const writeOutput = (stream, chunk) => {
    try {
      stream.write(chunk.toString());
    } catch {
      // Logging must not determine worker lifecycle state.
    }
  };
  const onStdout = (chunk) => writeOutput(stdout, chunk);
  const onStderr = (chunk) => writeOutput(stderr, chunk);
  const onError = (error) => {
    failure ??= commandFailure(`Worker process error: ${error.message}`, undefined, error);
  };
  const onExit = (code, signal) => {
    failure ??= code === 0 && signal === null
      ? commandFailure("Worker exited unexpectedly", 1)
      : commandFailure(`Worker exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "none"})`, code);
  };
  const onClose = () => undefined;
  worker.stdout?.on("data", onStdout);
  worker.stderr?.on("data", onStderr);
  worker.once("error", onError);
  worker.once("exit", onExit);
  worker.once("close", onClose);

  return {
    getFailure: () => failure,
    dispose: () => {
      worker.stdout?.removeListener("data", onStdout);
      worker.stderr?.removeListener("data", onStderr);
      worker.removeListener("error", onError);
      worker.removeListener("exit", onExit);
      worker.removeListener("close", onClose);
    },
  };
}

function defaultKillWorkerTree(spec) {
  return spawnSync(spec.command, spec.args, { stdio: "ignore" });
}

function defaultKillProcessGroup(pid) {
  if (typeof pid !== "number" || pid <= 0) return;
  try {
    // A negative PID targets the entire detached process group, so the
    // grandchild worker (not just the corepack shim) receives the signal.
    process.kill(-pid, "SIGTERM");
  } catch {
    // Best-effort: the process group may already be gone.
  }
}

export function stopWorker(worker, options = {}) {
  const state = trackWorkerLifecycle(worker);
  const timeoutMs = options.timeoutMs ?? DEFAULT_WORKER_STOP_TIMEOUT_MS;
  const platform = options.platform ?? process.platform;
  const killTree = options.killWorkerTree ?? defaultKillWorkerTree;
  const killProcessGroup = options.killProcessGroup ?? defaultKillProcessGroup;
  if (state.closed || closedWorkers.has(worker)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeListener("error", onError);
      worker.removeListener("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => finish(error);
    const onClose = (code, signal) => {
      if (code !== 0 && code !== null && signal === null) {
        finish(commandFailure(`Worker stop failed with exit code ${code}`, code));
      } else {
        finish();
      }
    };

    timer = setTimeout(() => finish(new Error(`Worker did not stop within ${timeoutMs}ms`)), timeoutMs);
    worker.once("error", onError);
    worker.once("close", onClose);
    try {
      const terminationSpec = buildWorkerTerminationSpec(platform, worker.pid);
      if (terminationSpec) {
        killTree(terminationSpec);
      } else {
        worker.kill();
        if (platform !== "win32") {
          // POSIX: also signal the whole detached process group so the
          // grandchild worker shuts down and the job is not held open until
          // the CI timeout.
          killProcessGroup(worker.pid);
        }
      }
    } catch (error) {
      finish(error);
    }
  });
}

function defaultStartInfrastructure() {
  return spawnSync("node", ["scripts/infrastructure-lifecycle.js", "start", "test-wrapper"], {
    encoding: "utf-8",
  });
}

function defaultProvisionDatabase(env) {
  execSync("node scripts/infrastructure-migrate-test-db.js", { stdio: "inherit", env });
}

function defaultRunPlaywright(env) {
  execSync("corepack pnpm run --filter @seovista/web --if-present test:e2e", { stdio: "inherit", env });
}

function defaultTeardownLifecycle(contextPath) {
  execSync(`node scripts/infrastructure-lifecycle.js teardown ${contextPath}`, { stdio: "inherit" });
}

function errorStatus(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status > 0 ? status : 1;
}

export async function runE2E(options = {}) {
  const logger = options.logger ?? console;
  const startInfrastructure = options.startInfrastructure ?? defaultStartInfrastructure;
  const provisionDatabase = options.provisionDatabase ?? defaultProvisionDatabase;
  const spawnWorker = options.spawnWorker ?? defaultSpawnWorker;
  const waitForReady = options.waitForWorkerReady ?? ((w, o) => waitForWorkerReady(w, o));
  const observe = options.observeWorker ?? ((w, o) => observeWorker(w, o));
  const stop = options.stopWorker ?? ((w, o) => stopWorker(w, o));
  const runPlaywright = options.runPlaywright ?? defaultRunPlaywright;
  const teardownLifecycle = options.teardownLifecycle ?? defaultTeardownLifecycle;
  const contextExists = options.contextExists ?? existsSync;
  const readContext = options.readContext ?? ((contextPath) => JSON.parse(readFileSync(contextPath, "utf-8")));
  let contextPath = "";
  let worker;
  let workerObservation;
  let primaryError;
  let teardownError;

  try {
    logger.log("Starting test-wrapper lifecycle...");
    const startProc = startInfrastructure();
    if (startProc.status !== 0) {
      throw commandFailure("Failed to start infrastructure", startProc.status, startProc.stderr);
    }

    contextPath = startProc.stdout.trim();
    if (!contextPath || !contextExists(contextPath)) {
      throw commandFailure(`Could not determine context path: ${contextPath}`);
    }
    logger.log(`Lifecycle started. Context saved to ${contextPath}`);

    const activeContextObj = readContext(contextPath);
    const activeContext = activeContextObj.context || activeContextObj;
    const postgresPort = activeContext.hostPorts ? activeContext.hostPorts.postgres : activeContext.postgresPort;
    const redisPort = activeContext.hostPorts ? activeContext.hostPorts.redis : activeContext.redisPort;
    const env = {
      ...process.env,
      ...(options.env ?? {}),
      SEOVISTA_LIFECYCLE_CONTEXT_PATH: contextPath,
      DATABASE_URL: `postgres://seovista:seovista@127.0.0.1:${postgresPort}/${activeContext.databaseName}`,
      REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
      SEOVISTA_PROJECT_ID: activeContext.projectId,
      SEOVISTA_QUEUE_PREFIX: activeContext.queuePrefix,
    };

    logger.log("Provisioning database instance...");
    await provisionDatabase(env);
    logger.log("Starting worker node in background...");
    worker = spawnWorker(env);
    workerObservation = observe(worker, { stdout: process.stdout, stderr: process.stderr });
    logger.log("Waiting for worker boot...");
    await waitForReady(worker, {
      stdout: process.stdout,
      stderr: process.stderr,
      forwardOutput: false,
      timeoutMs: options.workerStartupTimeoutMs,
    });
    if (workerObservation.getFailure()) throw workerObservation.getFailure();

    logger.log("Running Playwright Tests...");
    await runPlaywright(env);
    if (workerObservation.getFailure()) throw workerObservation.getFailure();
  } catch (error) {
    primaryError = error;
    logger.error("Test execution failed:", error);
  } finally {
    if (worker) {
      logger.log("Shutting down worker process...");
      try {
        await stop(worker, { timeoutMs: options.workerStopTimeoutMs });
      } catch (error) {
        logger.error("Failed to stop worker process:", error);
        primaryError ??= error;
      }
      workerObservation?.dispose();
    }

    if (contextPath) {
      logger.log("Tearing down test-wrapper lifecycle...");
      try {
        await teardownLifecycle(contextPath);
      } catch (error) {
        teardownError = error;
        logger.error("Failed to teardown infrastructure:", error);
        primaryError ??= error;
      }
    }
  }

  return {
    contextPath,
    exitCode: primaryError ? errorStatus(primaryError) : 0,
    error: primaryError,
    teardownError,
  };
}

export async function main(options = {}) {
  const result = await runE2E(options);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error("E2E wrapper failed:", error);
    process.exitCode = errorStatus(error);
  });
}
