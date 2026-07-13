import { z } from "zod";

const DEFAULT_PHASE = "normalization";
const DEFAULT_DURATION_MS = 0;

const phaseSchema = z.enum([
  "request",
  "response",
  "redirect",
  "cancellation",
  "execution",
  "complete",
  DEFAULT_PHASE,
]);

const correlationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

const durationSchema = z.number().finite().nonnegative().max(86_400_000);

export const auditFailureClassSchema = z.enum([
  "timeout",
  "response_size",
  "content_type",
  "redirect",
  "cancellation",
  "execution",
  "partial_result",
  "invalid_result",
]);

export type AuditFailureClass = z.infer<typeof auditFailureClassSchema>;

const completeSuccessSchema = z.object({
  outcome: z.literal("success"),
  phase: z.literal("complete"),
  correlationId: correlationIdSchema.optional(),
  durationMs: durationSchema,
}).strict();

const failureSchema = z.object({
  outcome: z.literal("failure"),
  errorClass: auditFailureClassSchema,
  phase: phaseSchema,
  correlationId: correlationIdSchema.optional(),
  durationMs: durationSchema,
}).strict();

/**
 * A finite, transport-free audit result. Only a completed result can be
 * successful. All partial and abnormal paths are represented as failures.
 */
export const auditOutcomeSchema = z.discriminatedUnion("outcome", [
  completeSuccessSchema,
  failureSchema,
]);

export type AuditOutcome = z.infer<typeof auditOutcomeSchema>;
export type AuditOutcomePhase = z.infer<typeof phaseSchema>;

export const AUDIT_OUTCOME_LOG_FIELDS = [
  "correlationId",
  "phase",
  "errorClass",
  "durationMs",
] as const;

/**
 * The complete structured-log shape. This is intentionally defined instead of
 * deriving a Pick from AuditOutcome, whose discriminated variants do not share
 * errorClass. No raw execution input can appear in this projection.
 */
export interface AuditOutcomeLogProjection {
  correlationId?: string;
  phase: AuditOutcomePhase;
  errorClass?: AuditFailureClass;
  durationMs: number;
}

type SyntheticFailureKind = Exclude<AuditFailureClass, "partial_result" | "invalid_result">;

const syntheticFailureSchema = z.object({
  kind: auditFailureClassSchema.exclude(["partial_result", "invalid_result"]),
  phase: z.unknown().optional(),
  correlationId: z.unknown().optional(),
  durationMs: z.unknown().optional(),
}).passthrough();

const syntheticSuccessSchema = z.object({
  kind: z.literal("success"),
  complete: z.boolean(),
  phase: z.unknown().optional(),
  correlationId: z.unknown().optional(),
  durationMs: z.unknown().optional(),
}).passthrough();

function safeCorrelationId(value: unknown): string | undefined {
  const result = correlationIdSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function safeDuration(value: unknown): number {
  const result = durationSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_DURATION_MS;
}

function safePhase(value: unknown): z.infer<typeof phaseSchema> | undefined {
  const result = phaseSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function defaultPhase(kind: SyntheticFailureKind): z.infer<typeof phaseSchema> {
  switch (kind) {
    case "timeout":
      return "request";
    case "response_size":
    case "content_type":
      return "response";
    case "redirect":
      return "redirect";
    case "cancellation":
      return "cancellation";
    case "execution":
      return "execution";
  }
}

function fallbackFailure(): AuditOutcome {
  return {
    outcome: "failure",
    errorClass: "invalid_result",
    phase: DEFAULT_PHASE,
    durationMs: DEFAULT_DURATION_MS,
  };
}

/**
 * Converts synthetic execution signals to a compact audit result. This is a
 * synchronous data transformation and deliberately has no resolver, transport,
 * filesystem, provider, or other outbound side effect.
 */
export function normalizeAuditOutcome(input: unknown): AuditOutcome {
  const alreadyNormalized = auditOutcomeSchema.safeParse(input);
  if (alreadyNormalized.success) {
    return alreadyNormalized.data;
  }

  const syntheticSuccess = syntheticSuccessSchema.safeParse(input);
  if (syntheticSuccess.success) {
    const correlationId = safeCorrelationId(syntheticSuccess.data.correlationId);
    const durationMs = safeDuration(syntheticSuccess.data.durationMs);
    if (!syntheticSuccess.data.complete) {
      return {
        outcome: "failure",
        errorClass: "partial_result",
        phase: "complete",
        ...(correlationId === undefined ? {} : { correlationId }),
        durationMs,
      };
    }

    return {
      outcome: "success",
      phase: "complete",
      ...(correlationId === undefined ? {} : { correlationId }),
      durationMs,
    };
  }

  const syntheticFailure = syntheticFailureSchema.safeParse(input);
  if (!syntheticFailure.success) {
    return fallbackFailure();
  }

  const { kind } = syntheticFailure.data;
  const correlationId = safeCorrelationId(syntheticFailure.data.correlationId);
  const durationMs = safeDuration(syntheticFailure.data.durationMs);
  const phase = safePhase(syntheticFailure.data.phase) ?? defaultPhase(kind);
  return {
    outcome: "failure",
    errorClass: kind,
    phase,
    ...(correlationId === undefined ? {} : { correlationId }),
    durationMs,
  };
}

/**
 * Projects a normalized result to the only fields permitted in structured logs.
 * The input is revalidated so callers cannot serialize forged partial successes.
 */
export function projectAuditOutcomeForLog(input: unknown): AuditOutcomeLogProjection {
  const outcome = auditOutcomeSchema.safeParse(input);
  if (!outcome.success) {
    return projectAuditOutcomeForLog(fallbackFailure());
  }

  const { correlationId, phase, durationMs } = outcome.data;
  return {
    ...(correlationId === undefined ? {} : { correlationId }),
    phase,
    ...(outcome.data.outcome === "failure" ? { errorClass: outcome.data.errorClass } : {}),
    durationMs,
  };
}

/**
 * Produces a deterministic, JSON-only safe observability representation.
 * It contains no raw inputs, target URLs, exception text, stacks, bodies, or
 * nested metadata because the log projection is an explicit allowlist.
 */
export function serializeAuditOutcome(input: unknown): string {
  return JSON.stringify(projectAuditOutcomeForLog(input));
}
