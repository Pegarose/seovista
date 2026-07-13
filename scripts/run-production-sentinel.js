#!/usr/bin/env node

import { runProductionSentinel } from "./production-sentinel.js";

runProductionSentinel().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "production sentinel failure"}\n`);
  process.exitCode = 1;
});
