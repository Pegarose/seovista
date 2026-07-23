import axios from "axios";
import type { ScoreContext } from "../types.js";

/**
 * Internal Axios instance used for all NeuronWriter API calls.
 * A custom adapter can be injected in tests by setting this instance's adapter.
 */
export const nwClient = axios.create({
  baseURL: "https://app.neuronwriter.com/neuron-api/0.5/writer",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 30_000,
});

/**
 * NeuronWriter API enrichment types.
 */
export interface NWTerm {
  t: string;
  usage_pc?: number;
  sugg_usage?: number[];
}

export interface NWTermGroups {
  title?: NWTerm[];
  desc?: NWTerm[];
  h1?: NWTerm[];
  h2?: NWTerm[];
  content_basic?: NWTerm[];
  content_extended?: NWTerm[];
  entities?: Array<{
    t: string;
    importance?: number;
    relevance?: number;
    confidence?: number;
    links?: string[][];
  }>;
}

export interface NWEnrichmentResult {
  provider: "neuronwriter";
  queryId?: string | null | undefined;
  status: "ready" | "waiting" | "in_progress" | "not_found" | "error";
  terms: NWTermGroups;
  metrics?: {
    word_count?: { median?: number; target?: number };
    readability?: { median?: number; target?: number };
  } | undefined;
  ideas?: {
    suggest_questions?: Array<{ q: string }>;
    people_also_ask?: Array<{ q: string }>;
    content_questions?: Array<{ q: string }>;
  } | undefined;
  competitors?: Array<{
    rank?: number;
    url?: string;
    title?: string;
    desc?: string;
    content_score?: number;
  }> | undefined;
  recommendedHeadings: string[];
  missingLsiTerms: string[];
  error?: string | undefined;
}

/**
 * Normalize a NeuronWriter get-query response into our internal enrichment shape.
 */
function normalizeQueryResponse(data: unknown): NWEnrichmentResult {
  const result: NWEnrichmentResult = {
    provider: "neuronwriter",
    status: "error",
    terms: {},
    recommendedHeadings: [],
    missingLsiTerms: [],
  };

  if (!data || typeof data !== "object") {
    result.error = "Invalid response from NeuronWriter API";
    return result;
  }

  const payload = data as Record<string, unknown>;

  const status = typeof payload.status === "string" ? payload.status : "not_found";
  result.status = status as NWEnrichmentResult["status"];

  if (result.status !== "ready") {
    result.error = `NeuronWriter query status: ${result.status}`;
    return result;
  }

  result.metrics =
    typeof payload.metrics === "object" && payload.metrics !== null
      ? (payload.metrics as NWEnrichmentResult["metrics"])
      : undefined;

  result.terms =
    typeof payload.terms === "object" && payload.terms !== null
      ? (payload.terms as NWTermGroups)
      : {};

  result.ideas =
    typeof payload.ideas === "object" && payload.ideas !== null
      ? (payload.ideas as NWEnrichmentResult["ideas"])
      : undefined;

  result.competitors = Array.isArray(payload.competitors)
    ? (payload.competitors as NWEnrichmentResult["competitors"])
    : undefined;

  // Build recommended headings from H2 terms and questions.
  const headings: string[] = [];
  const h2Terms = result.terms.h2 ?? [];
  for (const term of h2Terms) {
    if (term.t && !headings.includes(term.t)) {
      headings.push(term.t);
    }
  }
  if (result.ideas?.suggest_questions) {
    for (const item of result.ideas.suggest_questions) {
      if (item.q && !headings.includes(item.q)) {
        headings.push(item.q);
      }
    }
  }
  result.recommendedHeadings = headings.slice(0, 10);

  // Build missing LSI terms from content_basic terms that are not present in the target text.
  // The actual presence check happens in the caller (SemanticModule) using parsed text content.
  const contentBasic = result.terms.content_basic ?? [];
  const contentExtended = result.terms.content_extended ?? [];
  const allContentTerms = [...contentBasic, ...contentExtended];
  result.missingLsiTerms = allContentTerms
    .filter((term) => term.t && term.usage_pc !== undefined && term.usage_pc > 50)
    .map((term) => term.t)
    .slice(0, 20);

  return result;
}

/**
 * Create a new NeuronWriter query for the supplied keyword and return the query id.
 */
async function createNeuronWriterQuery(
  apiKey: string,
  keyword: string,
  projectId: string | undefined,
  language: string,
  engine: string
): Promise<string | null> {
  const response = await nwClient.post<Record<string, unknown>>(
    "/new-query",
    {
      project: projectId ?? undefined,
      keyword,
      engine,
      language,
      competitors_mode: "top10",
    },
    {
      headers: {
        "X-API-KEY": apiKey,
      },
    }
  );

  const data = response.data;
  const queryId = typeof data.query === "string" ? data.query : null;
  return queryId;
}

/**
 * Poll NeuronWriter /get-query until the query is ready or we exhaust our wait budget.
 */
async function pollQueryReady(
  apiKey: string,
  queryId: string,
  maxWaitMs = 120_000,
  pollIntervalMs = 5_000
): Promise<unknown> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const response = await nwClient.post<Record<string, unknown>>(
      "/get-query",
      { query: queryId },
      {
        headers: {
          "X-API-KEY": apiKey,
        },
      }
    );

    const data = response.data;
    const status = typeof data.status === "string" ? data.status : "not_found";

    if (status === "ready") {
      return data;
    }

    if (status === "not found") {
      throw new Error(`NeuronWriter query ${queryId} not found`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`NeuronWriter query ${queryId} did not become ready within ${maxWaitMs}ms`);
}

/**
 * Enrich a page context with NeuronWriter NLP recommendations.
 *
 * This uses the NeuronWriter public API:
 *   1. POST /new-query with the target keyword.
 *   2. Poll POST /get-query until status === "ready".
 *   3. Return normalized terms, headings, ideas, competitors, and LSI terms.
 */
export async function enrichWithNeuronWriter(
  context: ScoreContext,
  _startTime?: number
): Promise<NWEnrichmentResult> {
  const apiKey = process.env.NEURONWRITER_API_KEY;

  if (!apiKey || apiKey === "your_key_here") {
    return {
      provider: "neuronwriter",
      status: "error",
      terms: {},
      recommendedHeadings: [],
      missingLsiTerms: [],
      error: "NEURONWRITER_API_KEY is not configured",
    };
  }

  const keyword = context.targetKeyword || context.parsed.title || undefined;
  if (!keyword) {
    return {
      provider: "neuronwriter",
      status: "error",
      terms: {},
      recommendedHeadings: [],
      missingLsiTerms: [],
      error: "No target keyword or page title available for NeuronWriter enrichment",
    };
  }

  const language = context.locale || "English";
  const engine = "google.com";
  const projectId = process.env.NEURONWRITER_PROJECT_ID;

  try {
    const queryId = await createNeuronWriterQuery(apiKey, keyword, projectId, language, engine);

    if (!queryId) {
      return {
        provider: "neuronwriter",
        status: "error",
        terms: {},
        recommendedHeadings: [],
        missingLsiTerms: [],
        error: "NeuronWriter /new-query did not return a query id",
      };
    }

    const rawData = await pollQueryReady(apiKey, queryId);
    const normalized = normalizeQueryResponse(rawData);
    normalized.queryId = queryId;
    return normalized;
  } catch (err) {
    return {
      provider: "neuronwriter",
      status: "error",
      terms: {},
      recommendedHeadings: [],
      missingLsiTerms: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
