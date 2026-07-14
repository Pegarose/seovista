#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  acquireBuildOwnership,
  buildProfileEnvironment,
  cleanPreviousProfileOutput,
  cleanupOwnedOutput,
  createBuildRun,
  getBuildOutputDirectory,
  initializeOwnedOutput,
  preflightBuildHeadroom,
  releaseBuildOwnership,
} from "./web-build-isolation.js";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(scriptDirectory, "..");
const webDirectory = resolve(root, "apps", "web");
const webTsconfigPath = resolve(webDirectory, "tsconfig.json");
const requireFromWeb = createRequire(resolve(webDirectory, "package.json"));
const nextBinary = requireFromWeb.resolve("next/dist/bin/next");

export function buildSecretSentinelValues() {
  const seed = createHash("sha256")
    .update("seovista-production-sentinel")
    .digest("hex")
    .slice(0, 20);
  return Object.freeze({
    DATABASE_URL: `postgresql://sentinel-user:${seed}@sentinel.invalid:55432/sentinel`,
    REDIS_URL: `redis://:${seed}@sentinel.invalid:56379/0`,
    NEXTG_API_TOKEN: `nextg-sentinel-${seed}`,
    DATAFORSEO_API_KEY: `dataforseo-sentinel-${seed}`,
    GOOGLE_CLIENT_ID: `google-client-sentinel-${seed}`,
    GOOGLE_CLIENT_SECRET: `google-secret-sentinel-${seed}`,
    OBJECT_STORAGE_ACCESS_KEY: `storage-access-sentinel-${seed}`,
    OBJECT_STORAGE_SECRET_KEY: `storage-secret-sentinel-${seed}`,
    EMAIL_PROVIDER_API_KEY: `email-sentinel-${seed}`,
    REPORT_SIGNING_SECRET: `signing-sentinel-${seed}`,
  });
}

export function buildSentinelEnvironment(base = process.env) {
  return {
    ...base,
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://seovista.com",
    NEXTG_API_URL: "http://127.0.0.1:3101",
    ...buildSecretSentinelValues(),
  };
}

export function findSecretSentinels(text, sentinels = buildSecretSentinelValues()) {
  return Object.entries(sentinels)
    .filter(([, value]) => text.includes(value))
    .map(([name]) => name);
}

export function getPublicScanPaths(nextOutputDirectory) {
  return [resolve(nextOutputDirectory, "static"), resolve(nextOutputDirectory, "server/app")];
}

export function getPublicResponsePaths() {
  return [
    "/",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/feed.xml",
    "/manifest.webmanifest",
    "/api/health/",
  ];
}

export function getSentinelDistDirectory(webDirectory) {
  return getBuildOutputDirectory(webDirectory, "sentinel");
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return statSync(path).isFile() ? [path] : [];
  });
}

function run(command, args, environment, cwd = root) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: "pipe",
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      if (exitCode === 0) {
        resolveRun(output);
        return;
      }
      reject(
        new Error(`Command failed with exit ${exitCode ?? "unknown"}: ${output.slice(-2000)}`)
      );
    });
  });
}

function scanPublicResponses(environment, sentinels, distDir) {
  const scanEnv = {
    ...environment,
    NEXT_DIST_DIR: distDir,
    SENTINEL_VALUES: JSON.stringify(sentinels),
  };
  execSync(`node ${resolve(root, "scripts/sentinel-scan.mjs")}`, {
    cwd: root,
    env: scanEnv,
    stdio: "inherit",
    timeout: 60_000,
    windowsHide: true,
  });
}

export async function runProductionSentinel() {
  const runContext = createBuildRun("sentinel", { webDirectory });
  const baseEnvironment = buildSentinelEnvironment();
  const environment = buildProfileEnvironment("sentinel", baseEnvironment);
  // The sentinel build differs from canonical only in its run-owned output path
  // and injected sentinel environment. It never reads or writes the legacy
  // .next-sentinel directory.
  environment.NEXT_DIST_DIR = runContext.outputRelativePath;
  const sentinels = buildSecretSentinelValues();

  preflightBuildHeadroom({
    minHeadroomMb: environment.SEOVISTA_BUILD_MIN_HEADROOM_MB,
    heapMb: environment.SEOVISTA_BUILD_HEAP_MB,
  });
  const ownership = acquireBuildOwnership(runContext);
  let initializedOutput = false;
  let originalTsconfig = null;

  try {
    cleanPreviousProfileOutput(ownership);
    initializeOwnedOutput(ownership);
    initializedOutput = true;
    if (existsSync(webTsconfigPath)) {
      originalTsconfig = readFileSync(webTsconfigPath, "utf8");
    }

    await run(process.execPath, [nextBinary, "build"], environment, webDirectory);

    // Next.js may have removed the run directory record during build cleanup,
    // so rewrite it before we verify ownership and scan.
    initializeOwnedOutput(ownership);

    const artifactRoots = getPublicScanPaths(runContext.outputDirectory);
    const files = artifactRoots.flatMap(filesUnder);
    const findings = files.flatMap((path) => {
      const matches = findSecretSentinels(readFileSync(path, "utf8"), sentinels);
      return matches.map((name) => `${relative(root, path)}: ${name}`);
    });
    // Runtime scan runs synchronously in a helper subprocess; it throws on
    // timeout or on any sentinel leak, so the parent never needs async I/O
    // that could let the process exit before cleanup.
    scanPublicResponses(environment, sentinels, runContext.outputRelativePath);

    if (findings.length > 0) {
      throw new Error(`Public sentinel leak detected:\n${findings.join("\n")}`);
    }

    process.stdout.write("Production sentinel build and runtime scan passed.\n");
  } finally {
    if (originalTsconfig !== null) {
      writeFileSync(webTsconfigPath, originalTsconfig);
    }
    if (initializedOutput) cleanupOwnedOutput(ownership);
    releaseBuildOwnership(ownership);
  }
}

if (process.argv[1] && process.argv[1].endsWith("scripts/production-sentinel.js")) {
  runProductionSentinel().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "production sentinel failure"}\n`
    );
    process.exitCode = 1;
  });
}
