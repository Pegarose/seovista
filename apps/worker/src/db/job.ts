import type { DbClient } from "./client.js";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "permanent"
  | "timeout";

export type TerminalClass = "retryable" | "permanent" | "timeout" | "success";

export interface JobRecord {
  id: string;
  job_identity: string;
  target: string | null;
  queue_name: string;
  correlation_id: string;
  status: JobStatus;
  attempt_count: number;
  terminal_class: TerminalClass | null;
  result_id: string | null;
  owner: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface CreateJobRecord {
  jobIdentity: string;
  queueName: string;
  correlationId: string;
  target?: string | null;
  owner?: string | null;
  status?: JobStatus;
}

export interface JobResult {
  id: string;
  correlation_id: string;
  job_identity: string;
  result_type: string;
  payload: unknown;
  created_at: Date;
}

export function createJobRepository(client: DbClient) {
  return {
    async create(input: CreateJobRecord): Promise<JobRecord> {
      const status = input.status ?? "queued";
      const result = await client.query<JobRecord>(
        `
          INSERT INTO job_records (job_identity, queue_name, correlation_id, target, owner, status)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (job_identity) DO UPDATE SET
            updated_at = now()
          RETURNING *
        `,
        [input.jobIdentity, input.queueName, input.correlationId, input.target ?? null, input.owner ?? null, status]
      );
      return result.rows[0]!;
    },

    async findByIdentity(jobIdentity: string): Promise<JobRecord | null> {
      const result = await client.query<JobRecord>(
        "SELECT * FROM job_records WHERE job_identity = $1",
        [jobIdentity]
      );
      return result.rows[0] ?? null;
    },

    async findByCorrelation(correlationId: string): Promise<JobRecord[]> {
      const result = await client.query<JobRecord>(
        "SELECT * FROM job_records WHERE correlation_id = $1 ORDER BY created_at",
        [correlationId]
      );
      return result.rows;
    },

    async start(jobIdentity: string): Promise<JobRecord> {
      const result = await client.query<JobRecord>(
        `
          UPDATE job_records
          SET status = 'running', attempt_count = attempt_count + 1, updated_at = now()
          WHERE job_identity = $1
          RETURNING *
        `,
        [jobIdentity]
      );
      if (result.rows.length === 0) {
        throw new Error(`Job not found: ${jobIdentity}`);
      }
      return result.rows[0]!;
    },

    async complete(jobIdentity: string, resultId: string): Promise<JobRecord> {
      const result = await client.query<JobRecord>(
        `
          UPDATE job_records
          SET status = 'completed', result_id = $2, terminal_class = 'success', completed_at = now(), updated_at = now()
          WHERE job_identity = $1
          RETURNING *
        `,
        [jobIdentity, resultId]
      );
      if (result.rows.length === 0) {
        throw new Error(`Job not found: ${jobIdentity}`);
      }
      return result.rows[0]!;
    },

    async markTerminal(
      jobIdentity: string,
      status: "failed" | "permanent" | "timeout",
      terminalClass: Exclude<TerminalClass, "success">
    ): Promise<JobRecord> {
      const result = await client.query<JobRecord>(
        `
          UPDATE job_records
          SET status = $2, terminal_class = $3, updated_at = now()
          WHERE job_identity = $1
          RETURNING *
        `,
        [jobIdentity, status, terminalClass]
      );
      if (result.rows.length === 0) {
        throw new Error(`Job not found: ${jobIdentity}`);
      }
      return result.rows[0]!;
    },
  };
}

export function createJobResultRepository(client: DbClient) {
  return {
    async create(
      correlationId: string,
      jobIdentity: string,
      resultType: string,
      payload: unknown
    ): Promise<JobResult> {
      const result = await client.query<JobResult>(
        `
          INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        [correlationId, jobIdentity, resultType, JSON.stringify(payload)]
      );
      return result.rows[0]!;
    },

    async findById(id: string): Promise<JobResult | null> {
      const result = await client.query<JobResult>(
        "SELECT * FROM job_results WHERE id = $1",
        [id]
      );
      return result.rows[0] ?? null;
    },
  };
}
