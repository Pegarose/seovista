#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(scriptDirectory, "..");

export function buildSecretSentinelValues() {
  const seed = createHash("sha256").update("seovista-production-sentinel").digest("hex").slice(0, 20);
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
  return ["/", "/robots.txt", "/sitemap.xml", "/llms.txt", "/feed.xml", "/manifest.webmanifest", "/api/health/"];
}

export function getSentinelDistDirectory(webDirectory) {
  return resolve(webDirectory, ".next-sentinel");
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return statSync(path).isFile() ? [path] : [];
  });
}

function run(command, args, environment) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, env: environment, stdio: "pipe", windowsHide: true });
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
      reject(new Error(`Command failed with exit ${exitCode ?? "unknown"}: ${output.slice(-2000)}`));
    });
  });
}

async function waitForResponse(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return response;
    } catch {
      // The standalone server may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function scanPublicResponses(environment, sentinels) {
  const child = spawn("node", ["apps/web/server.mjs"], {
    cwd: root,
    env: { ...environment, PORT: "3100" },
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

  try {
    await waitForResponse("http://127.0.0.1:3100/");
    const findings = [];
    for (const path of getPublicResponsePaths()) {
      const response = await fetch(`http://127.0.0.1:3100${path}`, { cache: "no-store" });
      const body = await response.text();
      for (const name of findSecretSentinels(body, sentinels)) {
        findings.push(`${path}: ${name}`);
      }
    }
    for (const name of findSecretSentinels(output, sentinels)) {
      findings.push(`server-log: ${name}`);
    }
    return findings;
  } finally {
    if (!child.killed) child.kill("SIGTERM");
    await new Promise((resolveExit) => {
      child.once("close", () => resolveExit());
      setTimeout(resolveExit, 5_000).unref();
    });
  }
}

export async function runProductionSentinel() {
  const webDirectory = resolve(root, "apps/web");
  const sentinelDistDirectory = getSentinelDistDirectory(webDirectory);
  const environment = {
    ...buildSentinelEnvironment(),
    NEXT_DIST_DIR: ".next-sentinel",
    SEOVISTA_SENTINEL_BUILD: "true",
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=1536`.trim(),
  };
  await run(process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "corepack", process.platform === "win32" ? ["/d", "/s", "/c", "corepack pnpm --filter @seovista/web build"] : ["pnpm", "--filter", "@seovista/web", "build"], environment);

  const artifactRoots = getPublicScanPaths(sentinelDistDirectory);
  const files = artifactRoots.flatMap(filesUnder);
  const findings = files.flatMap((path) => {
    const matches = findSecretSentinels(readFileSync(path, "utf8"), environment);
    return matches.map((name) => `${path}: ${name}`);
  });
  findings.push(...(await scanPublicResponses(environment, environment)));

  if (findings.length > 0) {
    throw new Error(`Public sentinel leak detected:\n${findings.join("\n")}`);
  }

  process.stdout.write("Production sentinel build and runtime scan passed.\n");
}

if (process.argv[1] && process.argv[1].endsWith("production-sentinel.js")) {
  runProductionSentinel().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "production sentinel failure"}\n`);
    process.exitCode = 1;
  });
}
