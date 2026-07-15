#!/usr/bin/env node
/* global process, setTimeout */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, execPath, stderr, stdout } from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

export function getInfrastructureServiceRecordPath(root) {
  return resolve(root, ".lifecycle-registry", "services-infrastructure.json");
}

function getInfrastructureServiceStartLockPath(root) {
  return resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
}

function readRecord(root) {
  const path = getInfrastructureServiceRecordPath(root);
  if (!existsSync(path)) return undefined;
  const record = JSON.parse(readFileSync(path, "utf8"));
  if (!record?.contextPath) throw new Error("Infrastructure service ownership record is invalid");
  return record;
}

function claimStartLock(root) {
  const lockPath = getInfrastructureServiceStartLockPath(root);
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    writeFileSync(lockPath, `${process.pid}\n`, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

function releaseStartLock(root) {
  try {
    unlinkSync(getInfrastructureServiceStartLockPath(root));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function waitForRecord(root, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = readRecord(root);
    if (record) return record;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error("Timed out waiting for infrastructure service ownership record");
}

function writeRecord(root, contextPath) {
  const path = getInfrastructureServiceRecordPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ contextPath: resolve(contextPath), createdAt: new Date().toISOString() }, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

export function createInfrastructureServiceCoordinator(root, runLifecycle) {
  let startInFlight;

  return {
    async start() {
      const existing = readRecord(root);
      if (existing) return existing.contextPath;
      if (startInFlight) return startInFlight;

      startInFlight = (async () => {
        const current = readRecord(root);
        if (current) return current.contextPath;
        if (!claimStartLock(root)) return (await waitForRecord(root)).contextPath;

        try {
          const contextPath = resolve(await runLifecycle(["start", "seovista-dev"]));
          try {
            writeRecord(root, contextPath);
            return contextPath;
          } catch (error) {
            await runLifecycle(["teardown", contextPath]).catch(() => undefined);
            const winner = readRecord(root);
            if (winner) return winner.contextPath;
            throw error;
          }
        } finally {
          releaseStartLock(root);
        }
      })();

      try {
        return await startInFlight;
      } finally {
        startInFlight = undefined;
      }
    },
    async health(service) {
      if (!["postgres", "redis"].includes(service)) throw new Error(`Unknown infrastructure service: ${service}`);
      const record = readRecord(root);
      if (!record) throw new Error("Infrastructure service has no owned lifecycle context record");
      await runLifecycle(["health", record.contextPath, service]);
      return true;
    },
    async stop() {
      const record = readRecord(root);
      if (!record) return true;
      await runLifecycle(["teardown", record.contextPath]);
      unlinkSync(getInfrastructureServiceRecordPath(root));
      return true;
    },
  };
}

function defaultRunner(root) {
  const lifecycleScript = resolve(root, "scripts", "infrastructure-lifecycle.js");
  return async (args) =>
    execFileSync(execPath, [lifecycleScript, ...args], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
}

async function main() {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const coordinator = createInfrastructureServiceCoordinator(root, defaultRunner(root));
  const [command, service] = argv.slice(2);
  if (command === "start") {
    stdout.write(`${await coordinator.start()}\n`);
    return;
  }
  if (command === "health") {
    await coordinator.health(service);
    return;
  }
  if (command === "stop") {
    await coordinator.stop();
    return;
  }
  throw new Error("Usage: node scripts/infrastructure-service-coordinator.js <start|health|stop> [postgres|redis]");
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
  main().catch((error) => {
    stderr.write(`${error instanceof Error ? error.message : "infrastructure service failure"}\n`);
    throw error;
  });
}
