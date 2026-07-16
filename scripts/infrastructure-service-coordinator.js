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

export function getInfrastructureServiceStartingRecordPath(root) {
  return resolve(root, ".lifecycle-registry", "services-infrastructure.starting.json");
}

function getInfrastructureServiceStartLockPath(root) {
  return resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
}

function getStartingRecordPath(dependencies, root) {
  return dependencies.fileSystem?.getStartingRecordPath?.(root) ?? getInfrastructureServiceStartingRecordPath(root);
}

function validateRecord(record) {
  const state = record?.state ?? "active";
  if (!record || !["active", "starting", "stopping", "retired"].includes(state)) {
    throw new Error("Infrastructure service ownership record is invalid");
  }
  if (state !== "starting" && typeof record.contextPath !== "string") {
    throw new Error("Infrastructure service ownership record is invalid");
  }
  if (state === "starting" && record.contextPath !== undefined && typeof record.contextPath !== "string") {
    throw new Error("Infrastructure service ownership record is invalid");
  }
  return { ...record, state };
}

function readStartingRecordFromPath(path, dependencies = {}) {
  const read = dependencies.fileSystem?.readFileSync ?? readFileSync;
  if (!existsSync(path)) return undefined;
  return validateRecord(JSON.parse(read(path, "utf8")));
}

function readStartingRecord(root, dependencies = {}) {
  return readStartingRecordFromPath(getStartingRecordPath(dependencies, root), dependencies);
}

function readRecord(root, dependencies = {}) {
  const activePath = getInfrastructureServiceRecordPath(root);
  const read = dependencies.fileSystem?.readFileSync ?? readFileSync;
  if (existsSync(activePath)) return validateRecord(JSON.parse(read(activePath, "utf8")));
  return readStartingRecord(root, dependencies);
}

