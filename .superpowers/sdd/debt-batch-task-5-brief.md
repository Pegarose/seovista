## Task 5: M2 — crew-report-worker handler extraction + tests

**Files:**
- Modify: `apps/worker/src/queue/crew-report-worker.ts`
- Create: `apps/worker/src/__tests__/crew-report-worker.test.ts`

**Interfaces:**
- Produces: `processCrewReportJob(data, deps)` and `CrewReportJobDeps` exported from `crew-report-worker.ts`

- [ ] **Step 1: Write the failing test file**

Create `apps/worker/src/__tests__/crew-report-worker.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  processCrewReportJob,
  type CrewReportDb,
} from "../queue/crew-report-worker.js";
import { CrewAgencyError, type CrewAgencyClient } from "../utils/crew-agency-client.js";
import { CREW_REPORT_JOB_RECORD_QUEUE_NAME } from "../queue/crew-report-submission.js";

/** Minimal DB contract used by the extracted handler and its fake. */
type TestDbRow = Record<string, unknown>;

/** Builds a fake db whose `query` returns rows queued by SQL-substring match. */
function makeFakeDb(
  responses: Array<{ match: string; rows: TestDbRow[] }>,
): { db: CrewReportDb; calls: Array<{ text: string; params?: readonly unknown[] }> } {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const queue = [...responses];
  const db: CrewReportDb = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      const idx = queue.findIndex((r) => text.includes(r.match));
      if (idx === -1) return { rows: [] };
      const { rows } = queue.splice(idx, 1)[0]!;
      return { rows };
    }) as CrewReportDb["query"],
  };
  return { db, calls };
}

function makeFakeClient(overrides: Partial<CrewAgencyClient> = {}): CrewAgencyClient {
  return {
    kickoff: vi.fn(async () => ({ jobId: "crew-job-1" })),
    getJob: vi.fn(async () => ({ status: "completed", result: "# Report\ncontent" })),
    ...overrides,
  } as unknown as CrewAgencyClient;
}

const instantSleep = vi.fn(async () => undefined);

const baseData = { jobId: "job-1", sourceJobId: "src-1", tool: "geo-readiness" as const };

/** Standard source-payload + job-record responses for a happy path. */
function happyPathResponses() {
  return [
    {
      match: "JOIN job_results r",
      rows: [{ payload: { score: 50 }, source_target: "https://example.com" }],
    },
    {
      match: "SELECT job_identity, correlation_id",
      rows: [{ job_identity: "id-1", correlation_id: "corr-1" }],
    },
    { match: "INSERT INTO job_results", rows: [{ id: "result-1" }] },
  ];
}

describe("processCrewReportJob", () => {
  it("happy path: saves result and marks job completed", async () => {
    const { db, calls } = makeFakeDb(happyPathResponses());
    const client = makeFakeClient();

    await processCrewReportJob(baseData, { db, client, sleep: instantSleep });

    // running update
    expect(calls.some((c) => c.text.includes("status = 'running'"))).toBe(true);
    // source join
    expect(calls.some((c) => c.text.includes("JOIN job_results r"))).toBe(true);
    // result insert
    expect(calls.some((c) => c.text.includes("INSERT INTO job_results"))).toBe(true);
    // completed update with result_id
    const completed = calls.find((c) => c.text.includes("status = 'completed'"));
    expect(completed).toBeDefined();
    expect(completed?.params).toContain("result-1");
  });

  it("maps misconfigured CrewAgency to permanent", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
    ]);
    // No client passed + resolveCrewAgencyClient returns null — but we inject
    // a null client to simulate misconfiguration directly.
    await expect(
      processCrewReportJob(baseData, { db, client: null, sleep: instantSleep }),
    ).rejects.toThrow();
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("permanent");
  });

  it("maps unknown tool to permanent", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
    ]);
    const client = makeFakeClient();
    await expect(
      processCrewReportJob(
        { jobId: "job-1", sourceJobId: "src-1", tool: "bogus" as never },
        { db, client, sleep: instantSleep },
      ),
    ).rejects.toThrow(/Unknown crew report tool/);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("permanent");
  });

  it("maps missing source payload to permanent", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
      { match: "JOIN job_results r", rows: [] }, // no source row
    ]);
    const client = makeFakeClient();
    await expect(
      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
    ).rejects.toThrow(/Source payload not found/);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("permanent");
  });

  it("maps a failed CrewAgency job to failed", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
      { match: "JOIN job_results r", rows: [{ payload: {}, source_target: "x" }] },
    ]);
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "failed", error: "boom" })) as never,
    });
    await expect(
      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
    ).rejects.toThrow(/CrewAgency job.*failed/);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("failed");
  });

  it("maps poll ceiling to timeout", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
      { match: "JOIN job_results r", rows: [{ payload: {}, source_target: "x" }] },
    ]);
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "running" })) as never, // never terminal
    });
    await expect(
      processCrewReportJob(baseData, {
        db,
        client,
        sleep: instantSleep,
        pollCeilingMs: 0, // immediately exceeds ceiling
      }),
    ).rejects.toThrow(CrewAgencyError);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("timeout");
  });

  it("extracts markdown from a plain string result", async () => {
    const { db } = makeFakeDb(happyPathResponses());
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "completed", result: "plain markdown body" })) as never,
    });
    await expect(processCrewReportJob(baseData, { db, client, sleep: instantSleep })).resolves.toBeUndefined();
  });

  it.each([
    ["markdown", { markdown: "# via markdown" }],
    ["reportMarkdown", { reportMarkdown: "# via reportMarkdown" }],
    ["report", { report: "# via report" }],
  ])("extracts markdown from {%s} key", async (_key, result) => {
    const { db } = makeFakeDb(happyPathResponses());
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "completed", result })) as never,
    });
    await expect(processCrewReportJob(baseData, { db, client, sleep: instantSleep })).resolves.toBeUndefined();
  });

  it("maps empty/whitespace result to crew.unavailable → timeout", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
      { match: "JOIN job_results r", rows: [{ payload: {}, source_target: "x" }] },
    ]);
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "completed", result: "   " })) as never,
    });
    await expect(
      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
    ).rejects.toThrow(CrewAgencyError);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("timeout");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/crew-report-worker.test.ts
```
Expected: FAIL — `processCrewReportJob` is not exported.

