#!/usr/bin/env node

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, freemem } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const SCRIPT_DIRECTORY = resolve(import.meta.dirname);
const DEFAULT_WEB_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..", "apps", "web");
const OWNERSHIP_DIRECTORY_NAME = ".next-build-ownership";
const OUTPUT_OWNER_FILE = ".seovista-output-owner.json";
const DEFAULT_HEAP_MB = 1536;
const DEFAULT_MIN_HEADROOM_MB = 1024;

export const BUILD_PROFILES = Object.freeze({
  canonical: ".next-canonical",
  development: ".next-development",
  playwright: ".next-playwright",
  lighthouse: ".next-lighthouse",
  sentinel: ".next-sentinel",
  standalone: ".next-standalone",
});

export class BuildOwnershipError extends Error {
  constructor(message, record) {
    super(message);
    this.name = "BuildOwnershipError";
    this.record = record;
  }
}

function assertProfile(profile) {
  if (!(profile in BUILD_PROFILES)) {
    throw new BuildOwnershipError(
      `Unknown build profile "${profile}". Allowed profiles: ${Object.keys(BUILD_PROFILES).join(", ")}.`
    );
  }
}

function asPositiveInteger(value, name, fallback) {
  const source = value ?? fallback;
  const parsed = Number(source);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BuildOwnershipError(`${name} must be a positive integer in MiB.`);
  }
  return parsed;
}

function canonicalWebDirectory(webDirectory = DEFAULT_WEB_DIRECTORY) {
  return resolve(webDirectory);
}

function withinDirectory(directory, candidate) {
  const relativePath = relative(directory, candidate);
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

export function getBuildOutputDirectory(webDirectory, profile) {
  assertProfile(profile);
  const directory = canonicalWebDirectory(webDirectory);
  const outputDirectory = resolve(directory, BUILD_PROFILES[profile]);
  if (!withinDirectory(directory, outputDirectory)) {
    throw new BuildOwnershipError("Build output must stay inside apps/web.");
  }
  return outputDirectory;
}

export function getOwnershipDirectory(webDirectory = DEFAULT_WEB_DIRECTORY) {
  return resolve(canonicalWebDirectory(webDirectory), OWNERSHIP_DIRECTORY_NAME);
}

function buildOwnerRecordPath(webDirectory, profile) {
  return resolve(
    getOwnershipDirectory(webDirectory),
    `${BUILD_PROFILES[profile]}.${OUTPUT_OWNER_FILE}`
  );
}

function processIsAlive(processId) {
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error && typeof error === "object" && "code" in error && error.code === "EPERM";
  }
}

function readOwnershipRecord(path) {
  try {
    const record = JSON.parse(readFileSync(path, "utf8"));
    if (!record || typeof record !== "object" || Array.isArray(record)) return undefined;
    return record;
  } catch {
    return undefined;
  }
}

function lockPathFor(profile, webDirectory) {
  return resolve(getOwnershipDirectory(webDirectory), `${profile}.lock.json`);
}

function heavyLockPath(webDirectory) {
  return resolve(getOwnershipDirectory(webDirectory), "heavy.lock.json");
}

function buildRecord(run) {
  return {
    schemaVersion: 1,
    runId: run.runId,
    creatorProcessId: run.creatorProcessId,
    commandClass: run.commandClass,
    profile: run.profile,
    createdAt: run.createdAt,
    cleanupAuthority: run.cleanupAuthority,
    staleOwnerHandling: "reclaim-dead-owner-only",
  };
}

export function createBuildRun(profile, options = {}) {
  assertProfile(profile);
  const now = options.now ?? new Date();
  const webDirectory = canonicalWebDirectory(options.webDirectory);
  const creatorProcessId = options.processId ?? process.pid;
  if (!Number.isInteger(creatorProcessId) || creatorProcessId <= 0) {
    throw new BuildOwnershipError("Build owner process id must be a positive integer.");
  }
  const createdAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const runId = options.runId ?? `${profile}-${creatorProcessId}-${randomUUID()}`;
  return Object.freeze({
    runId,
    profile,
    commandClass: profile,
    creatorProcessId,
    createdAt,
    cleanupAuthority: `run:${runId}`,
    webDirectory,
    outputDirectory: getBuildOutputDirectory(webDirectory, profile),
  });
}

function acquireLock(path, run, isProcessAlive) {
  mkdirSync(dirname(path), { recursive: true });
  const record = buildRecord(run);
  try {
    const descriptor = openSync(path, "wx");
    try {
      writeFileSync(descriptor, JSON.stringify(record, null, 2));
    } finally {
      closeSync(descriptor);
    }
    return { reclaimedStaleOwner: false };
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
  }

  const existing = readOwnershipRecord(path);
  const existingProcessId = existing?.creatorProcessId;
  if (Number.isInteger(existingProcessId) && isProcessAlive(existingProcessId)) {
    throw new BuildOwnershipError(
      `Build ownership conflict for ${basename(path)}. Active ${String(existing.commandClass ?? "unknown")} run ${String(existing.runId ?? "unknown")} (pid ${existingProcessId}) owns this writer lock. Wait for it to finish or stop that owned process.`,
      existing
    );
  }

  try {
    unlinkSync(path);
  } catch (error) {
    if (error && typeof error === "object" && error.code !== "ENOENT") throw error;
  }
  return { reclaimedStaleOwner: true, previousRecord: existing };
}

function writeOutputOwner(run) {
  mkdirSync(run.outputDirectory, { recursive: true });
  writeFileSync(
    buildOwnerRecordPath(run.webDirectory, run.profile),
    JSON.stringify(buildRecord(run), null, 2)
  );
}