function removeStartingRecordIfOwned(root, operationToken, dependencies = {}) {
  if (typeof operationToken !== "string") return false;
  const startingPath = getStartingRecordPath(dependencies, root);
  const quarantinePath = `${startingPath}.${randomUUID()}.cleanup`;
  const rename = dependencies.fileSystem?.renameSync ?? renameSync;
  try {
    rename(startingPath, quarantinePath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }

  const quarantinedRecord = readStartingRecordFromPath(quarantinePath, dependencies);
  if (quarantinedRecord?.operationToken !== operationToken) {
    const link = dependencies.fileSystem?.linkSync ?? linkSync;
    try {
      link(quarantinePath, startingPath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    unlinkOwnQuarantine(quarantinePath, dependencies);
    return false;
  }

  unlinkOwnQuarantine(quarantinePath, dependencies);
  return true;
}

function processStartIdentity(processId) {
  if (process.platform !== "linux" || !Number.isInteger(processId) || processId <= 0) return undefined;
  try {
    const stat = readFileSync(`/proc/${processId}/stat`, "utf8");
    const commandEnd = stat.lastIndexOf(")");
    if (commandEnd < 0) return undefined;
    return stat.slice(commandEnd + 2).trim().split(/\s+/)[19] || undefined;
  } catch {
    return undefined;
  }
}

function getProcessStartIdentity(processId, dependencies) {
  return dependencies.getProcessStartIdentity?.(processId) ?? processStartIdentity(processId);
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

function createLockPayload(processId, token, startIdentity) {
  return `${JSON.stringify({ pid: processId, token, ...(startIdentity ? { startIdentity } : {}) })}\n`;
}

function readLockPayload(lockPath, dependencies = {}) {
  const read = dependencies.fileSystem?.readFileSync ?? readFileSync;
  try {
    const payload = JSON.parse(read(lockPath, "utf8"));
    if (
      !Number.isSafeInteger(payload?.pid) ||
      payload.pid <= 0 ||
      typeof payload.token !== "string" ||
      payload.token.length === 0 ||
      (payload.startIdentity !== undefined && typeof payload.startIdentity !== "string")
    ) {
      return undefined;
    }
    return { pid: payload.pid, token: payload.token, startIdentity: payload.startIdentity };
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
  (dependencies.fileSystem?.writeFileSync ?? writeFileSync)(
    lockPath,
    createLockPayload(payload.pid, payload.token, payload.startIdentity),
    {
      encoding: "utf8",
      flag: "wx",
    },
  );
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
  if (observedPayload.startIdentity !== undefined) {
    const currentStartIdentity = getProcessStartIdentity(observedPayload.pid, dependencies);
    if (currentStartIdentity === undefined || currentStartIdentity === observedPayload.startIdentity) return false;
  }
  const quarantinePath = `${lockPath}.${randomUUID()}.stale`;
  const rename = dependencies.fileSystem?.renameSync ?? renameSync;
  try {
    rename(lockPath, quarantinePath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }

  const quarantinedPayload = readLockPayload(quarantinePath, dependencies);
  if (
    !quarantinedPayload ||
    quarantinedPayload.pid !== observedPayload.pid ||
    quarantinedPayload.token !== observedPayload.token ||
    quarantinedPayload.startIdentity !== observedPayload.startIdentity
  ) {
    restoreQuarantinedLock(lockPath, quarantinePath, dependencies);
    return false;
  }

  dependencies.afterStaleLockQuarantine?.(quarantinePath);
  return { quarantinePath, observedPayload };
}

function claimStartLock(root, isProcessAlive, dependencies) {
  const lockPath = getLockPath(dependencies, root);
  const processId = dependencies.processId ?? process.pid;
  const payload = {
    pid: processId,
    token: createLockToken(dependencies),
    startIdentity: getProcessStartIdentity(processId, dependencies),
  };
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
  if (
    !movedPayload ||
    movedPayload.pid !== payload.pid ||
    movedPayload.token !== payload.token ||
    movedPayload.startIdentity !== payload.startIdentity
  ) {
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

function writeRecord(root, contextPath, dependencies = {}, lockPayload) {
  const path = getInfrastructureServiceRecordPath(root);
  mkdirSync(dirname(path), { recursive: true });
  (dependencies.fileSystem?.writeFileSync ?? writeFileSync)(
    path,
    `${JSON.stringify(
      {
        state: "active",
        contextPath: resolve(contextPath),
        ...(lockPayload?.operationToken ? { operationToken: lockPayload.operationToken } : {}),
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    {
      encoding: "utf8",
      flag: "wx",
    },
  );
}

function writeRecoverableRecord(root, record, dependencies = {}) {
  const path = getStartingRecordPath(dependencies, root);
  mkdirSync(dirname(path), { recursive: true });
  const write = dependencies.fileSystem?.writeFileSync ?? writeFileSync;
  write(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

function updateRecord(root, record, dependencies = {}) {
  const path = getInfrastructureServiceRecordPath(root);
  const write = dependencies.fileSystem?.writeFileSync ?? writeFileSync;
  write(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8" });
}

function removeStartingRecord(root, dependencies = {}) {
  const unlink = dependencies.fileSystem?.unlinkSync ?? unlinkSync;
  try {
    unlink(getStartingRecordPath(dependencies, root));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function removeRecord(root, dependencies = {}) {
  // Remove the recoverable marker first so a partial cleanup cannot strand a
  // starting-only record after the active ownership record is gone.
  removeStartingRecord(root, dependencies);
  const unlink = dependencies.fileSystem?.unlinkSync ?? unlinkSync;
  try {
    unlink(getInfrastructureServiceRecordPath(root));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
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
          const existing = readRecord(root, dependencies);
          if (existing?.state === "starting" && existing.contextPath === undefined) {
            throw new Error("Infrastructure service start is incomplete and requires recovery");
          }
          if (existing) {
            if (existing.state === "active") {
              removeStartingRecordIfOwned(root, existing.operationToken, dependencies);
              return existing.contextPath;
            }
            if (existing.state === "retired") {
              removeRecord(root, dependencies);
            } else if (existing.state === "starting") {
              throw new Error("Infrastructure service start is incomplete and requires recovery");
            } else {
              throw new Error(`Infrastructure service ownership record is ${existing.state} and requires recovery`);
            }
          }

          const pendingRecord = {
            state: "starting",
            pid: lockPayload.pid,
            ...(lockPayload.startIdentity ? { startIdentity: lockPayload.startIdentity } : {}),
            operationToken: lockPayload.token,
            createdAt: new Date().toISOString(),
          };
          writeRecoverableRecord(root, pendingRecord, dependencies);
          let contextPath;
          try {
            contextPath = resolve(await runLifecycle(["start", "seovista-dev"]));
            try {
              writeRecord(root, contextPath, dependencies, { operationToken: lockPayload.token });
              return contextPath;
            } catch (error) {
              await runLifecycle(["teardown", contextPath]).catch(() => undefined);
              const winner = readRecord(root, dependencies);
              if (winner?.state === "active") {
                removeStartingRecordIfOwned(root, lockPayload.token, dependencies);
                return winner.contextPath;
              }
              throw error;
            }
          } finally {
            try {
              removeStartingRecordIfOwned(root, lockPayload.token, dependencies);
            } catch (error) {
              if (error?.code !== "ENOENT") {
                process.stderr.write(`Infrastructure starting-record cleanup failed: ${String(error)}\n`);
              }
            }
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
      const record = readRecord(root, dependencies);
      if (!record || record.state !== "active") {
        throw new Error("Infrastructure service has no active owned lifecycle context record");
      }
      await runLifecycle(["health", record.contextPath, service]);
      return true;
    },
    async stop() {
      if (startInFlight) await startInFlight.catch(() => undefined);
      const lockPayload = await acquireOperationLock(root, 30_000, isProcessAlive, dependencies);
      try {
        const record = readRecord(root, dependencies);
        if (!record) return true;
        if (record.state === "starting") {
          throw new Error("Infrastructure service start is incomplete and requires recovery");
        }
        if (record.state === "retired") {
          removeRecord(root, dependencies);
          return true;
        }
        updateRecord(root, { ...record, state: "stopping", stoppedAt: new Date().toISOString() }, dependencies);
        await runLifecycle(["teardown", record.contextPath]);
        updateRecord(root, { ...record, state: "retired", retiredAt: new Date().toISOString() }, dependencies);
        removeRecord(root, dependencies);
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
