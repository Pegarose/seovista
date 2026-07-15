#!/usr/bin/env node
/* global process */

const [command, service] = process.argv.slice(2);

if (command !== "stop" || !["nextg-mock", "web", "worker"].includes(service)) {
  process.stderr.write("Usage: node scripts/owned-service-lifecycle.js stop <nextg-mock|web|worker>\n");
  process.exitCode = 2;
} else {
  process.stderr.write(
    `Owned stop context for ${service} is not available in Phase 1. Refusing to terminate unrelated Node processes.\n`,
  );
  process.exitCode = 1;
}
