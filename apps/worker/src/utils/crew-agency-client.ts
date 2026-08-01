/**
 * CrewAgency multi-agent platform client (server-only boundary).
 *
 * Thin async-job client for the operator-configured CrewAgency deployment:
 * requests authenticate with the `X-API-Key` header, work is started with a
 * kickoff POST, and results are collected by polling `GET /api/jobs/{id}`.
 *
 * The endpoint comes from the trusted `CREW_AGENCY_API_URL` environment
 * variable (operator input, not user input), so — like the SearXNG provider
 * in `utils/serp-provider.ts` — it is intentionally NOT routed through the
 * user-input SSRF guard. It is still constrained: http/https only, a
 * per-request timeout, and a hard body cap so a misconfigured or hostile
 * endpoint cannot exhaust worker memory.
 *
 * All failures surface as typed `CrewAgencyError` codes that the crew-report
 * worker maps to terminal job statuses:
 *
 *   - `crew.auth`         — 401/403; the API key is wrong/revoked. Permanent.
 *   - `crew.rate_limited` — 429; transient, safe to retry later.
 *   - `crew.unavailable`  — 503, other non-OK statuses, network errors, or a
 *                           malformed response; transient (fail-closed).
 *   - `crew.timeout`      — request aborted by the per-request timeout.
 *   - `crew.misconfigured`— invalid base URL or missing API key. Permanent.
 */

export type CrewAgencyErrorCode =
  | "crew.auth"
  | "crew.rate_limited"
  | "crew.unavailable"
  | "crew.timeout"
  | "crew.misconfigured";

/**
 * Typed error raised by the CrewAgency client. `retryable` mirrors the
 * provider error taxonomy used elsewhere in the worker: transient failures
 * (rate limiting, unavailability, timeouts) are retryable, while auth and
 * configuration problems are permanent — no retry can fix them.
 */
export class CrewAgencyError extends Error {
  readonly code: CrewAgencyErrorCode;
  readonly retryable: boolean;

