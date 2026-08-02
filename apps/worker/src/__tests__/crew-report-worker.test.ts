import { describe, expect, it, vi } from "vitest";
import {
  processCrewReportJob,
  type CrewReportDb,
} from "../queue/crew-report-worker.js";
import { CrewAgencyError, type CrewAgencyClient } from "../utils/crew-agency-client.js";

/** Minimal DB contract used by the extracted handler and its fake. */
type TestDbRow = Record<string, unknown>;

/** Builds a fake db whose `query` returns rows queued by SQL-substring match. */
function makeFakeDb(
  responses: Array<{ match: string; rows: TestDbRow[] }>,
): { db: CrewReportDb; calls: Array<{ text: string; params?: readonly unknown[] }> } {
  const calls: Array<{ text: string; params?: readonly unknown[] }> = [];
  const queue = [...responses];
  const db: CrewReportDb = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      if (params) {
        calls.push({ text, params });
      } else {
        calls.push({ text });
      }
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
