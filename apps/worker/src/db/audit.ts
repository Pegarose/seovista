import { redactObject, rejectCanary, type RedactionOptions } from "@seovista/audit-core";
import type { DbClient } from "./client.js";

export interface AuditEvent {
  id: string;
  actor_identity: string;
  action: string;
  subject_identity: string;
  outcome: "success" | "failure" | "denied" | "error";
  metadata: Record<string, unknown>;
  correlation_id: string;
  recorded_at: Date;
}

export interface CreateAuditEvent {
  actorIdentity: string;
  action: string;
  subjectIdentity: string;
  outcome: "success" | "failure" | "denied" | "error";
  metadata?: Record<string, unknown>;
  correlationId: string;
}

const AUDIT_ALLOWLIST: readonly string[] = [
  "id",
  "correlationId",
  "phase",
  "status",
  "outcome",
  "action",
  "subject",
  "durationMs",
  "timestamp",
  "errorClass",
  "attempt",
  "urlHostname",
  "urlScheme",
  "contentType",
  "method",
];

const DENIED_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /api[_-]?key/i,
  /auth/i,
  /authorization/i,
  /private[_-]?key/i,
  /connection[_-]?string/i,
  /dsn/i,
  /email/i,
  /html/i,
  /body/i,
  /stack/i,
  /trace/i,
];

const DENIED_VALUE_PATTERNS = [
  /BEGIN [A-Z ]+ KEY/,
  /sk-[a-zA-Z0-9]+/,
  /[a-f0-9]{64}/i,
  /token=[^&]+/i,
  /api[_-]?key=[^&]+/i,
  /connection[_-]?string/i,
  /postgresql:\/\//i,
  /redis:\/\//i,
  /mongodb:\/\//i,
  /mysql:\/\//i,
  /<!doctype/i,
  /<html/i,
  /@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}/,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
];

function containsDeniedValue(value: unknown): boolean {
  if (typeof value === "string") {
    return DENIED_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsDeniedValue(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).some((item) => containsDeniedValue(item));
  }
  return false;
}

function containsDeniedKey(key: string): boolean {
  return DENIED_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function containsDeniedMetadata(metadata: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(metadata)) {
    if (containsDeniedKey(key)) {
      return true;
    }
    if (containsDeniedValue(value)) {
      return true;
    }
  }
  return false;
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  const input = metadata ?? {};
  if (containsDeniedMetadata(input)) {
    throw new Error("Audit metadata contains denied secrets or unsafe content");
  }

  const options: RedactionOptions = {
    allowlist: AUDIT_ALLOWLIST,
    maxDepth: 10,
  };
  return redactObject(input, options);
}

export function createAuditRepository(client: DbClient) {
  return {
    async create(input: CreateAuditEvent): Promise<AuditEvent> {
      const metadata = sanitizeAuditMetadata(input.metadata);

      const result = await client.query<AuditEvent>(
        `
          INSERT INTO audit_logs (actor_identity, action, subject_identity, outcome, metadata, correlation_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [input.actorIdentity, input.action, input.subjectIdentity, input.outcome, JSON.stringify(metadata), input.correlationId]
      );
      return result.rows[0]!;
    },

    async findByCorrelation(correlationId: string): Promise<AuditEvent[]> {
      const result = await client.query<AuditEvent>(
        "SELECT * FROM audit_logs WHERE correlation_id = $1 ORDER BY recorded_at",
        [correlationId]
      );
      return result.rows;
    },
  };
}

export { rejectCanary };