  constructor(code: CrewAgencyErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "CrewAgencyError";
    this.code = code;
    this.retryable =
      code === "crew.rate_limited" || code === "crew.unavailable" || code === "crew.timeout";
    if (options && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

/**
 * Status snapshot of a CrewAgency job. `status` is passed through verbatim —
 * known values include in-flight markers (`queued`, `running`, …) plus the
 * terminal `completed`/`failed`, but unknown strings are returned as-is so
 * new platform states degrade to "still in flight" instead of crashing.
 */
export interface CrewJobStatus {
  status: string;
  result?: unknown;
  error?: string;
}

/** Hard cap on any CrewAgency response body (1 MiB). */
const MAX_BODY_BYTES = 1024 * 1024;

/** Default per-request timeout (15 s). */
const DEFAULT_TIMEOUT_MS = 15_000;

export interface CrewAgencyClientOptions {
  /** Operator-configured CrewAgency base URL (http/https only). */
  baseUrl: string;
  /** CrewAgency API key; sent as the `X-API-Key` header. Never logged. */
  apiKey: string;
  /** Fetch implementation override; tests inject a mock. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds (default 15000). */
  timeoutMs?: number;
}

export class CrewAgencyClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: CrewAgencyClientOptions) {
    let parsed: URL;
    try {
      parsed = new URL(options.baseUrl);
    } catch {
      throw new CrewAgencyError(
        "crew.misconfigured",
        `CREW_AGENCY_API_URL is not a valid URL: ${options.baseUrl}`,
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new CrewAgencyError(
        "crew.misconfigured",
        `CREW_AGENCY_API_URL must use http or https, got ${parsed.protocol}`,
      );
    }
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      throw new CrewAgencyError("crew.misconfigured", "CREW_AGENCY_API_KEY must not be empty");
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Starts an async job: POSTs `body` as JSON to `{baseUrl}{path}` (e.g.
   * `/api/rapor-uret`). Accepts either `{ job_id }` or `{ jobId }` in the
   * response; anything else (including a non-string id) is treated as a
   * malformed response and mapped to `crew.unavailable`.
   */
  async kickoff(path: string, body: unknown): Promise<{ jobId: string }> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await this.request(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const payload = await this.readJson(response, url);
    const jobId = extractJobId(payload);
    if (!jobId) {
      throw new CrewAgencyError(
        "crew.unavailable",
        `CrewAgency kickoff response from ${url} did not contain a job id string`,
      );
    }
    return { jobId };
  }

  /** Polls a single job: GET `{baseUrl}/api/jobs/{jobId}`. */
  async getJob(jobId: string): Promise<CrewJobStatus> {
    const url = `${this.baseUrl}/api/jobs/${encodeURIComponent(jobId)}`;
    const response = await this.request(url, { method: "GET" });
    const payload = await this.readJson(response, url);

    if (!isRecord(payload) || typeof payload.status !== "string") {
      throw new CrewAgencyError(
        "crew.unavailable",
        `CrewAgency job response from ${url} did not contain a status string`,
      );
    }
    const status: CrewJobStatus = { status: payload.status };
    if ("result" in payload) {
      status.result = payload.result;
    }
    if (typeof payload.error === "string") {
      status.error = payload.error;
    }
    return status;
  }

  /**
   * Performs the fetch with the shared header set, timeout, and error
   * mapping. Transport errors become `crew.timeout`/`crew.unavailable`;
   * non-OK statuses become `crew.auth` (401/403), `crew.rate_limited` (429),
   * or `crew.unavailable` (503 and everything else).
   */
  private async request(
    url: string,
    init: { method: "GET" | "POST"; body?: string },
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method,
        headers: {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(init.body !== undefined ? { body: init.body } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isAbortOrTimeout(error)) {
        throw new CrewAgencyError(
          "crew.timeout",
          `CrewAgency request to ${url} timed out after ${this.timeoutMs}ms`,
          { cause: error },
        );
      }
      throw new CrewAgencyError(
        "crew.unavailable",
        `CrewAgency request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!response.ok) {
      throw statusToError(response.status, url);
    }
    return response;
  }

  /** Reads and JSON-parses a response body, enforcing the 1 MiB cap. */
  private async readJson(response: Response, url: string): Promise<unknown> {
    const body = await readBodyWithCap(response, MAX_BODY_BYTES, url);
    try {
      return JSON.parse(body);
    } catch (error) {
      throw new CrewAgencyError(
        "crew.unavailable",
        `CrewAgency response from ${url} was not valid JSON`,
        { cause: error },
      );
    }
  }
}

function statusToError(status: number, url: string): CrewAgencyError {
  if (status === 401 || status === 403) {
    return new CrewAgencyError(
      "crew.auth",
      `CrewAgency rejected the API key (HTTP ${status}) for ${url}`,
    );
  }
  if (status === 429) {
    return new CrewAgencyError("crew.rate_limited", `CrewAgency rate limited the request to ${url}`);
  }
  return new CrewAgencyError(
    "crew.unavailable",
    `CrewAgency responded with HTTP ${status} for ${url}`,
  );
}

/** Accepts both the snake_case and camelCase job-id response shapes. */
function extractJobId(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  for (const key of ["job_id", "jobId"] as const) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortOrTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * Streams a response body up to `maxBodyBytes`, aborting the reader (and
 * throwing `crew.unavailable`) as soon as the cap is exceeded so the full
 * body is never buffered. Mirrors `readBodyWithCap` in
 * `utils/serp-provider.ts`, including the `response.text()` fallback for the
 * plain-object fetch mocks used by unit tests.
 */
async function readBodyWithCap(response: Response, maxBodyBytes: number, url: string): Promise<string> {
  const stream = response.body;
  if (stream && typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        received += value.byteLength;
        if (received > maxBodyBytes) {
          await reader.cancel().catch(() => undefined);
          throw new CrewAgencyError(
            "crew.unavailable",
            `CrewAgency response body from ${url} exceeded the ${maxBodyBytes}-byte limit`,
          );
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBodyBytes) {
    throw new CrewAgencyError(
      "crew.unavailable",
      `CrewAgency response body from ${url} exceeded the ${maxBodyBytes}-byte limit`,
    );
  }
  return text;
}

/**
 * Resolves the CrewAgency client from the environment: both
 * `CREW_AGENCY_API_URL` and `CREW_AGENCY_API_KEY` must be set (non-blank);
 * otherwise returns null so callers can fail closed with an honest
 * "service not configured" path instead of a half-configured client.
 */
export function resolveCrewAgencyClient(
  env: { CREW_AGENCY_API_URL?: string | undefined; CREW_AGENCY_API_KEY?: string | undefined } = process.env,
): CrewAgencyClient | null {
  const baseUrl = env.CREW_AGENCY_API_URL?.trim();
  const apiKey = env.CREW_AGENCY_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    return null;
  }
  return new CrewAgencyClient({ baseUrl, apiKey });
}
