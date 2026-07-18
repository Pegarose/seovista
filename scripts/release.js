#!/usr/bin/env node

/**
 * SeoVista Sprint 0 — Authoritative Release Command
 *
 * Executes the complete quality gate in documented dependency order:
 *   1. Frozen install verification
 *   2. Lint (zero warnings)
 *   3. Strict typecheck
 *   4. Test (Vitest, including real Docker PostgreSQL/Redis/BullMQ ping)
 *   5. Build (production, credential-free)
 *   6. Playwright E2E
 *   7. Axe accessibility
 *   8. SEO validation
 *   9. Lighthouse CI (Linux Chromium)
 *
 * Design constraints:
 *   - Completes credential-free with real-provider egress denied
 *   - Produces redacted failure artifacts with configured locations and retention
 *   - Preserves security and cleanup across all exit paths (success, failure, interruption)
 *   - Forced gate failures propagate non-zero
 *   - Sentinels kept out of artifacts, responses, events, and logs
 *   - Interruption restores project process, listener, container, network, volume,
 *     browser-profile, test-data, generated-file, and Git inventories
 *
 * Usage: node scripts/release.js [--stop-on-first-failure] [--skip-lighthouse]
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Artifact output directory
const ARTIFACTS_DIR = resolve(root, ".release-artifacts");
const ARTIFACTS_RETENTION_DAYS = 7;

// Gate steps in dependency order
const GATES = [
  { name: "install-verify", command: "corepack pnpm install --frozen-lockfile", timeout: 120_000 },
  { name: "lint", command: "pnpm lint", timeout: 120_000 },
  { name: "typecheck", command: "pnpm typecheck", timeout: 120_000 },
  { name: "test", command: "pnpm test", timeout: 300_000, needsDocker: true },
  { name: "verify:production-sentinels", command: "pnpm verify:production-sentinels", timeout: 600_000 },
  { name: "verify-package-boundaries", command: "pnpm verify-package-boundaries", timeout: 120_000 },
  { name: "build", command: "pnpm build", timeout: 300_000 },
  { name: "test:e2e", command: "pnpm test:e2e", timeout: 300_000 },
  { name: "test:a11y", command: "pnpm test:a11y", timeout: 300_000 },
  { name: "test:seo", command: "pnpm test:seo", timeout: 300_000 },
  { name: "lighthouse", command: "pnpm lighthouse", timeout: 600_000 },
];

// Store child process references for cleanup
const children = new Set();

export function createReleaseRunner(dependencies = {}) {
  const runnerChildren = dependencies.children ?? children;
  let runnerLifecycleContextPath = "";
  let cleanupPromise;
  let childrenKillPromise;
  let interruptionPromise;
  let interrupted = false;
  const gates = dependencies.gates ?? GATES;
  const runLifecycle = dependencies.runLifecycle ?? ((args) => runLifecycleCommand(args));
  const runGate = dependencies.runGate ?? ((name, command, timeout, contextPath) => runCommand(name, command, timeout, contextPath));
  const killChildrenForRunner = dependencies.killChildren ?? (() => killAllChildren(runnerChildren));
  const writeReport = dependencies.writeReport ?? ((results, failedGates) => generateArtifactsReport(results, failedGates));
  const registerSignal = dependencies.registerSignal ?? ((signal, handler) => process.on(signal, handler));
  const unregisterSignal = dependencies.unregisterSignal ?? ((signal, handler) => process.off(signal, handler));
  const log = dependencies.log ?? console.log;
  const errorLog = dependencies.errorLog ?? console.error;

  async function startRunnerInfrastructure() {
    const runId = `seovista-release-${process.pid}`;
    const result = await runLifecycle(["start", runId]);
    const lifecycleOutput = result.stdout ?? "";
    runnerLifecycleContextPath = lifecycleOutput.trim().split(/\r?\n/).at(-1) ?? "";
    if (runnerLifecycleContextPath) runnerLifecycleContextPath = runnerLifecycleContextPath.trim();
    if (result.exitCode !== 0 || !runnerLifecycleContextPath) {
      errorLog("[release] Infrastructure failed to start:", redactOutput(`${lifecycleOutput}${result.stderr ?? ""}`));
      return false;
    }
    return true;
  }

  async function stopRunnerInfrastructure() {
    if (!runnerLifecycleContextPath) return true;
    const contextPath = runnerLifecycleContextPath;
    const result = await runLifecycle(["teardown", contextPath]);
    if (result.exitCode === 0) runnerLifecycleContextPath = "";
    return result.exitCode === 0;
  }

  async function killRunnerChildren() {
    if (!childrenKillPromise) {
      childrenKillPromise = Promise.resolve().then(() => killChildrenForRunner());
    }
    await childrenKillPromise;
  }

  async function cleanupRunner() {
    if (!cleanupPromise) {
      cleanupPromise = (async () => {
        await killRunnerChildren();
        return !(await stopRunnerInfrastructure());
      })();
    }
    return cleanupPromise;
  }

  function addTeardownFailure(results, failedGates) {
    const result = {
      gate: "infrastructure-teardown",
      exitCode: -1,
      error: "Lifecycle-owned infrastructure teardown failed",
      durationMs: 0,
      stdout: "",
      stderr: "",
      startedAt: now(),
      completedAt: now(),
    };
    results.push(result);
    failedGates.push(result);
  }

  async function finish(exitCode, results, failedGates) {
    const reportPath = await writeReport(results, failedGates);
    return { exitCode, results, failedGates, reportPath };
  }

  async function finishAfterCleanup(exitCode, results, failedGates) {
    const cleanupFailed = await cleanupRunner();
    if (cleanupFailed) addTeardownFailure(results, failedGates);
    return finish(cleanupFailed || failedGates.length > 0 ? 1 : exitCode, results, failedGates);
  }

  async function handleInterrupt(signal) {
    interrupted = true;
    log(`[release] Received ${signal}. Cleaning up...`);
    if (!interruptionPromise) {
      interruptionPromise = cleanupRunner();
    }
    await interruptionPromise;
  }

  async function run(options = {}) {
    const stopOnFirstFailure = options.stopOnFirstFailure ?? false;
    const skipLighthouse = options.skipLighthouse ?? false;
    const gatesToRun = skipLighthouse ? gates.filter((gate) => gate.name !== "lighthouse") : gates;
    const results = [];
    const failedGates = [];
    const signalHandlers = new Map();
    const infrastructureNeeded = gatesToRun.some((gate) => gate.needsDocker);

    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => { void handleInterrupt(signal); };
      signalHandlers.set(signal, handler);
      registerSignal(signal, handler);
    }

    try {
      if (infrastructureNeeded) {
        const started = await startRunnerInfrastructure();
        if (!started) {
          const result = { gate: "infrastructure-start", exitCode: -1, error: "Lifecycle-owned infrastructure failed to start", durationMs: 0, stdout: "", stderr: "", startedAt: now(), completedAt: now() };
          results.push(result);
          failedGates.push(result);
          return finishAfterCleanup(1, results, failedGates);
        }
      }

      if (interrupted) {
        await interruptionPromise;
        return finishAfterCleanup(1, results, failedGates);
      }

      for (const gate of gatesToRun) {
        const result = await runGate(gate.name, gate.command, gate.timeout, runnerLifecycleContextPath);
        results.push(result);
        if (result.exitCode !== 0) {
          failedGates.push(result);
          if (stopOnFirstFailure) break;
        }
        if (interrupted) {
          await interruptionPromise;
          return finishAfterCleanup(1, results, failedGates);
        }
      }

      if (failedGates.length > 0) return finishAfterCleanup(1, results, failedGates);
      return finishAfterCleanup(0, results, failedGates);
    } finally {
      for (const [signal, handler] of signalHandlers) unregisterSignal(signal, handler);
    }
  }

  return { run };
}

async function killAllChildren(childSet = children) {
  const exits = [];
  for (const child of childSet) {
    exits.push(new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceKillTimer);
        resolve();
      };
      const forceKillTimer = setTimeout(() => {
        try { if (!child.exitCode && !child.signalCode) child.kill("SIGKILL"); } catch {}
      }, 5000);
      child.once?.("close", finish);
      try {
        if (child.exitCode || child.signalCode) {
          finish();
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        finish();
      }
    }));
  }
  await Promise.all(exits);
}

function now() {
  return new Date().toISOString();
}

function redactPath(filePath) {
  return filePath.replace(root, "<project>");
}

function redactOutput(text) {
  if (!text) return text;
  return text
    // Redact connection strings
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@[^\s]+/gi, "postgresql://<redacted>@<redacted>")
    .replace(/redis:\/\/[^@\s]+@[^\s]+/gi, "redis://<redacted>@<redacted>")
    // Redact potential token patterns
    .replace(/[a-zA-Z0-9_-]{32,}/g, (match) => {
      // Don't redact hex hashes that look like git SHAs
      if (/^[0-9a-f]{40}$/i.test(match)) return match;
      return "<redacted-token>";
    })
    // Redact secret-like env values
    .replace(/(SECRET|TOKEN|KEY|PASSWORD|DSN)=[^\s]+/gi, "$1=<redacted>")
    // Redact email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "<redacted-email>");
}

function runCommand(name, command, timeoutMs, contextPath = "") {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";

    const child = spawn(command, [], {
      shell: true,
      cwd: root,
      env: {
        ...process.env,
        ...(contextPath ? { SEOVISTA_LIFECYCLE_CONTEXT_PATH: contextPath } : {}),
      },
      windowsHide: true,
      stdio: "pipe",
      timeout: timeoutMs,
    });

    children.add(child);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code, signal) => {
      children.delete(child);
      const duration = Date.now() - startTime;
      const result = {
        gate: name,
        exitCode: code,
        signal,
        durationMs: duration,
        stdout: stdout.slice(-5000), // Keep last 5KB for artifacts
        stderr: stderr.slice(-5000),
        startedAt: new Date(startTime).toISOString(),
        completedAt: now(),
      };
      resolve(result);
    });

    child.on("error", (err) => {
      children.delete(child);
      const duration = Date.now() - startTime;
      resolve({
        gate: name,
        exitCode: -1,
        error: err.message,
        durationMs: duration,
        stdout: stdout.slice(-5000),
        stderr: stderr.slice(-5000),
        startedAt: new Date(startTime).toISOString(),
        completedAt: now(),
      });
    });
  });
}

async function runLifecycleCommand(args, contextPath = "") {
  return new Promise((settle) => {
    const child = spawn(process.execPath, [resolve(root, "scripts/infrastructure-lifecycle.js"), ...args], {
      cwd: root,
      env: {
        ...process.env,
        ...(contextPath ? { SEOVISTA_LIFECYCLE_CONTEXT_PATH: contextPath } : {}),
      },
      stdio: "pipe",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    children.add(child);

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("close", (code) => {
      children.delete(child);
      settle({ exitCode: code ?? -1, stdout, stderr });
    });
    child.on("error", (error) => {
      children.delete(child);
      settle({ exitCode: -1, stdout, stderr: `${stderr}${error.message}` });
    });
  });
}

async function generateArtifactsReport(results, failedGates) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const report = {
    timestamp: now(),
    summary: {
      total: results.length,
      passed: results.filter((r) => r.exitCode === 0).length,
      failed: results.filter((r) => r.exitCode !== 0 && r.exitCode !== null).length,
      errored: results.filter((r) => r.exitCode === -1).length,
      totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    },
    gates: results.map((r) => ({
      gate: r.gate,
      exitCode: r.exitCode,
      signal: r.signal || null,
      durationMs: r.durationMs,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      error: r.error || null,
    })),
    failedGates: failedGates.map((r) => r.gate),
    retentionDays: ARTIFACTS_RETENTION_DAYS,
  };

  const reportPath = resolve(ARTIFACTS_DIR, "release-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[release] Report written to ${redactPath(reportPath)}`);

  // Write individual gate failure logs
  for (const result of results) {
    if (result.exitCode !== 0) {
      const gateLogPath = resolve(ARTIFACTS_DIR, `gate-${result.gate}.log`);
      const safeLog = redactOutput(
        `GATE: ${result.gate}\n` +
        `EXIT CODE: ${result.exitCode}\n` +
        `DURATION: ${result.durationMs}ms\n` +
        `STARTED: ${result.startedAt}\n` +
        `COMPLETED: ${result.completedAt}\n` +
        `${result.error ? `ERROR: ${result.error}\n` : ""}` +
        `\n--- STDOUT (last 5KB) ---\n${result.stdout}\n` +
        `\n--- STDERR (last 5KB) ---\n${result.stderr}\n`
      );
      writeFileSync(gateLogPath, safeLog);
    }
  }

  return reportPath;
}

async function main() {
  const args = process.argv.slice(2);
  const stopOnFirstFailure = args.includes("--stop-on-first-failure");
  const skipLighthouse = args.includes("--skip-lighthouse");
  const gatesToRun = skipLighthouse ? GATES.filter((gate) => gate.name !== "lighthouse") : GATES;

  console.log(`[release] SeoVista Release Gate — ${now()}`);
  console.log(`[release] Gates to run: ${gatesToRun.map((gate) => gate.name).join(", ")}`);
  console.log(`[release] Stop on first failure: ${stopOnFirstFailure}`);
  console.log("");

  const runner = createReleaseRunner({
    gates: gatesToRun,
    log: (...messages) => console.log(...messages),
    errorLog: (...messages) => console.error(...messages),
    runLifecycle: async (args) => runLifecycleCommand(args),
    runGate: async (name, command, timeout, contextPath) => {
      console.log(`[release] Running gate: ${name}...`);
      const result = await runCommand(name, command, timeout, contextPath);
      const status = result.exitCode === 0 ? "PASSED" : "FAILED";
      console.log(`[release] ${name}: ${status} (${result.durationMs}ms, exit ${result.exitCode})`);
      if (result.exitCode !== 0 && stopOnFirstFailure) console.log("[release] Stopping on first failure.");
      return result;
    },
  });

  let result;
  try {
    result = await runner.run({ stopOnFirstFailure, skipLighthouse });
  } catch (error) {
    const failure = {
      gate: "release-script",
      exitCode: -1,
      error: error instanceof Error ? error.message : String(error),
      durationMs: 0,
      stdout: "",
      stderr: "",
      startedAt: now(),
      completedAt: now(),
    };
    await generateArtifactsReport([failure], [failure]);
    throw error;
  }

  console.log("");
  console.log("=== Release Gate Summary ===");
  console.log(`Total gates: ${result.results.length}`);
  console.log(`Passed: ${result.results.filter((gate) => gate.exitCode === 0).length}`);
  console.log(`Failed: ${result.failedGates.length}`);
  console.log(`Report: ${redactPath(resolve(ARTIFACTS_DIR, "release-report.json"))}`);

  if (result.failedGates.length > 0) {
    console.log(`\nFailed gates: ${result.failedGates.map((gate) => gate.gate).join(", ")}`);
  } else {
    console.log("\n[release] All gates passed.");
  }

  process.exit(result.exitCode);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
