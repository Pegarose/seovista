/**
 * Shared result-page status guard (B4 extraction).
 *
 * Extracted from the geo result page's correct pattern
 * (normalizeAuditStatusRecord + explicit `unknown` branch,
 * app/tools/geo-readiness-checker/result/[jobId]/page.tsx) so every tool
 * result page normalizes the persisted job_records.status into the public
 * lifecycle vocabulary and renders an explicit unknown-status state for
 * unrecognised persisted values instead of crashing on the result payload.
 *
 * The geo result page keeps its own inline copy for now (out of scope for
 * the B4 pass); new consumers must use this shared guard.
 */
import { normalizeAuditStatus, type AuditStatus } from "../geo-checker/audit-status";

/**
 * Normalizes a raw persisted job_records.status into the public lifecycle
 * vocabulary. Any value outside the vocabulary maps to the explicit
 * "unknown" state — never coerced, never thrown.
 */
export function normalizeJobResultStatus(rawStatus: unknown): AuditStatus {
  return normalizeAuditStatus(rawStatus);
}

// Back-compat re-export: the shared unknown-status view now lives in the
// result-pages kit. result-pages components do not import from this guard,
// so no circular dependency is introduced.
export { UnknownJobStatusView } from "../../components/result-pages";
