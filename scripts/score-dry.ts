#!/usr/bin/env node
/**
 * SeoVista — Dry-run scoring CLI (`VAL-A-VAR-001`).
 *
 * Runs the deterministic scoring engine on a pre-built `ParsedPage` JSON
 * fixture WITHOUT invoking the fetcher, Browseract, or NeuronWriter. Produces
 * the deterministic 0-100 score (and module breakdown) as JSON on stdout.
 * The same fixture input produces byte-identical stdout across runs.
 *
 * Usage:
 *   pnpm score:dry fixtures/example.com.json
 *
 * Exit codes:
 *   0 — success, JSON written to stdout
 *   1 — scoring failure
 *   2 — usage / fixture read / parse error
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runDryScore } from "../packages/geo-engine/src/dry-run.js";
import type { ParsedPage } from "../packages/geo-engine/src/types.js";

function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

async function main(): Promise<void> {
  const fixtureArg = process.argv[2];
  if (!fixtureArg) {
    fail("Usage: pnpm score:dry <fixture-path>", 2);
  }

  const fixturePath = resolve(process.cwd(), fixtureArg);

  let raw: string;
  try {
    raw = readFileSync(fixturePath, "utf-8");
  } catch (err) {
    fail(
      `Failed to read fixture: ${fixturePath} (${err instanceof Error ? err.message : String(err)})`,
      2,
    );
  }

  let parsedPage: ParsedPage;
  try {
    parsedPage = JSON.parse(raw) as ParsedPage;
  } catch (err) {
    fail(
      `Fixture is not valid JSON: ${fixturePath} (${err instanceof Error ? err.message : String(err)})`,
      2,
    );
  }

  const output = await runDryScore(parsedPage, {
    url: parsedPage.canonical,
  });

  // Stable, pretty-printed JSON. Object key insertion order is deterministic,
  // array order is deterministic, and no time-derived fields are included —
  // so repeated runs on the same fixture produce byte-identical stdout.
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

// Ensure the module is actually invoked as a script (not imported).
main().catch((err) => {
  fail(
    `Dry-run scoring failed: ${err instanceof Error ? err.message : String(err)}`,
    1,
  );
});
