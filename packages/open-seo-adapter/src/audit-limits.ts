/**
 * SeoVista Audit Limits
 *
 * Adapted from every-app/open-seo (v0.0.25, MIT)
 * Upstream: src/shared/audit-limits.ts
 * Commit: 3f2b4872caef809f0280a765f9eb469e8a6b523a
 *
 * Named constants for per-audit page bounds. Shared between the launch
 * form, input schema, and server-side tier gate so all consumers agree
 * on the same numbers.
 *
 * @owner SeoVista Foundation Team
 * @review Accepted — Sprint 0 adaptation boundary
 */

import { z } from 'zod';

export const SeovistaAuditLimits = {
  /** Minimum pages per audit */
  MIN_AUDIT_PAGES: 10,
  /** Default page count when user doesn't specify */
  DEFAULT_AUDIT_PAGES: 50,
  /** Maximum pages for free-tier audits */
  FREE_MAX_AUDIT_PAGES: 50,
  /** Maximum pages for paid-tier audits */
  PAID_MAX_AUDIT_PAGES: 10_000,
} as const;

export const SeovistaAuditLimitsSchema = z.object({
  minPages: z.literal(SeovistaAuditLimits.MIN_AUDIT_PAGES),
  defaultPages: z.literal(SeovistaAuditLimits.DEFAULT_AUDIT_PAGES),
  freeMaxPages: z.literal(SeovistaAuditLimits.FREE_MAX_AUDIT_PAGES),
  paidMaxPages: z.literal(SeovistaAuditLimits.PAID_MAX_AUDIT_PAGES),
});

/**
 * Validates that limit constants are internally consistent:
 * min <= default <= free-max <= paid-max
 */
export function validateSeovistaAuditLimitConsistency(): boolean {
  const { MIN_AUDIT_PAGES, DEFAULT_AUDIT_PAGES, FREE_MAX_AUDIT_PAGES, PAID_MAX_AUDIT_PAGES } =
    SeovistaAuditLimits;
  return (
    MIN_AUDIT_PAGES <= DEFAULT_AUDIT_PAGES &&
    DEFAULT_AUDIT_PAGES <= FREE_MAX_AUDIT_PAGES &&
    FREE_MAX_AUDIT_PAGES <= PAID_MAX_AUDIT_PAGES
  );
}
