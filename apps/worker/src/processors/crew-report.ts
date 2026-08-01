/**
 * Crew report request/result processor — pure functions, no I/O.
 *
 * The crew report chain turns a completed tool audit (GEO readiness, schema,
 * AI crawler, keyword rank) into an AI-generated strategy report produced by
 * the operator-configured CrewAgency deployment. This module owns the two
 * pure transformations of that chain:
 *
 *   1. `buildCrewReportRequest` — maps the source audit payload to the
 *      CrewAgency kickoff request. Keyword rank checks go to the dedicated
 *      `/api/seo-brief` brief endpoint; the three audit tools go to
 *      `/api/rapor-uret` with a Turkish, human-readable context summary
 *      capped at 4000 chars (CrewAgency prompt-budget guardrail).
 *   2. `buildCrewReportResultPayload` — builds the `crew-report:result`
 *      payload persisted in `job_results`. There is intentionally NO score
 *      field: the report is an AI-generated strategy document and an
 *      invented numeric score would violate the never-fabricate-metrics
 *      rule. The `dataSource: "crew-agency"` label is mandatory so the UI
 *      can always state where the content came from.
 */

/** Tools whose completed results can seed a crew report. */
export const CREW_REPORT_TOOLS = [
  "geo-readiness",
  "schema",
  "ai-crawler",
  "keyword-rank",
] as const;

export type CrewReportTool = (typeof CREW_REPORT_TOOLS)[number];

/**
 * Maps each crew report tool to the `job_records.queue_name` value of the
 * audit chain that produced the source result. The crew report worker uses
 * this to load the source payload through the correlation join.
 */
export const TOOL_QUEUE_NAMES: Record<CrewReportTool, string> = {
  "geo-readiness": "geo_audit",
  schema: "schema_audit",
  "ai-crawler": "ai_crawler_audit",
  "keyword-rank": "keyword_rank_audit",
};

/** CrewAgency endpoint for audit-tool strategy reports. */
export const CREW_REPORT_ENDPOINT = "/api/rapor-uret";

/** CrewAgency endpoint for keyword-rank SEO briefs. */
export const CREW_SEO_BRIEF_ENDPOINT = "/api/seo-brief";

/** Hard cap on the brand_context string sent to CrewAgency. */
export const MAX_BRAND_CONTEXT_CHARS = 4000;

/** Marker appended when the context summary had to be truncated. */
const TRUNCATION_MARKER = "…";

/** Maximum number of findings/issues included in the context summary. */
const MAX_FINDINGS = 10;

export interface BuildCrewReportRequestInput {
  tool: CrewReportTool;
  /** Raw `job_results.payload` of the source audit job (shape varies by tool). */
  sourcePayload: unknown;
}

export interface CrewReportRequest {
  endpoint: typeof CREW_REPORT_ENDPOINT | typeof CREW_SEO_BRIEF_ENDPOINT;
  body: Record<string, unknown>;
}

/**
 * Builds the CrewAgency kickoff request for a tool. Keyword rank checks map
 * to `/api/seo-brief` with `{ konu, brand_context, dil }`; the audit tools
 * map to `/api/rapor-uret` with a summarized Turkish context. Unknown tools
 * throw — the worker maps that to a permanent failure.
 */
export function buildCrewReportRequest(input: BuildCrewReportRequestInput): CrewReportRequest {
  const { tool, sourcePayload } = input;

  if (!isCrewReportTool(tool)) {
    throw new Error(`Unknown crew report tool: ${String(tool)}`);
  }

  const record = isRecord(sourcePayload) ? sourcePayload : {};

  if (tool === "keyword-rank") {
    const keyword = pickString(record, ["keyword"]);
    const domain = pickString(record, ["domain"]);
    if (!keyword || !domain) {
      throw new Error(
        "keyword-rank source payload must include non-empty keyword and domain strings",
      );
    }
    return {
      endpoint: CREW_SEO_BRIEF_ENDPOINT,
      body: { konu: keyword, brand_context: domain, dil: "tr" },
    };
  }

  return {
    endpoint: CREW_REPORT_ENDPOINT,
    body: { brand_context: summarizeSourceContext(tool, record), dil: "tr" },
  };
}

