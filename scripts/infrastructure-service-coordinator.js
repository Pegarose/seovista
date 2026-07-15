#!/usr/bin/env node
/* global process, setTimeout */

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
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

function processIsAlive(processId) {
  if (!Number.isInteger(processId) || processId <= 0) return undefined;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "EPERM") return true;
      if (error.code === "ESRCH") return false;
    }
    return undefined;
  }
}

function createLockPayload(processId, token) {
  return `${JSON.stringify({ pid: processId, token })}\n`;
}

function readLockPayload(lockPath, dependencies = {}) {
  const read = dependencies.fileSystem?.readFileSync ?? readFileSync;
  try {
    const payload = JSON.parse(read(lockPath, "utf8"));
    if (!Number.isSafeInteger(payload?.pid) || payload.pid <= 0 || typeof payload.token !== "string" || payload.token.length === 0) {
      return undefined;
    }
    return { pid: payload.pid, token: payload.token };
  } catch {
    return undefined;
  }
}

function getLockPath(dependencies, root) {
  return dependencies.fileSystem?.getLockPath?.(root) ?? getInfrastructureServiceStartLockPath(root);
}

function createLockToken(dependencies) {
  return dependencies.createLockToken?.() ?? randomUUID();
}

function writeLock(lockPath, payload, dependencies) {
  (dependencies.fileSystem?.writeFileSync ?? writeFileSync)(lockPath, createLockPayload(payload.pid, payload.token), {
    encoding: "utf8",
    flag: "wx",
  });
}

function unlinkOwnQuarantine(quarantinePath, dependencies) {
  const unlink = dependencies.fileSystem?.unlinkSync ?? unlinkSync;
  try {
    unlink(quarantinePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function preserveQuarantinedLock(lockPath, quarantinePath, dependencies) {
  const link = dependencies.fileSystem?.linkSync ?? linkSync;
  try {
    link(quarantinePath, lockPath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  unlinkOwnQuarantine(quarantinePath, dependencies);
}

function restoreQuarantinedLock(lockPath, quarantinePath, dependencies) {
  const link = dependencies.fileSystem?.linkSync ?? linkSync;
  try {
    link(quarantinePath, lockPath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  unlinkOwnQuarantine(quarantinePath, dependencies);
}

function reclaimStaleStartLock(lockPath, observedPayload, isProcessAlive, dependencies) {
  if (observedPayload === undefined || isProcessAlive(observedPayload.pid) !== false) return false;
  const quarantinePath = `${lockPath}.${observedPayload.token}.${randomUUID()}.stale`;
  const rename = dependencies.fileSystem?.renameSync ?? renameSync;
  try {
    rename(lockPath, quarantinePath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }

  const quarantinedPayload = readLockPayload(quarantinePath, dependencies);
  if (!quarantinedPayload || quarantinedPayload.pid !== observedPayload.pid || quarantinedPayload.token !== observedPayload.token) {
    restoreQuarantinedLock(lockPath, quarantinePath, dependencies);
    return false;
  }

  dependencies.afterStaleLockQuarantine?.(quarantinePath);
  return { quarantinePath, observedPayload };
}

function claimStartLock(root, isProcessAlive, dependencies) {
  const lockPath = getLockPath(dependencies, root);
  const payload = { pid: dependencies.processId ?? process.pid, token: createLockToken(dependencies) };
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    writeLock(lockPath, payload, dependencies);
    return payload;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const observedPayload = readLockPayload(lockPath);
    const reclaimed = reclaimStaleStartLock(lockPath, observedPayload, isProcessAlive, dependencies);
    if (!reclaimed) return false;
    try {
      writeLock(lockPath, payload, dependencies);
    } catch (retryError) {
      if (retryError?.code === "EEXIST") {
        preserveQuarantinedLock(lockPath, reclaimed.quarantinePath, dependencies);
        return false;
      }
      throw retryError;
    }
    try {
      unlinkOwnQuarantine(reclaimed.quarantinePath, dependencies);
    } catch {
      // The newly claimed canonical lock remains authoritative if cleanup fails.
    }
    return payload;
  }
}

function releaseStartLock(root, payload, dependencies) {
  const lockPath = getLockPath(dependencies, root);
  const quarantinePath = `${lockPath}.${payload.token}.${randomUUID()}.release`;
  const rename = dependencies.fileSystem?.renameSync ?? renameSync;
  try {
    rename(lockPath, quarantinePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  const movedPayload = readLockPayload(quarantinePath, dependencies);
  if (!movedPayload || movedPayload.pid !== payload.pid || movedPayload.token !== payload.token) {
    restoreQuarantinedLock(lockPath, quarantinePath, dependencies);
    return;
  }

  unlinkOwnQuarantine(quarantinePath, dependencies);
}

async function acquireOperationLock(root, timeoutMs = 30_000, isProcessAlive = processIsAlive, dependencies = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const payload = claimStartLock(root, isProcessAlive, dependencies);
    if (payload) return payload;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error("Timed out waiting for infrastructure service operation lock");
}

function writeRecord(root, contextPath) {
  const path = getInfrastructureServiceRecordPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ contextPath: resolve(contextPath), createdAt: new Date().toISOString() }, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

export function createInfrastructureServiceCoordinator(root, runLifecycle, dependencies = {}) {
  const isProcessAlive = dependencies.isProcessAlive ?? processIsAlive;
  let startInFlight;

  return {
    async start() {
      if (startInFlight) return startInFlight;

      startInFlight = (async () => {
        const lockPayload = await acquireOperationLock(root, 30_000, isProcessAlive, dependencies);
        try {
          const existing = readRecord(root);
          if (existing) return existing.contextPath;

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
          releaseStartLock(root, lockPayload, dependencies);
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
      if (startInFlight) await startInFlight.catch(() => undefined);
      const lockPayload = await acquireOperationLock(root, 30_000, isProcessAlive, dependencies);
      try {
        const record = readRecord(root);
        if (!record) return true;
        await runLifecycle(["teardown", record.contextPath]);
        unlinkSync(getInfrastructureServiceRecordPath(root));
        return true;
      } finally {
        releaseStartLock(root, lockPayload, dependencies);
      }
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
