import { env, exit, stdin, argv } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import console from "node:console";
import { createDbClient, type DbClient } from "./db/client.js";
import { createPingQueue, createPingWorker } from "./queue/ping.js";
import { getWorkerEnv, getProjectId } from "./env.js";
import { checkWorkerHealth } from "./health.js";
import type { Queue, Worker } from "bullmq";

export const workerName = "@seovista/worker";

interface RunningWorker {
  db: DbClient;
  queue: Queue;
  worker: Worker;
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
    db,
  };

  const queue = createPingQueue(queueOptions);
  const worker = createPingWorker(queueOptions);

  running = { db, queue, worker };

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
    await current.worker.close(false);
    await current.queue.close();
    await current.db.close();
  }

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
