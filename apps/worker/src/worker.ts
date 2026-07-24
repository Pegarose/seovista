import { env, exit, stdin, argv } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import console from "node:console";
import { createDbClient, type DbClient } from "./db/client.js";
import { createPingQueue, createPingWorker } from "./queue/ping.js";
import { startGeoWorker } from "./queue/geo-worker.js";
import { closeCacheRedis } from "./utils/render-cache.js";
import { logDailyCreditBudgetOnBoot } from "./utils/credit-guard.js";
import { getWorkerEnv, getProjectId } from "./env.js";
import { checkWorkerHealth } from "./health.js";
import type { Queue, Worker } from "bullmq";

export const workerName = "@seovista/worker";

interface RunningWorker {
  db: DbClient;
  queue: Queue;
  worker: Worker;
  geoWorker: Worker;
}

let running: RunningWorker | null = null;
let shutdownRequested = false;

function isEntryModule(): boolean {
  const modulePath = fileURLToPath(import.meta.url);
  const entryPath = argv[1] ? resolve(argv[1]) : undefined;
  return entryPath ? modulePath === entryPath : false;
}

async function run(): Promise<void> {
  const workerEnv = getWorkerEnv();
  const projectId = getProjectId(workerEnv);

  const health = await checkWorkerHealth({
    databaseUrl: workerEnv.DATABASE_URL,
    redisUrl: workerEnv.REDIS_URL,
    projectId,
  });

  if (health.readiness !== "ready") {
    console.error(
      JSON.stringify({
        name: "@seovista/worker",
        phase: "startup",
        readiness: "not_ready",
        dependencies: health.dependencies,
        timestamp: new Date().toISOString(),
      })
    );
    exit(1);
  }

  const db = createDbClient({ connectionString: workerEnv.DATABASE_URL });

  const queueOptions = {
    projectId,
    redisUrl: workerEnv.REDIS_URL,
    ...(workerEnv.SEOVISTA_QUEUE_PREFIX ? { queuePrefix: workerEnv.SEOVISTA_QUEUE_PREFIX } : {}),
    db,
  };

  const queue = createPingQueue(queueOptions);
  const worker = createPingWorker(queueOptions);
  const geoWorker = startGeoWorker();

  running = { db, queue, worker, geoWorker };

  // Phase A — VAL-A-MIT-004: on boot, log the remaining daily Browseract
  // credit budget so operators can see the daily cap state at startup. Reads
  // `browseract:credits:consumed:{YYYY-MM-DD}` from Redis DB 1 and compares
  // against `BROWSERACT_DAILY_CREDIT_LIMIT` (default 4000). Degrades to a
  // full-budget line when Redis is unreachable.
  await logDailyCreditBudgetOnBoot();

  worker.on("completed", (job) => {
    console.log(
      JSON.stringify({
        name: "@seovista/worker",
        event: "job:completed",
        queue: queue.name,
        jobId: job.id,
        timestamp: new Date().toISOString(),
      })
    );
  });

  worker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        name: "@seovista/worker",
        event: "job:failed",
        queue: queue.name,
        jobId: job?.id,
        errorClass: error.name,
        timestamp: new Date().toISOString(),
      })
    );
  });

  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      status: "started",
      projectId,
      queue: queue.name,
      timestamp: new Date().toISOString(),
    })
  );
}

async function shutdown(signal: string): Promise<void> {
  if (shutdownRequested) {
    return;
  }
  shutdownRequested = true;

  console.warn(
    JSON.stringify({
      name: "@seovista/worker",
      event: "shutdown",
      signal,
      timestamp: new Date().toISOString(),
    })
  );

  const current = running;
  running = null;

  if (current) {
    // Drain or recover: stop accepting new jobs and wait for active jobs to finish.
    await current.geoWorker.close(false);
    await current.worker.close(false);
    await current.queue.close();
    await current.db.close();
  }

  // Close the Phase A render-cache Redis client (DB 1), if one was opened.
  await closeCacheRedis();

  exit(0);
}

if (stdin.isTTY) {
  stdin.on("end", () => {
    void shutdown("stdin-end");
  });
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

if (isEntryModule() || import.meta.url === `file://${env.__WORKER_ENTRY__ ?? "src/worker.ts"}`) {
  run().catch((error) => {
    console.error(
      JSON.stringify({
        name: "@seovista/worker",
        status: "startup_failed",
        errorClass: error instanceof Error ? error.name : "unknown",
        timestamp: new Date().toISOString(),
      })
    );
    exit(1);
  });
}

export { run, shutdown };
