#!/usr/bin/env node
/* global process, setTimeout */

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, execPath, stderr, stdout } from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { getDeterministicContextPath, readTrustedLifecycleContext } from "./infrastructure-lifecycle-core.js";

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
  try {
    return validateRecord(JSON.parse(read(path, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function readStartingRecord(root, dependencies = {}) {
  return readStartingRecordFromPath(getStartingRecordPath(dependencies, root), dependencies);
}

function readRecord(root, dependencies = {}) {
  return readActiveRecord(root, dependencies) ?? readStartingRecord(root, dependencies);
}

function restoreStartingMarker(startingPath, quarantinePath, dependencies, primaryError) {
  const link = dependencies.fileSystem?.linkSync ?? linkSync;
  try {
    link(quarantinePath, startingPath);
    return undefined;
  } catch (restoreError) {
    if (restoreError?.code === "EEXIST") return undefined;
    if (primaryError instanceof Error) Object.defineProperty(primaryError, "restoreError", { value: restoreError, enumerable: false });
    return restoreError;
  }
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

  let quarantinedRecord;
  try {
    quarantinedRecord = readStartingRecordFromPath(quarantinePath, dependencies);
  } catch (error) {
    restoreStartingMarker(startingPath, quarantinePath, dependencies, error);
    throw error;
  }
  if (quarantinedRecord?.operationToken !== operationToken) {
    const ownershipError = new Error("Starting marker ownership changed during cleanup");
    restoreStartingMarker(startingPath, quarantinePath, dependencies, ownershipError);
    unlinkOwnQuarantine(quarantinePath, dependencies);
    return false;
  }

  try {
    unlinkOwnQuarantine(quarantinePath, dependencies);
  } catch (error) {
    restoreStartingMarker(startingPath, quarantinePath, dependencies, error);
    throw error;
  }
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

function createLifecycleNonce(operationToken) {
  return createHash("sha256").update(operationToken).digest("hex").slice(0, 12);
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
    if (currentStartIdentity === observedPayload.startIdentity) return false;
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
    const observedPayload = readLockPayload(lockPath, dependencies);
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
  const quarantinePath = `${lockPath}.${randomUUID()}.release`;
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

function isCanonicalContextPath(root, contextPath) {
  if (typeof contextPath !== "string") return false;
  const evidenceRoot = resolve(root, ".lifecycle-evidence");
  const canonicalPath = resolve(contextPath);
  const separator = process.platform === "win32" ? "\\" : "/";
  return canonicalPath.startsWith(`${evidenceRoot}${separator}`) && canonicalPath.endsWith("-context.json");
}

function readActiveRecord(root, dependencies = {}) {
  const path = getInfrastructureServiceRecordPath(root);
  const read = dependencies.fileSystem?.readFileSync ?? readFileSync;
  try {
    return validateRecord(JSON.parse(read(path, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function readStartingRecordSafely(root, dependencies = {}) {
  try {
    return readStartingRecord(root, dependencies);
  } catch (error) {
    throw new Error(`Infrastructure starting record is invalid and requires recovery: ${String(error)}`);
  }
}

function removeActiveRecord(root, dependencies = {}) {
  const unlink = dependencies.fileSystem?.unlinkSync ?? unlinkSync;
  try {
    unlink(getInfrastructureServiceRecordPath(root));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function updateRecord(root, record, dependencies = {}) {
  const path = getInfrastructureServiceRecordPath(root);
  const write = dependencies.fileSystem?.writeFileSync ?? writeFileSync;
  write(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8" });
}

function removeStartingRecord(root, dependencies = {}, operationToken) {
  if (typeof operationToken !== "string") return false;
  return removeStartingRecordIfOwned(root, operationToken, dependencies);
}

function removeRecord(root, dependencies = {}, operationToken) {
  // Remove the recoverable marker first so a partial cleanup cannot strand a
  // starting-only record after the active ownership record is gone.
  removeStartingRecord(root, dependencies, operationToken);
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
          const active = readActiveRecord(root, dependencies);
          const starting = readStartingRecordSafely(root, dependencies);
          if (active?.state === "active") {
            if (starting && starting.operationToken === active.operationToken) {
              removeStartingRecordIfOwned(root, active.operationToken, dependencies);
            }
            return active.contextPath;
          }
          if (active?.state === "retired") {
            removeActiveRecord(root, dependencies);
          } else if (active?.state === "starting" || active?.state === "stopping") {
            throw new Error(`Infrastructure service ownership record is ${active.state} and requires recovery`);
          }
          if (starting) {
            throw new Error("Infrastructure service start is incomplete and requires recovery");
          }

          const nonce = createLifecycleNonce(lockPayload.token);
          const plannedContextPath = getDeterministicContextPath(root, "seovista-dev", nonce);
          const pendingRecord = {
            state: "starting",
            contextPath: plannedContextPath,
            pid: lockPayload.pid,
            ...(lockPayload.startIdentity ? { startIdentity: lockPayload.startIdentity } : {}),
            operationToken: lockPayload.token,
            createdAt: new Date().toISOString(),
          };
          writeRecoverableRecord(root, pendingRecord, dependencies);
          let contextPath;
          try {
            contextPath = resolve(await runLifecycle(["start", "seovista-dev", nonce]));
            if (contextPath !== plannedContextPath) {
              await runLifecycle(["teardown", contextPath]).catch(() => undefined);
              throw new Error("Lifecycle returned a context path different from the planned context path");
            }
            try {
              writeRecord(root, contextPath, dependencies, { operationToken: lockPayload.token });
              return contextPath;
            } catch (error) {
              let teardownError;
              try {
                await runLifecycle(["teardown", contextPath]);
              } catch (cleanupError) {
                teardownError = cleanupError;
              }
              const winner = readActiveRecord(root, dependencies);
              if (winner?.state === "active") {
                removeStartingRecordIfOwned(root, lockPayload.token, dependencies);
                return winner.contextPath;
              }
              if (teardownError && error instanceof Error) {
                Object.defineProperty(error, "cleanupError", { value: teardownError, enumerable: false });
              }
              throw error;
            }
          } finally {
            if (contextPath === plannedContextPath) {
              try {
                removeStartingRecordIfOwned(root, lockPayload.token, dependencies);
              } catch (error) {
                if (error?.code !== "ENOENT") {
                  process.stderr.write(`Infrastructure starting-record cleanup failed: ${String(error)}\n`);
                }
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
    async recover() {
      const lockPayload = await acquireOperationLock(root, 30_000, isProcessAlive, dependencies);
      try {
        const active = readActiveRecord(root, dependencies);
        const starting = readStartingRecordSafely(root, dependencies);
        if (!starting) return true;
        if (
          typeof starting.contextPath !== "string" ||
          !isCanonicalContextPath(root, starting.contextPath) ||
          typeof starting.operationToken !== "string" ||
          starting.operationToken.length === 0
        ) {
          throw new Error("Infrastructure starting record ownership is invalid and requires recovery");
        }
        if (!existsSync(starting.contextPath)) {
          throw new Error("Infrastructure starting record context path does not exist and requires recovery");
        }
        if (active && (active.contextPath !== starting.contextPath || active.operationToken !== starting.operationToken)) {
          throw new Error("Infrastructure recovery found a different active owner and requires manual recovery");
        }
        try {
          readTrustedLifecycleContext(starting.contextPath, root, { allowRetired: true });
        } catch (error) {
          throw new Error(`Infrastructure recovery context is not trusted: ${String(error)}`);
        }
        await runLifecycle(["teardown", starting.contextPath]);
        removeStartingRecordIfOwned(root, starting.operationToken, dependencies);
        if (active?.contextPath === starting.contextPath && active.operationToken === starting.operationToken) {
          removeActiveRecord(root, dependencies);
        }
        return true;
      } finally {
        releaseStartLock(root, lockPayload, dependencies);
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
          removeRecord(root, dependencies, record.operationToken);
          return true;
        }
        updateRecord(root, { ...record, state: "stopping", stoppedAt: new Date().toISOString() }, dependencies);
        await runLifecycle(["teardown", record.contextPath]);
        updateRecord(root, { ...record, state: "retired", retiredAt: new Date().toISOString() }, dependencies);
        removeRecord(root, dependencies, record.operationToken);
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
  const args = argv.slice(2);
  const [command, service] = args;
  const usage = "Usage: node scripts/infrastructure-service-coordinator.js start | health <postgres|redis> | stop | recover";
  if (command === "start" && args.length === 1) {
    stdout.write(`${await coordinator.start()}\n`);
    return;
  }
  if (command === "health" && args.length === 2) {
    await coordinator.health(service);
    return;
  }
  if (command === "stop" && args.length === 1) {
    await coordinator.stop();
    return;
  }
  if (command === "recover" && args.length === 1) {
    await coordinator.recover();
    return;
  }
  throw new Error(usage);
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
  main().catch((error) => {
    stderr.write(`${error instanceof Error ? error.message : "infrastructure service failure"}\n`);
    throw error;
  });
}
