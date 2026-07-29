import type {
  ScoreBreakdown,
  ScoreBreakdownModule,
  ScoreBreakdownIssue,
  ScoreBreakdownPlatformReadiness,
  MatchedService,
  IssueTag,
} from "@seovista/geo-engine";
import { ISSUE_TAGS, SCORE_VERSION } from "@seovista/geo-engine";

const KNOWN_BANDS = new Set<ScoreBreakdown["band"]>([
  "excellent",
  "good",
  "needs_improvement",
  "poor",
  "critical",
]);

const KNOWN_MODULE_STATUSES = new Set<ScoreBreakdownModule["status"]>([
  "excellent",
  "good",
  "needs_improvement",
  "poor",
  "critical",
]);

const KNOWN_SEVERITIES = new Set<ScoreBreakdownIssue["severity"]>([
  "critical",
  "high",
  "medium",
  "low",
  "info",
  "experimental",
]);

const ISSUE_TAG_SET = new Set<string>(ISSUE_TAGS as readonly string[]);

/** The engine's persisted module projection is a closed seven-module contract. */
const MODULE_MAX_SCORES: Readonly<Record<string, number>> = Object.freeze({
  indexability_crawlability: 20,
  technical_seo_metadata: 20,
  content_quality_intent: 20,
  semantic_coverage: 15,
  page_experience_performance: 10,
  internal_linking_architecture: 10,
  ai_visibility_readiness: 5,
});

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isValidHttpUrl(urlStr: unknown): urlStr is string {
  if (typeof urlStr !== "string" || urlStr.trim().length === 0) return false;
  try {
    const parsed = new URL(urlStr);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
    );
  } catch {
    return false;
  }
}

export type PreviewSourceMode = "simulated" | "live";
export type PreviewDisplayType = "serp" | "ai";
export type PreviewFreshness =
  | "fresh"
  | "stale"
  | "no_results"
  | "expired"
  | "unavailable"
  | "revoked";
export type PreviewOutcome = "success" | "partial" | "no_results" | "unavailable" | "expired" | "revoked";

export interface ParsedPreview {
  title: string;
  snippet: string;
  url: string;
  sourceMode: PreviewSourceMode;
  displayType: PreviewDisplayType;
  provider: string;
  fixtureId: string;
  requestId: string;
  operationKey: string;
  runId: string;
  capturedAt: string;
  ttlSeconds: number;
  freshness: PreviewFreshness;
  outcome: PreviewOutcome;
}

export type ParsedScoreBreakdown = Omit<ScoreBreakdown, "platformReadiness"> & {
  /** Optional persisted projection, omitted when absent or wholly malformed. */
  platformReadiness?: ScoreBreakdownPlatformReadiness[];
};

export interface ParsedCompletedPayload {
  targetUrl: string | null;
  breakdown: ParsedScoreBreakdown | null;
  /** Present only when the persisted projection is an array, including [] for an explicit no-match result. */
  matchedServices?: MatchedService[];
  serpPreview: ParsedPreview | null;
  aiPreview: ParsedPreview | null;
}

export function parseCompletedPayload(
  payload: Record<string, unknown> | null,
): ParsedCompletedPayload | null {
  if (!payload || typeof payload !== "object") return null;

  if (!isValidHttpUrl(payload.target)) return null;
  const targetUrl = payload.target.trim();

  // Breakdown parsing
  const breakdown = parseBreakdown(payload.breakdown);

  // If breakdown is null, payload is incomplete/malformed for completed status
  if (!breakdown) return null;

  const hasMatchedServices = Object.prototype.hasOwnProperty.call(payload, "matchedServices");
  const validatedMatchedServices = hasMatchedServices
    ? validateMatchedServiceTags(payload.matchedServices)
    : undefined;
  const matchedServices =
    Array.isArray(payload.matchedServices) &&
    payload.matchedServices.length > 0 &&
    validatedMatchedServices?.length === 0
      ? undefined
      : validatedMatchedServices;
  const serpPreview = validatePreviewSlot(payload.serpPreview, "serp");
  const aiPreview = validatePreviewSlot(payload.aiPreview, "ai");

  return {
    targetUrl,
    breakdown,
    ...(matchedServices !== undefined ? { matchedServices } : {}),
    serpPreview,
    aiPreview,
  };
}