export interface BuildCrewReportResultPayloadInput {
  /** The source audit job this report was generated from. */
  sourceJobId: string;
  tool: CrewReportTool;
  /** CrewAgency endpoint that produced the report. */
  endpoint: string;
  /** Markdown report body returned by CrewAgency. */
  reportMarkdown: string;
  /** CrewAgency-side job id (from kickoff). */
  crewJobId: string;
}

/**
 * Payload persisted in `job_results` with `result_type 'crew-report:result'`
 * and rendered by the report view. Deliberately carries no score — see the
 * module docstring.
 */
export interface CrewReportResultPayload {
  kind: "crew-report";
  dataSource: "crew-agency";
  sourceJobId: string;
  tool: CrewReportTool;
  endpoint: string;
  reportMarkdown: string;
  crewJobId: string;
  /** ISO-8601 timestamp of when the report was collected from CrewAgency. */
  generatedAt: string;
}

export function buildCrewReportResultPayload(
  input: BuildCrewReportResultPayloadInput,
): CrewReportResultPayload {
  return {
    kind: "crew-report",
    dataSource: "crew-agency",
    sourceJobId: input.sourceJobId,
    tool: input.tool,
    endpoint: input.endpoint,
    reportMarkdown: input.reportMarkdown,
    crewJobId: input.crewJobId,
    generatedAt: new Date().toISOString(),
  };
}

const TOOL_SUMMARY_LABELS: Record<CrewReportTool, string> = {
  "geo-readiness": "GEO Readiness Denetimi",
  schema: "Schema Denetimi",
  "ai-crawler": "AI Crawler Denetimi",
  "keyword-rank": "Keyword Rank Kontrolü",
};

/**
 * Summarizes a source audit payload into a compact Turkish context brief:
 * target/domain line, tool label, score when the payload carries one, and up
 * to 10 key findings/issues. The result is truncated to
 * `MAX_BRAND_CONTEXT_CHARS` with an ellipsis marker so the CrewAgency prompt
 * budget is never exceeded.
 */
function summarizeSourceContext(
  tool: Exclude<CrewReportTool, "keyword-rank">,
  record: Record<string, unknown>,
): string {
  const lines: string[] = [];

  const target = pickString(record, ["target", "url", "domain", "robotsTxtUrl"]);
  if (target) {
    lines.push(`Hedef: ${target}`);
  }
  lines.push(`Araç: ${TOOL_SUMMARY_LABELS[tool]}`);

  const score = extractScore(record);
  if (score !== null) {
    lines.push(`Skor: ${score}`);
  }

  const findings = extractFindings(tool, record);
  if (findings.length > 0) {
    lines.push("Bulgular:");
    for (const finding of findings.slice(0, MAX_FINDINGS)) {
      lines.push(`- ${finding}`);
    }
  }

  return truncateWithMarker(lines.join("\n"), MAX_BRAND_CONTEXT_CHARS);
}

/** Reads a finite score from `score` (schema/ai-crawler) or `scores.overall` (geo). */
function extractScore(record: Record<string, unknown>): number | null {
  if (typeof record.score === "number" && Number.isFinite(record.score)) {
    return record.score;
  }
  const scores = record.scores;
  if (isRecord(scores) && typeof scores.overall === "number" && Number.isFinite(scores.overall)) {
    return scores.overall;
  }
  return null;
}

/** Extracts up to the first MAX_FINDINGS human-readable findings per tool. */
function extractFindings(
  tool: Exclude<CrewReportTool, "keyword-rank">,
  record: Record<string, unknown>,
): string[] {
  switch (tool) {
    case "geo-readiness": {
      const issues = Array.isArray(record.issues) ? record.issues : [];
      return issues.flatMap((issue) => {
        if (!isRecord(issue)) return [];
        const title = typeof issue.title === "string" && issue.title.trim() ? issue.title : null;
        if (!title) return [];
        const severity =
          typeof issue.severity === "string" && issue.severity.trim() ? issue.severity : null;
        return [severity ? `[${severity}] ${title}` : title];
      });
    }
    case "schema":
      return pickStringArray(record.parseErrors);
    case "ai-crawler":
      return pickStringArray(record.recommendations);
  }
}

function truncateWithMarker(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

function isCrewReportTool(tool: unknown): tool is CrewReportTool {
  return (
    typeof tool === "string" && (CREW_REPORT_TOOLS as readonly string[]).includes(tool)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the first non-empty string found under the given keys. */
function pickString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}