- [ ] **Step 3: Extract the handler in crew-report-worker.ts**

In `apps/worker/src/queue/crew-report-worker.ts`, extract the BullMQ processor callback into a new exported function `processCrewReportJob`. The `startCrewReportWorker` function keeps the `Worker` construction, env reads, `parseRedisUrl`, and `resolveCrewAgencyClient`/`options` wiring, and delegates its job callback to `processCrewReportJob` with the resolved deps.

Add the new types and function. Place the `CrewReportJobDeps` interface and `processCrewReportJob` function above `startCrewReportWorker`:

```ts
export interface CrewReportDb {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: readonly Record<string, unknown>[] }>;
}

export interface CrewReportJobDeps {
  db: CrewReportDb;
  client: CrewAgencyClient | null;
  sleep: (ms: number) => Promise<void>;
  /** Poll ceiling override; defaults to the module POLL_CEILING_MS (10 min). */
  pollCeilingMs?: number;
  /** Poll interval override; defaults to the module POLL_INTERVAL_MS (5 s). */
  pollIntervalMs?: number;
}

/**
 * Pure job-processing logic extracted from the BullMQ Worker callback so it
 * can be unit-tested with a fake db, mock client, and instant sleep. The
 * terminal-status mapping (catch block) lives here so every error path is
 * testable. `startCrewReportWorker` is thin wiring that resolves deps from
 * env/options and delegates here.
 */
export async function processCrewReportJob(
  data: { jobId: string; sourceJobId: string; tool: CrewReportTool },
  deps: CrewReportJobDeps,
): Promise<void> {
  const { jobId, sourceJobId, tool } = data;
  const { db, client, sleep } = deps;
  const pollCeilingMs = deps.pollCeilingMs ?? POLL_CEILING_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;

  try {
    await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

    // Fail closed when CrewAgency is not configured: a null client maps to a
    // permanent 'crew.misconfigured' failure (no retry can fix configuration).
    if (!client) {
      throw new CrewAgencyError(
        "crew.misconfigured",
        "CrewAgency is not configured: CREW_AGENCY_API_URL and CREW_AGENCY_API_KEY must both be set",
      );
    }

    const sourceQueueName = TOOL_QUEUE_NAMES[tool];
    if (!sourceQueueName) {
      throw permanentCrewReportError(
        `Unknown crew report tool '${String(tool)}' on job ${jobId}`,
      );
    }

    const sourceRes = await db.query(
      `SELECT r.payload, j.target AS source_target FROM job_records j JOIN job_results r ON r.correlation_id = j.correlation_id WHERE j.id = $1 AND j.queue_name = $2 ORDER BY r.created_at DESC LIMIT 1`,
      [sourceJobId, sourceQueueName]
    );
    const sourceRow = sourceRes.rows[0];
    if (!sourceRow) {
      throw permanentCrewReportError(
        `Source payload not found for crew report job ${jobId}: no ${sourceQueueName} result for source job ${sourceJobId}`,
      );
    }

    const request = buildCrewReportRequest({
      tool,
      sourcePayload: sourceRow.payload,
      sourceTarget:
        typeof sourceRow.source_target === "string" ? sourceRow.source_target : undefined,
    });
    const { jobId: crewJobId } = await client.kickoff(request.endpoint, request.body);

    const crewStatus = await pollCrewJobUntilTerminal(client, crewJobId, sleep, pollCeilingMs, pollIntervalMs);

    if (crewStatus.status === "failed") {
      throw new Error(
        `CrewAgency job ${crewJobId} failed: ${crewStatus.error ?? "no error detail returned"}`,
      );
    }

    const reportMarkdown = extractReportMarkdown(crewStatus.result);
    if (!reportMarkdown) {
      throw new CrewAgencyError(
        "crew.unavailable",
        `CrewAgency job ${crewJobId} completed without markdown report content`,
      );
    }

    const result = buildCrewReportResultPayload({
      sourceJobId,
      tool,
      endpoint: request.endpoint,
      reportMarkdown,
      crewJobId,
    });

    const jobRecordRes = await db.query(
      `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
      [jobId, CREW_REPORT_JOB_RECORD_QUEUE_NAME]
    );
    const rawJobRecord = jobRecordRes.rows[0];
    if (!rawJobRecord) {
      throw new Error(`Job record ${jobId} not found during result saving.`);
    }
    const { job_identity, correlation_id } = rawJobRecord;

    const jobResultRes = await db.query(
      `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
       VALUES ($1, $2, 'crew-report:result', $3) RETURNING id`,
      [correlation_id, job_identity, JSON.stringify(result)]
    );
    const rawResultRes = jobResultRes.rows[0];
    if (!rawResultRes) {
      throw new Error(`Failed to return result ID after crew report job save.`);
    }

    const resultId = rawResultRes.id;

    await db.query(
      `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
      [jobId, resultId]
    );
  } catch (err) {
    console.error("Crew report worker failed job:", err);
    let terminalStatus = 'failed';

    if (err instanceof CrewAgencyError) {
      if (
        err.code === "crew.auth" ||
        err.code === "crew.misconfigured" ||
        err.code === "crew.client_error"
      ) {
        terminalStatus = 'permanent';
      } else {
        terminalStatus = 'timeout';
      }
    } else if (typeof err === 'object' && err !== null && 'code' in err) {
      const code = err.code;
      if (typeof code === 'string' && code.startsWith('validation.')) {
        terminalStatus = 'permanent';
      }
    }

    await db.query(`UPDATE job_records SET status = $2, updated_at = now() WHERE id = $1`, [jobId, terminalStatus]);
    throw err;
  }
}
```

Update `pollCrewJobUntilTerminal` to accept the ceiling and interval as parameters:

```ts
async function pollCrewJobUntilTerminal(
  client: CrewAgencyClient,
  crewJobId: string,
  sleep: (ms: number) => Promise<void>,
  pollCeilingMs: number = POLL_CEILING_MS,
  pollIntervalMs: number = POLL_INTERVAL_MS,
): Promise<CrewJobStatus> {
  const startedAt = Date.now();
  for (;;) {
    const status = await client.getJob(crewJobId);
    if (status.status === "completed" || status.status === "failed") {
      return status;
    }
    if (Date.now() - startedAt >= pollCeilingMs) {
      throw new CrewAgencyError(
        "crew.timeout",
        `CrewAgency job ${crewJobId} did not reach a terminal state within ${pollCeilingMs}ms`,
      );
    }
    await sleep(pollIntervalMs);
  }
}
```

Update `startCrewReportWorker`'s `Worker` callback to delegate to `processCrewReportJob`. Replace the entire `async (job: Job) => { ... }` callback body with:

```ts
    async (job: Job) => {
      const { jobId, sourceJobId, tool } = job.data as {
        jobId: string;
        sourceJobId: string;
        tool: CrewReportTool;
      };

      const client = options?.client ?? resolveCrewAgencyClient();
      const sleep = options?.sleep ?? defaultSleep;
      await processCrewReportJob(
        { jobId, sourceJobId, tool },
        { db, client, sleep },
      );
    },
```

The null-client guard belongs inside `processCrewReportJob` (shown above), where it maps `crew.misconfigured` to the permanent terminal status and is directly covered by the unit test. The BullMQ callback only resolves the client and delegates to the handler, so it does not duplicate the guard. The `console` import at the top of the file (`import console from "node:console"`) stays because `console.error` in the handler catch and worker close callback are allowed by the ESLint config.

- [ ] **Step 4: Run the test to verify it passes**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/crew-report-worker.test.ts
```
Expected: PASS — all 9 test groups green (the markdown-key table is one group with three parameterized cases). If a test fails due to the fake db `query` matching logic, adjust the `match` substrings to align with the actual SQL text (the SQL strings are visible in `processCrewReportJob`).

- [ ] **Step 5: Run the full worker suite**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test
```
Expected: PASS — all existing tests green, plus the new handler coverage. Known env failures (geo-worker 429, Crew Agency notify, migration-invariants) acceptable.

- [ ] **Step 6: Typecheck and lint**

Run:
```powershell
pnpm --filter @seovista/worker typecheck
pnpm --filter @seovista/worker lint
```
Expected: 0 errors, 0 errors (lint warnings from M5 are addressed in Task 6).

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/queue/crew-report-worker.ts apps/worker/src/__tests__/crew-report-worker.test.ts
git commit -m "test(crew-report-worker): extract handler + cover terminal mapping (M2)

Extract processCrewReportJob(data, deps) with injected db/client/sleep.
startCrewReportWorker is thin wiring. New test covers happy path,
misconfigured/unknown-tool/missing-source → permanent, crew failed → failed,
poll ceiling → timeout, and extractReportMarkdown variants."
```

---