export function parseBreakdown(raw: unknown): ParsedScoreBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;

  if (
    b.scoreVersion !== SCORE_VERSION ||
    !isFiniteNumber(b.overallScore) ||
    b.overallScore < 0 ||
    b.overallScore > 100
  ) {
    return null;
  }

  // A present degraded marker is part of the completed-payload contract. Do
  // not silently treat malformed values such as "false" as if the marker was
  // absent, because that would make an incomplete score look complete.
  if (
    Object.prototype.hasOwnProperty.call(b, "degraded") &&
    typeof b.degraded !== "boolean"
  ) {
    return null;
  }

  if (
    typeof b.band !== "string" ||
    !KNOWN_BANDS.has(b.band as ScoreBreakdown["band"])
  ) {
    return null;
  }

  if (!Array.isArray(b.modules)) return null;

  const safeModules: ScoreBreakdownModule[] = [];
  const seenModuleKeys = new Set<string>();
  for (const m of b.modules) {
    if (!m || typeof m !== "object") return null;
    const mod = m as Record<string, unknown>;

    if (
      typeof mod.key !== "string" ||
      mod.key.trim().length === 0 ||
      seenModuleKeys.has(mod.key) ||
      typeof mod.name !== "string" ||
      mod.name.trim().length === 0 ||
      !Object.prototype.hasOwnProperty.call(MODULE_MAX_SCORES, mod.key) ||
      !isFiniteNumber(mod.score) ||
      mod.score < 0 ||
      !isFiniteNumber(mod.maxScore) ||
      mod.maxScore !== MODULE_MAX_SCORES[mod.key] ||
      mod.score > mod.maxScore ||
      typeof mod.status !== "string" ||
      !KNOWN_MODULE_STATUSES.has(mod.status as ScoreBreakdownModule["status"]) ||
      !Array.isArray(mod.issues)
    ) {
      return null;
    }

    const safeIssues: ScoreBreakdownIssue[] = [];
    for (const i of mod.issues) {
      if (!i || typeof i !== "object") return null;
      const iss = i as Record<string, unknown>;

      if (
        typeof iss.code !== "string" ||
        iss.code.trim().length === 0 ||
        typeof iss.message !== "string" ||
        iss.message.trim().length === 0 ||
        !isFiniteNumber(iss.pointLoss) ||
        iss.pointLoss > 0 ||
        Math.abs(iss.pointLoss) > mod.maxScore ||
        typeof iss.severity !== "string" ||
        !KNOWN_SEVERITIES.has(iss.severity as ScoreBreakdownIssue["severity"]) ||
        typeof iss.module !== "string" ||
        iss.module.trim().length === 0 ||
        iss.module !== mod.key
      ) {
        return null;
      }

      safeIssues.push({
        code: iss.code,
        message: iss.message,
        pointLoss: iss.pointLoss,
        severity: iss.severity as ScoreBreakdownIssue["severity"],
        module: iss.module,
      });
    }

    seenModuleKeys.add(mod.key);
    safeModules.push({
      key: mod.key,
      name: mod.name,
      score: mod.score,
      maxScore: mod.maxScore,
      status: mod.status as ScoreBreakdownModule["status"],
      issues: safeIssues,
    });
  }

  if (seenModuleKeys.size !== Object.keys(MODULE_MAX_SCORES).length) return null;

  const hasPlatformReadiness = Object.prototype.hasOwnProperty.call(b, "platformReadiness");
  const platformReadiness = hasPlatformReadiness
    ? parsePlatformReadiness(b.platformReadiness)
    : undefined;

  return {
    scoreVersion: SCORE_VERSION,
    overallScore: b.overallScore,
    band: b.band as ScoreBreakdown["band"],
    modules: safeModules,
    ...(platformReadiness !== undefined ? { platformReadiness } : {}),
    ...(typeof b.degraded === "boolean" ? { degraded: b.degraded } : {}),
  };
}

export function parsePlatformReadiness(
  raw: unknown,
): ScoreBreakdownPlatformReadiness[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ScoreBreakdownPlatformReadiness[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const p = entry as Record<string, unknown>;

    if (
      typeof p.platform !== "string" ||
      p.platform.trim().length === 0 ||
      typeof p.rationale !== "string" ||
      p.rationale.trim().length === 0 ||
      typeof p.experimental !== "boolean" ||
      !isFiniteNumber(p.score) ||
      p.score < 0 ||
      p.score > 100 ||
      !isFiniteNumber(p.confidence) ||
      p.confidence < 0 ||
      p.confidence > 1
    ) {
      continue;
    }

    out.push({
      platform: p.platform,
      score: p.score,
      confidence: p.confidence,
      rationale: p.rationale,
      experimental: p.experimental,
    });
  }
  return out.length > 0 || raw.length === 0 ? out : undefined;
}

