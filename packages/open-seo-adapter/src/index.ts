/**
 * @seovista/open-seo-adapter — Public Interface
 *
 * This package adapts reviewed patterns from every-app/open-seo
 * (v0.0.25, MIT, commit 3f2b4872caef809f0280a765f9eb469e8a6b523a)
 * behind SeoVista-owned interfaces.
 *
 * Only SeoVista-owned identifiers are exported from this module.
 * Apps must never import upstream types or paths directly.
 *
 * @owner SeoVista Foundation Team
 */

// Package identity
export const name: string = '@seovista/open-seo-adapter';

// Audit issue types — reviewed technical-SEO check registry
export {
  SeovistaIssueSeverityValues,
  SeovistaSeverityOrder,
  SeovistaAuditIssueTypeValues,
  getSeovistaIssueDescriptor,
  getSeovistaAllIssueTypes,
  getSeovistaIssueTypeKeys,
  issueDescriptorSchema,
  SeovistaIssueSeveritySchema,
} from './audit-issue-types.js';
export type {
  SeovistaIssueSeverity,
  SeovistaAuditIssueDescriptor,
  SeovistaAuditIssueType,
} from './audit-issue-types.js';

// Audit limits — shared page bounds
export {
  SeovistaAuditLimits,
  SeovistaAuditLimitsSchema,
  validateSeovistaAuditLimitConsistency,
} from './audit-limits.js';

// Error codes — canonical error classification
export {
  SeovistaErrorCodeSchema,
  isSeovistaErrorCode,
  shouldReportSeovistaError,
} from './error-codes.js';
export type { SeovistaErrorCode } from './error-codes.js';

// JSON codec — safe JSON parse/validate boundary
export { createSeovistaJsonCodec } from './json-codec.js';
export type { SeovistaJsonCodec } from './json-codec.js';

// Normalization contracts — DataForSEO response shapes
export {
  SeovistaApiCostRecordSchema,
  SeovistaKeywordMetricsSchema,
  SeovistaSerpItemSchema,
  SeovistaDomainOverviewSchema,
} from './normalization.js';
export type {
  SeovistaApiCostRecord,
  SeovistaKeywordMetrics,
  SeovistaSerpItem,
  SeovistaDomainOverview,
} from './normalization.js';
