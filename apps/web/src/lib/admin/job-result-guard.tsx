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

/**
 * Explicit unknown-status view for tool result pages: exactly one <main>
 * landmark with one descriptive <h1>, no result components, no raw error
 * details. Rendered for any persisted status outside the supported
 * lifecycle vocabulary so the page never implicitly falls through to the
 * completed-result payload path.
 */
export function UnknownJobStatusView() {
  return (
    <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
        <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
          Denetim Durumu Belirlenemedi
        </h1>
        <p className="text-slate-700">
          Denetim sonucunun durumu belirlenemedi. Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.
        </p>
      </div>
    </main>
  );
}