export function validatePreviewProvenance(
  raw: unknown,
): ParsedPreview | null {
  return validatePreviewSlot(raw, undefined);
}

function validatePreviewSlot(
  raw: unknown,
  expectedDisplayType: PreviewDisplayType | undefined,
): ParsedPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;

  const title = typeof p.title === "string" ? p.title.trim() : "";
  const snippet = typeof p.snippet === "string" ? p.snippet.trim() : "";
  const url = typeof p.url === "string" ? p.url.trim() : "";
  const sourceMode = p.sourceMode === "simulated" || p.sourceMode === "live" ? p.sourceMode : null;
  const displayType = p.displayType === "serp" || p.displayType === "ai" ? p.displayType : null;
  const stringFields = ["provider", "fixtureId", "requestId", "operationKey", "runId"] as const;
  const values = Object.fromEntries(
    stringFields.map((field) => [field, typeof p[field] === "string" ? p[field].trim() : ""]),
  ) as Record<(typeof stringFields)[number], string>;
  const capturedAt = typeof p.capturedAt === "string" ? p.capturedAt : "";
  const parsedCapturedAt = Date.parse(capturedAt);
  const ttlSeconds = p.ttlSeconds;
  const freshness =
    p.freshness === "fresh" ||
    p.freshness === "stale" ||
    p.freshness === "no_results" ||
    p.freshness === "expired" ||
    p.freshness === "unavailable" ||
    p.freshness === "revoked"
      ? p.freshness
      : null;
  const outcome =
    p.outcome === "success" ||
    p.outcome === "partial" ||
    p.outcome === "no_results" ||
    p.outcome === "unavailable" ||
    p.outcome === "expired" ||
    p.outcome === "revoked"
      ? p.outcome
      : null;

  if (
    title.length === 0 ||
    snippet.length === 0 ||
    !isValidHttpUrl(url) ||
    sourceMode === null ||
    displayType === null ||
    (expectedDisplayType !== undefined && displayType !== expectedDisplayType) ||
    stringFields.some((field) => values[field].length === 0) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capturedAt) ||
    !Number.isFinite(parsedCapturedAt) ||
    !isFiniteNumber(ttlSeconds) ||
    ttlSeconds <= 0 ||
    freshness === null ||
    outcome === null
  ) {
    return null;
  }

  return {
    title,
    snippet,
    url,
    sourceMode,
    displayType,
    ...values,
    capturedAt,
    ttlSeconds,
    freshness,
    outcome,
  };
}

export function validateMatchedServiceTags(raw: unknown): MatchedService[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: MatchedService[] = [];

  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const svc = s as Record<string, unknown>;

    if (
      typeof svc.service_id !== "string" ||
      svc.service_id.trim().length === 0 ||
      typeof svc.name !== "string" ||
      svc.name.trim().length === 0 ||
      typeof svc.description !== "string" ||
      svc.description.trim().length === 0 ||
      !Array.isArray(svc.matchedTags) ||
      !Array.isArray(svc.addressedIssueCodes) ||
      svc.addressedIssueCodes.some(
        (code: unknown) => typeof code !== "string" || code.trim().length === 0,
      ) ||
      !isFiniteNumber(svc.relevanceScore) ||
      svc.relevanceScore < 0 ||
      svc.relevanceScore > 100
    ) {
      continue;
    }

    const rawTags = svc.matchedTags;
    const safeTags: IssueTag[] = [];
    for (const tag of rawTags) {
      if (typeof tag === "string" && ISSUE_TAG_SET.has(tag)) {
        safeTags.push(tag as IssueTag);
      }
    }

    const addressedIssueCodes = svc.addressedIssueCodes.filter(
      (code: unknown): code is string => typeof code === "string" && code.trim().length > 0,
    );

    out.push({
      service_id: svc.service_id,
      name: svc.name,
      description: svc.description,
      matchedTags: safeTags,
      relevanceScore: svc.relevanceScore,
      addressedIssueCodes,
    });
  }

  return out.length > 0 || raw.length === 0 ? out : undefined;
}
