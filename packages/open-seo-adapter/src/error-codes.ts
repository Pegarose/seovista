/**
 * SeoVista Error Codes
 *
 * Adapted from every-app/open-seo (v0.0.25, MIT)
 * Upstream: src/shared/error-codes.ts
 * Commit: 3f2b4872caef809f0280a765f9eb469e8a6b523a
 *
 * Canonical error code enum shared between server and client for
 * consistent error classification and observability filtering.
 *
 * @owner SeoVista Foundation Team
 * @review Accepted — Sprint 0 adaptation boundary
 */

import { z } from 'zod';

const ERROR_CODES = [
  'UNAUTHENTICATED',
  'AUTH_CONFIG_MISSING',
  'PAYMENT_REQUIRED',
  'INSUFFICIENT_CREDITS',
  'FORBIDDEN',
  'NOT_FOUND',
  'AUDIT_CAPACITY_REACHED',
  'AUDIT_PAGE_LIMIT_EXCEEDED',
  'AUDIT_ALREADY_RUNNING',
  'VALIDATION_ERROR',
  'CRAWL_TARGET_BLOCKED',
  'DATAFORSEO_AUTH_FAILED',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'CONFLICT',
  'INTERNAL_ERROR',
  // SeoVista-specific additions
  'NEXTG_UNAVAILABLE',
  'WORKER_HEALTH_FAILED',
] as const;

export const SeovistaErrorCodeSchema = z.enum(ERROR_CODES);

export type SeovistaErrorCode = z.infer<typeof SeovistaErrorCodeSchema>;

/**
 * Error codes that should NOT be reported to observability/error tracking
 * because they represent expected user-facing states rather than system faults.
 */
const NON_REPORTABLE_ERROR_CODES: ReadonlySet<SeovistaErrorCode> = new Set([
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'PAYMENT_REQUIRED',
  'INSUFFICIENT_CREDITS',
  'VALIDATION_ERROR',
  'AUDIT_CAPACITY_REACHED',
  'AUDIT_PAGE_LIMIT_EXCEEDED',
  'AUDIT_ALREADY_RUNNING',
]);

/**
 * Type guard: checks whether a string is a known Seovista error code.
 */
export function isSeovistaErrorCode(value: string): value is SeovistaErrorCode {
  return SeovistaErrorCodeSchema.safeParse(value).success;
}

/**
 * Returns true if the error code should be reported to observability.
 * Returns false for expected user-facing codes that do not indicate system faults.
 */
export function shouldReportSeovistaError(
  code: SeovistaErrorCode | null | undefined,
): boolean {
  return (
    code === null ||
    code === undefined ||
    !NON_REPORTABLE_ERROR_CODES.has(code)
  );
}
