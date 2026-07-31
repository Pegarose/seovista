import { SERP_LOCALES } from "@seovista/seo-core";
import type { KeywordRankResultPayload } from "@seovista/worker";
import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";
import {
  normalizeJobResultStatus,
  UnknownJobStatusView,
} from "../../../../../src/lib/admin/job-result-guard";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return {
    title: "Sıralama Kontrol Sonucu - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function KeywordRankJobResultPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  if (!UUID_RE.test(jobId)) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            İşlem Bulunamadı
          </h1>
          <p className="text-slate-700">
            İstenen sıralama kontrolü sonucu bulunamadı. Lütfen işlem kimliğini (Job ID) kontrol edip tekrar deneyin.
          </p>
        </div>
      </main>
    );
  }

  let db;
  try {
    db = getAdminDb();
  } catch {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Hizmet Geçici Olarak Kullanılamıyor
          </h1>
          <p className="text-slate-700">
            Sıralama kontrolü hizmeti şu anda kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin.
          </p>
        </div>
      </main>
    );
  }

  interface KeywordRankJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
  }
  let jobRow: KeywordRankJobRow | undefined;
  try {
    // Results live in job_results (JSONB), joined via correlation_id — the
    // same contract the other tool result pages use. The queue_name filter
    // scopes the lookup to keyword rank audits.
    const res = await db.query<KeywordRankJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'keyword_rank_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId]
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query keyword_rank_audit job record:", err);
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Hizmet Geçici Olarak Kullanılamıyor
          </h1>
          <p className="text-slate-700">
            Sıralama kontrolü sonucu şu anda alınamıyor. Lütfen tekrar deneyin.
          </p>
        </div>
      </main>
    );
  }

  if (!jobRow) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            İşlem Bulunamadı
          </h1>
          <p className="text-slate-700">
            İstenen denetim kaydı sistemde bulunamadı.
          </p>
        </div>
      </main>
    );
  }

  // Normalize the persisted status into the public lifecycle vocabulary so
  // an unrecognised persisted value renders the explicit unknown-status
  // state instead of falling through to the completed-result payload path.
  const status = normalizeJobResultStatus(jobRow.status);

  if (isAuditInFlightStatus(status)) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-8">
        <h1 className="text-3xl font-display font-semibold text-slate-900 text-center">
          {status === "queued"
            ? "Sıralama Kontrolü Sırada"
            : status === "running"
            ? "Sıralama Kontrolü Çalışıyor..."
            : "Sıralama Kontrolü Beklemede"}
        </h1>
        <AuditPoller jobId={jobId} initialStatus={status} />
      </main>
    );
  }

  if (status === "failed" || status === "timeout" || status === "permanent" || status === "permanent_failure") {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Sıralama Kontrolü Başarısız Oldu
          </h1>
          <p className="text-slate-700">
            Sıralama kontrolü sırasında bir hata oluştu veya zaman aşımına uğrandı. Lütfen alan adını ve anahtar kelimeyi kontrol edip tekrar deneyin.
          </p>
        </div>
      </main>
    );
  }

  // -- Unknown persisted status: explicit unavailable state --
  // Any status value not in the supported lifecycle vocabulary renders the
  // shared explicit-unknown view rather than crashing on the result payload.
  if (status === "unknown") {
    return <UnknownJobStatusView />;
  }

  let payload: KeywordRankResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      const parsed = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: unknown }).kind === "keyword-rank"
      ) {
        payload = parsed as KeywordRankResultPayload;
      }
    } catch {
      payload = null;
    }
  }

  if (status === "completed" && !payload) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Sonuç Verisi Kullanılamıyor
          </h1>
          <p className="text-slate-700">
            Kontrol tamamlandı ancak sonuç verisi okunamadı. Lütfen sayfayı yenileyiniz.
          </p>
        </div>
      </main>
    );
  }

  const safePayload = payload!;
  const top10 = safePayload.top10 ?? [];
  const localeMeta = (SERP_LOCALES as Record<string, { label: string }>)[safePayload.locale];
  const localeLabel = localeMeta?.label ?? safePayload.locale;

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Sıralama Kontrol Sonucu
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Alan Adı:{" "}
            <span className="font-mono font-medium text-slate-800 break-all">
              {safePayload.domain}
            </span>{" "}
            · Anahtar Kelime:{" "}
            <span className="font-medium text-slate-800">{safePayload.keyword}</span> · Bölge:{" "}
            <span className="font-medium text-slate-800">{localeLabel}</span>
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Gözlemlenen Sıralama</h2>
              <p className="text-sm text-slate-500 mt-1">
                {safePayload.position !== null
                  ? `Hedef alan adı, "${safePayload.keyword}" sorgusunda ilk 10 sonuç içinde listelendi.`
                  : "Hedef alan adı ilk 10 sonuçta bulunamadı."}
              </p>
            </div>
            <div
              className="text-4xl font-extrabold text-slate-900"
              aria-label={
                safePayload.position !== null
                  ? `Sıralama: ${safePayload.position}`
                  : "Sıralama: İlk 10'da yok"
              }
            >
              {safePayload.position !== null ? `#${safePayload.position}` : "İlk 10'da yok"}
            </div>
          </div>
        </div>

        {safePayload.dataSource === "mock" ? (
          <div
            className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm"
            role="status"
          >
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Örnek veri</span> — SearXNG yapılandırılmamış;
              sonuçlar deterministik örnek veridir.
            </p>
          </div>
        ) : (
          <div
            className="bg-slate-100 p-4 rounded-xl border border-slate-200 shadow-sm"
            role="status"
          >
            <p className="text-sm text-slate-700">
              Veri kaynağı: SearXNG · Kontrol zamanı:{" "}
              <span className="font-mono">{safePayload.checkedAt}</span>
            </p>
          </div>
        )}

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">İlk 10 Sonuç</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th scope="col" className="py-2 pr-4 font-semibold">Sıra</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Başlık</th>
                  <th scope="col" className="py-2 font-semibold">URL</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((entry) => (
                  <tr
                    key={entry.position}
                    className={
                      entry.isTarget
                        ? "bg-amber-50 border-b border-amber-100"
                        : "border-b border-slate-100"
                    }
                  >
                    <td className="py-2 pr-4 tabular-nums text-slate-700">{entry.position}</td>
                    <td className="py-2 pr-4 text-slate-900">
                      {entry.title}
                      {entry.isTarget && (
                        <span className="ml-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          Sizin siteniz
                        </span>
                      )}
                    </td>
                    <td className="py-2 font-mono text-xs text-slate-600 break-all">{entry.url}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <a
            href="/tools/geo-readiness-checker/"
            className="block text-sm font-semibold text-slate-900 hover:text-slate-600 transition-colors"
          >
            GEO Hazırlık Denetimi ile sitenizi AI aramaya hazırlayın →
          </a>
        </div>
      </div>
    </main>
  );
}
