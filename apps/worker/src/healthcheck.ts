import { exit, env, argv } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import console from "node:console";
import { checkWorkerHealth } from "./health.js";

function isEntryModule(): boolean {
  const modulePath = fileURLToPath(import.meta.url);
  const entryPath = argv[1] ? resolve(argv[1]) : undefined;
  return entryPath ? modulePath === entryPath : false;
}

export async function main(): Promise<void> {
  const report = await checkWorkerHealth();
  const line = JSON.stringify(report);

  if (report.readiness === "ready") {
    console.log(line);
    exit(0);
  }

  console.error(line);
  exit(1);
}

if (isEntryModule() || import.meta.url === `file://${env.__HEALTHCHECK_ENTRY__ ?? "src/healthcheck.ts"}`) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        name: "@seovista/worker",
        liveness: "live",
        readiness: "not_ready",
        error: error instanceof Error ? error.name : "unknown",
        timestamp: new Date().toISOString(),
      })
    );
    exit(1);
  });
}
