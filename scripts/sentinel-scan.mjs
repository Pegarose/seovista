#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import { setTimeout } from "node:timers";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webDirectory = resolve(root, "apps", "web");

const distDir = process.env.NEXT_DIST_DIR;
const sentinels = JSON.parse(process.env.SENTINEL_VALUES ?? "{}");

const resolvedDistDir = resolve(webDirectory, distDir ?? ".next");
if (!existsSync(resolve(resolvedDistDir, "BUILD_ID"))) {
  process.stderr.write(`Cannot find BUILD_ID in ${resolvedDistDir}\n`);
  process.exit(1);
}

const publicPaths = [
  "/",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/feed.xml",
  "/manifest.webmanifest",
  "/api/health/",
];

async function waitForResponse(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return response;
    } catch {
      // The standalone server may still be starting.
    }
    await setTimeoutPromise(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const childEnv = { ...process.env, PORT: "3100", NEXT_DIST_DIR: distDir };
delete childEnv.NODE_OPTIONS;
for (const key of Object.keys(sentinels)) {
  delete childEnv[key];
}
for (const key of Object.keys(childEnv)) {
  if (key.startsWith("SEOVISTA_")) delete childEnv[key];
}

const child = spawn("node", ["node_modules/next/dist/bin/next", "start"], {
  cwd: webDirectory,
  env: childEnv,
  stdio: "inherit",
  windowsHide: true,
});

let exitCode = 0;

try {
  await waitForResponse("http://127.0.0.1:3100/", 30_000);
  const findings = [];
  for (const path of publicPaths) {
    const response = await fetch(`http://127.0.0.1:3100${path}`, { cache: "no-store" });
    const body = await response.text();
    for (const [name, value] of Object.entries(sentinels)) {
      if (body.includes(value)) findings.push(`${path}: ${name}`);
    }
  }
  if (findings.length > 0) {
    process.stderr.write(`Public sentinel leak detected:\n${findings.join("\n")}\n`);
    exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`Sentinel scan failed: ${error instanceof Error ? error.message : String(error)}\n`);
  exitCode = 1;
} finally {
  if (!child.killed) child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    child.once("close", () => resolveExit());
    setTimeout(resolveExit, 5_000).unref();
  });
}

process.exit(exitCode);
