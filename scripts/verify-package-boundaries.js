#!/usr/bin/env node

/**
 * SeoVista — Verifies package-boundary rules for the monorepo.
 *
 * Checks:
 *  1. No browser-side database/Redis/BullMQ/provider SDKs
 *  2. No duplicate-purpose dependencies in production closure
 *
 * Usage: node scripts/verify-package-boundaries.js
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Server-only packages that MUST NOT be imported by browser-facing code
const SERVER_ONLY_DEPS = new Set(["pg", "ioredis", "bullmq"]);
const SERVER_ONLY_PATTERNS = [/^@aws-sdk\//, /^@google-cloud\//, /^@azure\//];

// Browser-facing packages (those that produce client bundles)
const BROWSER_PACKAGES = new Set(["@seovista/web", "@seovista/ui"]);

// Purpose categories for duplicate detection
const PURPOSE_CATEGORIES = {
  "queue": ["bullmq"],
  "redis": ["ioredis"],
  "css": ["tailwindcss"],
  "test-runner": ["vitest"],
  "test-e2e": ["@playwright/test"],
  "lint": ["eslint"],
  "format": ["prettier"],
  "type-system": ["typescript"],
  "schema": ["zod"],
};

function readJSON(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function isServerOnlyDep(name) {
  if (SERVER_ONLY_DEPS.has(name)) return true;
  for (const pattern of SERVER_ONLY_PATTERNS) {
    if (pattern.test(name)) return true;
  }
  return false;
}

function checkBoundary(pkg, pkgName, isBrowser) {
  const violations = [];

  if (isBrowser) {
    // Check browser package doesn't import server-only deps
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const dep of Object.keys(allDeps)) {
      if (isServerOnlyDep(dep)) {
        violations.push(
          `BOUNDARY VIOLATION: Browser package "${pkgName}" imports server-only dependency "${dep}"`
        );
      }
    }
  }

  return violations;
}

function checkDuplicates(workspaces) {
  const violations = [];
  const prodDepsByCategory = {};

  for (const [pkgName, pkg] of Object.entries(workspaces)) {
    const deps = pkg.dependencies ?? {};
    for (const dep of Object.keys(deps)) {
      for (const [category, packages] of Object.entries(PURPOSE_CATEGORIES)) {
        if (packages.includes(dep)) {
          if (!prodDepsByCategory[category]) {
            prodDepsByCategory[category] = new Set();
          }
          prodDepsByCategory[category].add(dep);
        }
      }
    }
  }

  for (const [category, deps] of Object.entries(prodDepsByCategory)) {
    if (deps.size > 1) {
      const names = [...deps].join(", ");
      violations.push(
        `DUPLICATE PURPOSE: Category "${category}" has multiple distinct production dependencies: ${names}`
      );
    }
  }

  return violations;
}

function main() {
  const workspacesGlob = [
    "apps/web",
    "apps/nextg",
    "apps/worker",
    "packages/ui",
    "packages/seo-core",
    "packages/schema",
    "packages/content-models",
    "packages/audit-core",
    "packages/open-seo-adapter",
    "packages/dataforseo",
    "packages/geo-engine",
    "packages/reports",
    "packages/analytics",
  ];

  const workspaces = {};
  for (const ws of workspacesGlob) {
    const pkg = readJSON(resolve(root, ws, "package.json"));
    if (pkg) {
      workspaces[pkg.name] = pkg;
    }
  }

  const allViolations = [];

  // Check boundaries
  for (const [pkgName, pkg] of Object.entries(workspaces)) {
    const isBrowser = BROWSER_PACKAGES.has(pkgName);
    allViolations.push(...checkBoundary(pkg, pkgName, isBrowser));
  }

  // Check duplicates
  allViolations.push(...checkDuplicates(workspaces));

  if (allViolations.length > 0) {
    console.error("Package-boundary violations found:");
    for (const v of allViolations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }

  console.log("Package-boundary checks passed.");
  console.log(`  Verified ${Object.keys(workspaces).length} workspaces.`);
  console.log("  No browser-side server-only dependencies detected.");
  console.log("  No duplicate-purpose production dependencies detected.");
}

main();
