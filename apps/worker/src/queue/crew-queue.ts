import type { Job, ConnectionOptions } from "bullmq";
import { Queue, Worker } from "bullmq";

export interface CrewAgencyPayload {
  url: string;
  brand: string;
  score: number;
  scoreBand: string;
  lowScores: {
    access: number;
    understanding: number;
    evidence: number;
  };
  topIssues: Array<{
    code: string;
    title: string;
    severity: string;
  }>;
  proposalTrigger: boolean;
  correlationId?: string;
  jobIdentity?: string;
  resultId?: string;
  analysisSummary: string;
  matchedServices?: string[];
  tier?: string;
}

export interface ProcessCrewOptions {
  fetch?: typeof fetch;
  apiKey?: string;
  apiUrl?: string;
}

export interface ProcessCrewResult {
  success: boolean;
  jobId?: string;
  skipped?: boolean;
}

export function buildCrewAgencyUrl(overrideUrl?: string): string {
  const baseUrl = (overrideUrl ?? process.env.CREW_AGENCY_API_URL ?? "https://crew.tr4.net/api").replace(/\/$/, "");
  const withApi = /\/api$/.test(baseUrl) ? baseUrl : `${baseUrl}/api`;
  return `${withApi}/teklif-yaz`;
}

export async function processCrewNotification(
  payload: CrewAgencyPayload,
  options: ProcessCrewOptions = {}
): Promise<ProcessCrewResult> {
  const apiKey = options.apiKey ?? process.env.CREW_AGENCY_API_KEY;
  if (!apiKey) {
    console.warn("CREW_AGENCY_API_KEY is not configured; skipping Crew Agency notification");
    return { success: false, skipped: true };
  }

  const customFetch = options.fetch ?? fetch;
  const targetUrl = buildCrewAgencyUrl(options.apiUrl);

  const apiPayload = {
    url: payload.url,
    brand: payload.brand,
    score: payload.score,
    scoreBand: payload.scoreBand,
    lowScores: payload.lowScores,
    topIssues: payload.topIssues,
    proposalTrigger: Boolean(payload.proposalTrigger),
    correlationId: payload.correlationId,
    jobIdentity: payload.jobIdentity,
    resultId: payload.resultId,
    analysisSummary: payload.analysisSummary,
    matchedServices: payload.matchedServices,
    tier: payload.tier,
    musteri_ihtiyaci: payload.analysisSummary,
    brand_context: payload.brand,
    dil: "tr",
  };

  const controller = new AbortController();
  const crewWebhookTimeoutMs = Number(process.env.CREW_WEBHOOK_TIMEOUT_MS) || 10000;
  const timeoutId = setTimeout(() => controller.abort(), crewWebhookTimeoutMs);

  let response: Response;
  try {
    response = await customFetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(apiPayload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const status = response.status;
    throw Object.assign(
      new Error(`Crew Agency notification failed: ${status} ${response.statusText}`),
      { statusCode: status }
    );
  }

  try {
    const responseBody = (await response.json()) as { job_id?: string };
    return responseBody.job_id
      ? { success: true, jobId: responseBody.job_id }
      : { success: true };
  } catch {
    return { success: true };
  }
}

export const CREW_QUEUE_NAME = "crew-notifications";

export function createCrewQueue(
  connection: ConnectionOptions,
  queueName: string = CREW_QUEUE_NAME,
): Queue<CrewAgencyPayload> {
  return new Queue<CrewAgencyPayload>(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: false,
    },
  });
}

export function createCrewWorker(
  connection: ConnectionOptions,
  queueName: string = CREW_QUEUE_NAME,
): Worker<CrewAgencyPayload> {
  return new Worker<CrewAgencyPayload>(
    queueName,
    async (job: Job<CrewAgencyPayload>) => {
      await processCrewNotification(job.data);
    },
    { connection, concurrency: 2 }
  );
}

export async function enqueueCrewNotification(
  queue: Queue<CrewAgencyPayload>,
  payload: CrewAgencyPayload
): Promise<void> {
  const opts = payload.resultId ? { jobId: `crew-${payload.resultId}` } : undefined;
  if (opts) {
    await queue.add("crew-webhook", payload, opts);
  } else {
    await queue.add("crew-webhook", payload);
  }
}