export function acquireBuildOwnership(run, dependencies = {}) {
  const isProcessAlive = dependencies.isProcessAlive ?? processIsAlive;
  const serializeHeavyweight = dependencies.serializeHeavyweight ?? true;
  const profileLockPath = lockPathFor(run.profile, run.webDirectory);
  const heavyweightLockPath = heavyLockPath(run.webDirectory);
  const profileResult = serializeHeavyweight
    ? acquireLock(profileLockPath, run, isProcessAlive)
    : { reclaimedStaleOwner: false };
  try {
    const heavyResult = serializeHeavyweight
      ? acquireLock(heavyweightLockPath, run, isProcessAlive)
      : { reclaimedStaleOwner: false };
    return Object.freeze({
      run,
      outputDirectory: run.outputDirectory,
      outputOwnerPath: buildOwnerRecordPath(run.webDirectory, run.profile),
      profileLockPath: serializeHeavyweight ? profileLockPath : undefined,
      heavyweightLockPath: serializeHeavyweight ? heavyweightLockPath : undefined,
      reclaimedStaleOwner: profileResult.reclaimedStaleOwner || heavyResult.reclaimedStaleOwner,
    });
  } catch (error) {
    try {
      unlinkSync(profileLockPath);
    } catch {
      // A concurrently reclaimed lock is not ours to remove.
    }
    throw error;
  }
}

function verifyOwnedOutput(ownership) {
  const record = readOwnershipRecord(ownership.outputOwnerPath);
  return (
    record?.profile === ownership.run.profile &&
    record?.cleanupAuthority === ownership.run.cleanupAuthority
  );
}

export function cleanPreviousProfileOutput(ownership) {
  const outputDirectory = ownership.outputDirectory;
  if (!existsSync(outputDirectory)) return false;
  const ownerPath = ownership.outputOwnerPath;
  const record = readOwnershipRecord(ownerPath);
  if (
    !record ||
    record.profile !== ownership.run.profile ||
    record.staleOwnerHandling !== "reclaim-dead-owner-only"
  ) {
    throw new BuildOwnershipError(
      `Refusing to clean ${outputDirectory}: it lacks a recognized owned-output record for profile ${ownership.run.profile}.`,
      record
    );
  }
  rmSync(outputDirectory, { recursive: true, force: false });
  return true;
}

export function initializeOwnedOutput(ownership) {
  writeOutputOwner(ownership.run);
}

export function cleanupOwnedOutput(ownership) {
  if (!existsSync(ownership.outputDirectory)) return false;
  if (!verifyOwnedOutput(ownership)) {
    throw new BuildOwnershipError(
      `Refusing to clean foreign or stale output at ${ownership.outputDirectory}.`
    );
  }
  rmSync(ownership.outputDirectory, { recursive: true, force: false });
  return true;
}

export function releaseBuildOwnership(ownership) {
  for (const path of [ownership.heavyweightLockPath, ownership.profileLockPath].filter(Boolean)) {
    const record = readOwnershipRecord(path);
    if (record?.runId !== ownership.run.runId) continue;
    try {
      unlinkSync(path);
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
    }
  }
}

function replaceHeapOption(nodeOptions, heapMb) {
  const withoutHeap = nodeOptions
    .split(/\s+/)
    .filter((option) => option.length > 0 && !option.startsWith("--max-old-space-size="));
  withoutHeap.push(`--max-old-space-size=${heapMb}`);
  return withoutHeap.join(" ");
}

export function buildProfileEnvironment(profile, base = process.env, options = {}) {
  assertProfile(profile);
  const heapMb = asPositiveInteger(
    options.heapMb ?? base.SEOVISTA_BUILD_HEAP_MB,
    "SEOVISTA_BUILD_HEAP_MB",
    DEFAULT_HEAP_MB
  );
  const minHeadroomMb = asPositiveInteger(
    options.minHeadroomMb ?? base.SEOVISTA_BUILD_MIN_HEADROOM_MB,
    "SEOVISTA_BUILD_MIN_HEADROOM_MB",
    DEFAULT_MIN_HEADROOM_MB
  );
  return {
    ...base,
    NEXT_DIST_DIR: BUILD_PROFILES[profile],
    NODE_OPTIONS: replaceHeapOption(base.NODE_OPTIONS ?? "", heapMb),
    SEOVISTA_BUILD_HEAP_MB: String(heapMb),
    SEOVISTA_BUILD_MIN_HEADROOM_MB: String(minHeadroomMb),
    SEOVISTA_BUILD_PROFILE: profile,
    SEOVISTA_BUILD_MAX_CONCURRENCY: "1",
  };
}

export function preflightBuildHeadroom(options = {}) {
  const availableMemoryBytes = options.availableMemoryBytes ?? freemem();
  const minHeadroomMb = asPositiveInteger(
    options.minHeadroomMb,
    "SEOVISTA_BUILD_MIN_HEADROOM_MB",
    DEFAULT_MIN_HEADROOM_MB
  );
  const availableMemoryMb = Math.floor(availableMemoryBytes / 1024 / 1024);
  if (
    !Number.isFinite(availableMemoryBytes) ||
    availableMemoryBytes < minHeadroomMb * 1024 * 1024
  ) {
    throw new BuildOwnershipError(
      `Insufficient host memory headroom for the isolated build: ${availableMemoryMb} MiB available, ${minHeadroomMb} MiB required. Free memory or set SEOVISTA_BUILD_MIN_HEADROOM_MB to an evidence-based safe value; canonical compilation settings were not changed.`
    );
  }
  return Object.freeze({
    availableMemoryMb,
    requiredMemoryMb: minHeadroomMb,
    heapMb: asPositiveInteger(options.heapMb, "SEOVISTA_BUILD_HEAP_MB", DEFAULT_HEAP_MB),
    maxConcurrency: 1,
    hostParallelism: availableParallelism(),
  });
}
