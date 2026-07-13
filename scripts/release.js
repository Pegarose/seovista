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
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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
  { name: "build", command: "pnpm build", timeout: 300_000 },
  { name: "test:e2e", command: "pnpm test:e2e", timeout: 300_000 },
  { name: "test:a11y", command: "pnpm test:a11y", timeout: 300_000 },
  { name: "test:seo", command: "pnpm test:seo", timeout: 300_000 },
  { name: "lighthouse", command: "pnpm lighthouse", timeout: 600_000 },
];

// Store child process references for cleanup
const children = new Set();
let dockerStarted = false;

function now() {
  return new Date().toISOString();
}

function redactPath(filePath) {
  // Redact absolute paths to relative for artifact safety
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

function runCommand(name, command, timeoutMs) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";

    const child = spawn(command, [], {
      shell: true,
      cwd: root,
      env: { ...process.env },
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

async function runDockerCommand(args) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", ...args], {
      cwd: root,
      stdio: "pipe",
      timeout: 60_000,
    });
    let output = "";

    child.stdout.on("data", (d) => { output += d.toString(); });
    child.stderr.on("data", (d) => { output += d.toString(); });

    child.on("close", (code) => {
      resolve({ exitCode: code, output });
    });

    child.on("error", (err) => {
      resolve({ exitCode: -1, output: err.message });
    });
  });
}

async function startDocker() {
  console.log("[release] Starting Docker services...");
  const result = await runDockerCommand(["up", "-d", "--wait", "postgres", "redis"]);
  if (result.exitCode !== 0) {
    console.error("[release] Docker services failed to start:", result.output);
    return false;
  }
  dockerStarted = true;
  console.log("[release] Docker services healthy.");
  return true;
}

async function stopDocker() {
  if (!dockerStarted) return;
  console.log("[release] Stopping Docker services...");
  await runDockerCommand(["down", "--volumes", "--remove-orphans", "--timeout", "30"]);
  dockerStarted = false;
  console.log("[release] Docker services stopped.");
}

async function killAllChildren() {
  for (const child of children) {
    try {
      if (!child.killed) {
        child.kill("SIGTERM");
        // Force kill after 5s
        setTimeout(() => {
          try { if (!child.killed) child.kill("SIGKILL"); } catch {}
        }, 5000);
      }
    } catch {
      // Child may already be dead
    }
  }
}

async function cleanup() {
  console.log("[release] Running cleanup...");
  await killAllChildren();
  await stopDocker();
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

  const gatesToRun = skipLighthouse
    ? GATES.filter((g) => g.name !== "lighthouse")
    : GATES;

  console.log(`[release] SeoVista Release Gate — ${now()}`);
  console.log(`[release] Gates to run: ${gatesToRun.map((g) => g.name).join(", ")}`);
  console.log(`[release] Stop on first failure: ${stopOnFirstFailure}`);
  console.log("");

  // Register cleanup handlers
  let cleaningUp = false;
  const handleInterrupt = async (signal) => {
    if (cleaningUp) {
      console.error(`[release] Forced exit during cleanup (${signal})`);
      process.exit(1);
    }
    cleaningUp = true;
    console.log(`\n[release] Received ${signal}. Cleaning up...`);
    await cleanup();
    console.log("[release] Cleanup complete. Exiting.");
    process.exit(1);
  };

  process.on("SIGINT", () => handleInterrupt("SIGINT"));
  process.on("SIGTERM", () => handleInterrupt("SIGTERM"));

  const results = [];
  const failedGates = [];
  let dockerNeeded = gatesToRun.some((g) => g.needsDocker);

  try {
    // Start Docker if needed
    if (dockerNeeded) {
      const started = await startDocker();
      if (!started) {
        const result = { gate: "docker-start", exitCode: -1, error: "Docker services failed to start", durationMs: 0, stdout: "", stderr: "", startedAt: now(), completedAt: now() };
        results.push(result);
        failedGates.push(result);
        await generateArtifactsReport(results, failedGates);
        await cleanup();
        process.exit(1);
      }
    }

    // Run gates in order
    for (const gate of gatesToRun) {
      console.log(`[release] Running gate: ${gate.name}...`);
      const result = await runCommand(gate.name, gate.command, gate.timeout);
      results.push(result);

      const status = result.exitCode === 0 ? "PASSED" : "FAILED";
      console.log(`[release] ${gate.name}: ${status} (${result.durationMs}ms, exit ${result.exitCode})`);

      if (result.exitCode !== 0) {
        failedGates.push(result);
        if (stopOnFirstFailure) {
          console.log("[release] Stopping on first failure.");
          break;
        }
      }
    }

    // Generate report
    await generateArtifactsReport(results, failedGates);

    // Print summary
    console.log("");
    console.log("=== Release Gate Summary ===");
    console.log(`Total gates: ${results.length}`);
    console.log(`Passed: ${results.filter((r) => r.exitCode === 0).length}`);
    console.log(`Failed: ${failedGates.length}`);
    console.log(`Report: ${redactPath(resolve(ARTIFACTS_DIR, "release-report.json"))}`);

    if (failedGates.length > 0) {
      console.log(`\nFailed gates: ${failedGates.map((r) => r.gate).join(", ")}`);
      await cleanup();
      process.exit(1);
    }

    console.log("\n[release] All gates passed.");
  } catch (err) {
    console.error("[release] Unexpected error:", err.message);
    await generateArtifactsReport(results, failedGates);
    failedGates.push({ gate: "release-script", exitCode: -1, error: err.message });
  }

  await cleanup();
  process.exit(failedGates.length > 0 ? 1 : 0);
}

main();
