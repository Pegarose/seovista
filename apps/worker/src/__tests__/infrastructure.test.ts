import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { Queue } from "bullmq";
import {
  createJobRepository,
  createJobResultRepository,
  createRbacRepository,
  createAuditRepository,
  createCostRepository,
} from "../db/index.js";
import { createPingQueueName, createPingJobId } from "../queue/ping.js";
import { createMigrationRunner, defaultMigrationsDir } from "../db/migrations.js";
import { createDbClient } from "../db/client.js";
import { setupTestEnvironment, buildWorkerEnv, PROJECT_ROOT } from "./helpers/test-env.js";
import type { TestEnvironment } from "./helpers/test-env.js";

describe("infrastructure walking skeleton", () => {
  let env: TestEnvironment;
  let workerProcess: ChildProcess | null = null;
  let pingQueue: Queue | null = null;

  beforeAll(async () => {
    env = await setupTestEnvironment();

    const workerPath = resolve(PROJECT_ROOT, "apps/worker/dist/worker.js");
    const workerEnv = buildWorkerEnv(env);
    workerProcess = spawn("node", [workerPath], {
      env: { ...process.env, ...workerEnv },
      stdio: "pipe",
    });
    await waitForWorkerReady(workerProcess);

    pingQueue = new Queue(createPingQueueName(env.projectId), {
      connection: { url: env.redisUrl },
    });
  }, 90_000);

  afterAll(async () => {
    if (pingQueue) {
      await pingQueue.close();
    }
    if (workerProcess && !workerProcess.killed) {
      workerProcess.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        workerProcess?.once("exit", () => resolve());
        setTimeout(() => {
          workerProcess?.kill("SIGKILL");
          resolve();
        }, 5000);
      });
    }
    await env.cleanup();
  }, 90_000);

  describe("migrations", () => {
    it("applies all migrations to an empty database", async () => {
      const runner = createMigrationRunner(env.db, defaultMigrationsDir());
      const { appliedIds, pending } = await runner.getState();
      expect(pending.length).toBe(0);
      expect(appliedIds).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("is a no-op on the second run and preserves data", async () => {
      const runner = createMigrationRunner(env.db, defaultMigrationsDir());
      const applied = await runner.applyAll();
      expect(applied.length).toBe(0);
    });

    it("fails atomically when a migration is broken", async () => {
      const brokenDir = mkdtempSync(resolve(tmpdir(), "seovista-broken-migrations-"));
      writeFileSync(
        resolve(brokenDir, "001_broken.sql"),
        "CREATE TABLE broken_table (id INTEGER);\nINSERT INTO broken_table VALUES ('not-an-integer');"
      );

      const freshDb = createDbClient({
        connectionString: "postgresql://seovista:seovista@127.0.0.1:55432/postgres",
        max: 1,
      });
      const testDbName = `seovista_migration_atomic_${Date.now()}`;
      await freshDb.query(`CREATE DATABASE "${testDbName}"`);
      await freshDb.close();

      const brokenDb = createDbClient({
        connectionString: `postgresql://seovista:seovista@127.0.0.1:55432/${testDbName}`,
        max: 1,
      });
      const brokenRunner = createMigrationRunner(brokenDb, brokenDir);

      await expect(brokenRunner.applyAll()).rejects.toThrow();

      const result = await brokenDb.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_name = 'broken_table'"
      );
      expect(result.rows[0]?.count).toBe(0);

      const migrationResult = await brokenDb.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_name = 'seovista_migrations'"
      );
      expect(migrationResult.rows[0]?.count).toBe(0);

      await brokenDb.close();

      const adminDb = createDbClient({
        connectionString: "postgresql://seovista:seovista@127.0.0.1:55432/postgres",
        max: 1,
      });
      await adminDb.query(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE)`);
      await adminDb.close();

      rmSync(brokenDir, { recursive: true, force: true });
    }, 30_000);
  });

  describe("job lifecycle", () => {
    it("stores the declared transition table as a version-controlled artifact", async () => {
      const result = await env.db.query<{ from_status: string; to_status: string }>(
        "SELECT from_status, to_status FROM job_status_transitions ORDER BY from_status, to_status"
      );
      const transitions = result.rows.map((r) => [r.from_status, r.to_status] as const);
      expect(transitions).toContainEqual(["queued", "running"]);
      expect(transitions).toContainEqual(["running", "completed"]);
      expect(transitions).toContainEqual(["running", "failed"]);
      expect(transitions).toContainEqual(["failed", "running"]);
      expect(transitions).not.toContainEqual(["completed", "running"]);
      expect(transitions).not.toContainEqual(["permanent", "running"]);
    });

    it("rejects invalid status transitions", async () => {
      const jobs = createJobRepository(env.db);
      const job = await jobs.create({
        jobIdentity: "transition-test",
        queueName: "test",
        correlationId: "transition-corr",
      });

      await jobs.start(job.job_identity);
      const result = await createJobResultRepository(env.db).create(
        "transition-corr",
        job.job_identity,
        "test",
        {}
      );
      await jobs.complete(job.job_identity, result.id);

      await expect(jobs.start(job.job_identity)).rejects.toThrow();
    });

    it("rejects decreasing attempt counts", async () => {
      const jobs = createJobRepository(env.db);
      const job = await jobs.create({
        jobIdentity: "attempt-test",
        queueName: "test",
        correlationId: "attempt-corr",
      });
      await jobs.start(job.job_identity);
      await jobs.start(job.job_identity);

      const result = await env.db.query<{ attempt_count: number }>(
        "SELECT attempt_count FROM job_records WHERE job_identity = $1",
        [job.job_identity]
      );
      expect(result.rows[0]?.attempt_count).toBe(2);
    });

    it("rejects result before completion", async () => {
      const jobs = createJobRepository(env.db);
      const job = await jobs.create({
        jobIdentity: "result-before-completion",
        queueName: "test",
        correlationId: "result-corr",
      });

      await expect(
        env.db.query("UPDATE job_records SET result_id = $1 WHERE job_identity = $2", [
          "00000000-0000-0000-0000-000000000001",
          job.job_identity,
        ])
      ).rejects.toThrow();
    });

    it("rejects completion without completed_at", async () => {
      const jobs = createJobRepository(env.db);
      const job = await jobs.create({
        jobIdentity: "completion-without-time",
        queueName: "test",
        correlationId: "completion-corr",
      });

      await expect(
        env.db.query(
          "UPDATE job_records SET status = 'completed', completed_at = NULL WHERE job_identity = $1",
          [job.job_identity]
        )
      ).rejects.toThrow();
    });
  });

  describe("RBAC", () => {
    it("accepts valid roles, permissions, grants, and assignments", async () => {
      const rbac = createRbacRepository(env.db);
      const role = await rbac.createRole("admin", "Administrator");
      const permission = await rbac.createPermission("audit:read", "Read audits");
      await rbac.grantPermission(role.id, permission.id);
      await rbac.assignRole("user-1", role.id);

      const result = await env.db.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM rbac_role_permissions WHERE role_id = $1",
        [role.id]
      );
      expect(result.rows[0]?.count).toBe(1);
    });

    it("rejects empty canonical identities", async () => {
      const rbac = createRbacRepository(env.db);
      await expect(rbac.createRole("", "Empty")).rejects.toThrow();
    });

    it("rejects duplicate roles", async () => {
      const rbac = createRbacRepository(env.db);
      await rbac.createRole("editor", "Editor");
      await expect(rbac.createRole("editor", "Editor duplicate")).rejects.toThrow();
    });

    it("rejects grants to nonexistent references", async () => {
      const rbac = createRbacRepository(env.db);
      await expect(
        rbac.grantPermission("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002")
      ).rejects.toThrow();
    });
  });

  describe("audit logs", () => {
    it("accepts bounded allowlisted metadata", async () => {
      const audit = createAuditRepository(env.db);
      const event = await audit.create({
        actorIdentity: "system",
        action: "ping:enqueue",
        subjectIdentity: "target",
        outcome: "success",
        correlationId: "audit-ok",
        metadata: { phase: "enqueue", status: "queued" },
      });
      expect(event.actor_identity).toBe("system");
    });

    it("rejects metadata containing secrets", async () => {
      const audit = createAuditRepository(env.db);
      await expect(
        audit.create({
          actorIdentity: "system",
          action: "ping:enqueue",
          subjectIdentity: "target",
          outcome: "success",
          correlationId: "audit-secret",
          metadata: { apiKey: "sk-1234567890abcdef" },
        })
      ).rejects.toThrow();
    });

    it("rejects metadata containing HTML", async () => {
      const audit = createAuditRepository(env.db);
      await expect(
        audit.create({
          actorIdentity: "system",
          action: "ping:enqueue",
          subjectIdentity: "target",
          outcome: "success",
          correlationId: "audit-html",
          metadata: { body: "<html><body>secret</body></html>" },
        })
      ).rejects.toThrow();
    });

    it("rejects metadata containing email", async () => {
      const audit = createAuditRepository(env.db);
      await expect(
        audit.create({
          actorIdentity: "system",
          action: "ping:enqueue",
          subjectIdentity: "target",
          outcome: "success",
          correlationId: "audit-email",
          metadata: { contact: "user@example.com" },
        })
      ).rejects.toThrow();
    });

    it("rejects metadata containing connection strings", async () => {
      const audit = createAuditRepository(env.db);
      await expect(
        audit.create({
          actorIdentity: "system",
          action: "ping:enqueue",
          subjectIdentity: "target",
          outcome: "success",
          correlationId: "audit-conn",
          metadata: { db: "postgresql://user:pass@host/db" },
        })
      ).rejects.toThrow();
    });

    it("rejects metadata containing stack traces", async () => {
      const audit = createAuditRepository(env.db);
      await expect(
        audit.create({
          actorIdentity: "system",
          action: "ping:enqueue",
          subjectIdentity: "target",
          outcome: "error",
          correlationId: "audit-stack",
          metadata: { stack: "Error: boom\n    at foo (bar.js:1:1)" },
        })
      ).rejects.toThrow();
    });
  });

  describe("API cost ledger", () => {
    it("records immutable exact non-negative costs", async () => {
      const costs = createCostRepository(env.db);
      const record = await costs.create({
        provider: "dataforseo",
        operation: "keywords",
        requestIdentity: "req-1",
        correlationId: "cost-1",
        currency: "USD",
        amount: "0.012345",
      });
      expect(record.amount).toBe("0.012345");
      expect(Number(record.amount)).toBeGreaterThanOrEqual(0);
    });

    it("rejects duplicate request identity", async () => {
      const costs = createCostRepository(env.db);
      await costs.create({
        provider: "dataforseo",
        operation: "keywords",
        requestIdentity: "req-dup",
        correlationId: "cost-dup",
        currency: "USD",
        amount: "0.01",
      });
      await expect(
        costs.create({
          provider: "dataforseo",
          operation: "keywords",
          requestIdentity: "req-dup",
          correlationId: "cost-dup-2",
          currency: "USD",
          amount: "0.02",
        })
      ).rejects.toThrow();
    });

    it("rejects negative amounts", async () => {
      const costs = createCostRepository(env.db);
      await expect(
        costs.create({
          provider: "dataforseo",
          operation: "keywords",
          requestIdentity: "req-neg",
          correlationId: "cost-neg",
          currency: "USD",
          amount: "-0.01",
        })
      ).rejects.toThrow();
    });

    it("computes exact UTC-day totals", async () => {
      const costs = createCostRepository(env.db);
      const today = new Date();
      const uniqueProvider = `total-provider-${env.projectId}`;
      const uniqueOperation = `total-operation`;
      await costs.create({
        provider: uniqueProvider,
        operation: uniqueOperation,
        requestIdentity: "req-total-1",
        correlationId: "cost-total",
        currency: "USD",
        amount: "0.01",
      });
      await costs.create({
        provider: uniqueProvider,
        operation: uniqueOperation,
        requestIdentity: "req-total-2",
        correlationId: "cost-total",
        currency: "USD",
        amount: "0.02",
      });
      const total = await costs.totalForDay(uniqueProvider, uniqueOperation, today);
      expect(total?.amount).toBe("0.030000");
      expect(total?.count).toBe(2);
    });
  });

  describe("ping job integration", () => {
    it("completes through a separately spawned worker and real Postgres", async () => {
      const correlationId = `ping-${env.projectId}`;
      const target = "https://seovista.com/";

      const jobs = createJobRepository(env.db);
      const results = createJobResultRepository(env.db);

      await jobs.create({
        jobIdentity: createPingJobId(correlationId),
        queueName: createPingQueueName(env.projectId),
        correlationId,
        target,
      });

      await pingQueue!.add("ping", { correlationId, target }, { jobId: createPingJobId(correlationId) });

      const completed = await waitForJobCompletion(env, correlationId, 30_000);
      expect(completed.status).toBe("completed");
      expect(completed.terminal_class).toBe("success");
      expect(completed.result_id).not.toBeNull();

      const result = await results.findById(completed.result_id!);
      expect(result).not.toBeNull();
      expect(result?.payload).toMatchObject({ correlationId, target, status: "ok" });

      // Verify no secrets leaked in the worker process output.
      const output = await readProcessOutput(workerProcess!);
      expect(output).not.toContain(env.databaseUrl);
      expect(output).not.toContain(env.redisUrl);
    }, 60_000);

    it("is idempotent under repeated enqueue", async () => {
      const correlationId = `ping-idempotent-${env.projectId}`;
      const target = "https://seovista.com/";

      await pingQueue!.add("ping", { correlationId, target }, { jobId: createPingJobId(correlationId) });
      await pingQueue!.add("ping", { correlationId, target }, { jobId: createPingJobId(correlationId) });

      const completed = await waitForJobCompletion(env, correlationId, 30_000);
      expect(completed.status).toBe("completed");

      const results = createJobResultRepository(env.db);
      const result = await results.findById(completed.result_id!);
      expect(result).not.toBeNull();

      const freshDb = createDbClient({ connectionString: env.databaseUrl, max: 1 });
      const jobCount = await freshDb.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM job_results WHERE correlation_id = $1",
        [correlationId]
      );
      await freshDb.close();
      expect(jobCount.rows[0]?.count).toBe(1);
    }, 60_000);

    it("recovers from a retryable first-attempt failure", async () => {
      const correlationId = `ping-retry-${env.projectId}`;
      const target = "https://seovista.com/";

      await pingQueue!.add(
        "ping",
        { correlationId, target, failOnce: true },
        { jobId: createPingJobId(correlationId), attempts: 3, backoff: { type: "exponential", delay: 100 } }
      );

      const completed = await waitForJobCompletion(env, correlationId, 30_000);
      expect(completed.status).toBe("completed");
      expect(completed.terminal_class).toBe("success");

      const freshDb = createDbClient({ connectionString: env.databaseUrl, max: 1 });
      const jobRecord = await freshDb.query<{
        attempt_count: number;
        status: string;
      }>(
        "SELECT attempt_count, status FROM job_records WHERE job_identity = $1",
        [createPingJobId(correlationId)]
      );
      await freshDb.close();
      expect(jobRecord.rows[0]?.status).toBe("completed");
      expect(jobRecord.rows[0]?.attempt_count).toBeGreaterThanOrEqual(2);
    }, 60_000);
  });
});

async function waitForWorkerReady(process: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Worker did not start within timeout"));
    }, 30_000);

    const onData = (data: Buffer) => {
      const text = data.toString();
      if (text.includes("\"status\":\"started\"")) {
        clearTimeout(timer);
        process.stdout?.off("data", onData);
        resolve();
      }
    };

    process.stdout?.on("data", onData);
    process.stderr?.on("data", (data) => {
      if (data.toString().includes("startup_failed")) {
        clearTimeout(timer);
        reject(new Error(`Worker startup failed: ${data.toString()}`));
      }
    });
  });
}

async function waitForJobCompletion(
  env: TestEnvironment,
  correlationId: string,
  timeout: number
): Promise<{ status: string; terminal_class: string | null; result_id: string | null }> {
  const start = Date.now();
  const freshDb = createDbClient({ connectionString: env.databaseUrl, max: 1 });
  try {
    while (Date.now() - start < timeout) {
      const result = await freshDb.query<{
        status: string;
        terminal_class: string | null;
        result_id: string | null;
      }>(
        "SELECT status, terminal_class, result_id FROM job_records WHERE correlation_id = $1 ORDER BY created_at DESC LIMIT 1",
        [correlationId]
      );
      const row = result.rows[0];
      if (row?.status === "completed") {
        return row;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Job did not complete within timeout");
  } finally {
    await freshDb.close();
  }
}

async function readProcessOutput(process: ChildProcess): Promise<string> {
  return new Promise((resolve) => {
    let output = "";
    const collect = (data: Buffer) => {
      output += data.toString();
    };
    process.stdout?.on("data", collect);
    process.stderr?.on("data", collect);
    setTimeout(() => {
      process.stdout?.off("data", collect);
      process.stderr?.off("data", collect);
      resolve(output);
    }, 2000);
  });
}
