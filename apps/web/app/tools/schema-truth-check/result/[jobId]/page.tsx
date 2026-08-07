import type { SchemaTruthResultPayload } from "@seovista/worker";
import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";
import { normalizeJobResultStatus } from "../../../../../src/lib/admin/job-result-guard";
import { UnknownJobStatusView } from "../../../../../src/components/result-pages";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return {
    title: "Schema Doğruluk Sonucu - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      {children}
    </main>
  );
}

function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
        <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">{title}</h1>
        <p className="text-slate-700">{body}</p>
      </div>
    </Shell>
  );
}

export default async function SchemaTruthJobResultPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  if (!UUID_RE.test(jobId)) {
    return (
      <ErrorState
        title="İşlem Bulunamadı"
        body="İstenen schema doğruluk denetimi sonucu bulunamadı. Lütfen işlem kimliğini (Job ID) kontrol edip tekrar deneyin."
      />
    );
  }

  let db;
  try {
    db = getAdminDb();
  } catch {
    return (
      <ErrorState
        title="Hizmet Geçici Olarak Kullanılamıyor"
        body="Schema doğruluk denetimi hizmeti şu anda kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin."
      />
    );
  }

  interface SchemaTruthJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
  }
  let jobRow: SchemaTruthJobRow | undefined;
  try {
    // Results live in job_results (JSONB), joined via correlation_id — the
    // same contract the other tool result pages use. The queue_name filter
    // scopes the lookup to schema truth audits.
    const res = await db.query<SchemaTruthJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'schema_truth_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId],
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query schema_truth_audit job record:", err);
    return (
      <ErrorState
        title="Hizmet Geçici Olarak Kullanılamıyor"
        body="Schema doğruluk denetimi sonucu şu anda alınamıyor. Lütfen tekrar deneyin."
      />
    );
  }

  if (!jobRow) {
    return (
      <ErrorState
        title="İşlem Bulunamadı"
        body="İstenen denetim kaydı sistemde bulunamadı."
      />
    );
  }

  // Normalize the persisted status into the public lifecycle vocabulary so
  // an unrecognised persisted value renders the explicit unknown-status
  // state instead of falling through to the completed-result payload path.
  const status = normalizeJobResultStatus(jobRow.status);

  if (isAuditInFlightStatus(status)) {
    return (
      <Shell>
        <h1 className="text-3xl font-display font-semibold text-slate-900 text-center">
          {status === "queued"
            ? "Schema Doğruluk Denetimi Sırada"
            : status === "running"
            ? "Schema Doğruluk Denetimi Çalışıyor..."
            : "Schema Doğruluk Denetimi Beklemede"}
        </h1>
        <AuditPoller jobId={jobId} initialStatus={status} />
      </Shell>
    );
  }

  if (status === "failed" || status === "timeout" || status === "permanent" || status === "permanent_failure") {
    return (
      <ErrorState
        title="Schema Doğruluk Denetimi Başarısız Oldu"
        body="Denetim sırasında bir hata oluştu veya zaman aşımına uğrandı. Lütfen URL'yi kontrol edip tekrar deneyin."
      />
    );
  }

  if (status === "unknown") {
    return <UnknownJobStatusView />;
  }

  let payload: SchemaTruthResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      const parsed = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: unknown }).kind === "schema-truth"
      ) {
        payload = parsed as SchemaTruthResultPayload;
      }
    } catch {
      payload = null;
    }
  }

  if (status === "completed" && !payload) {
    return (
      <ErrorState
        title="Sonuç Verisi Kullanılamıyor"
        body="Denetim tamamlandı ancak sonuç verisi okunamadı. Lütfen sayfayı yenileyiniz."
      />
    );
  }

  const safePayload = payload!;
  const findings = safePayload.findings ?? [];

  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Schema Doğruluk Sonucu
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Sayfa:{" "}
            <span className="font-mono font-medium text-slate-800 break-all">
              {jobRow.target ?? "—"}
            </span>
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Doğruluk Skoru</h2>
              <p className="text-sm text-slate-500 mt-1">
                {safePayload.totalClaims === 0
                  ? "Bu sayfa için denetlenecek bir iddia bulunamadı (JSON-LD yok ya da yalnızca bilinmeyen şema türleri mevcut)."
                  : `${safePayload.totalClaims} iddianın ${safePayload.verifiedClaims} tanesi sayfa metninde yer alıyor.`}
              </p>
            </div>
            <div
              className="text-4xl font-extrabold text-slate-900"
              aria-label={`Skor: ${safePayload.score}/100`}
            >
              {safePayload.totalClaims === 0 ? "—" : `${safePayload.score}`}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Skor, JSON-LD iddialarının sayfa metninde bulunma oranıdır — SEO sıralaması, güven
            veya zengin sonuç garantisi vermez.
          </p>
        </div>

        {safePayload.parseErrors.length > 0 && (
          <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm" role="status">
            <p className="text-sm font-semibold text-amber-900 mb-2">Ayrıştırma hatası ({safePayload.parseErrors.length})</p>
            <ul className="list-disc pl-5 text-sm text-amber-800 space-y-1">
              {safePayload.parseErrors.map((err) => (
                <li key={err} className="font-mono text-xs break-all">{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">İddia Dökümü</h2>
          {findings.length === 0 ? (
            <p className="text-sm text-slate-600">
              Bu sayfada denetlenecek claim bulunamadı. JSON-LD blokları yok ya da sayfa sadece
              desteklenmeyen <code className="font-mono text-xs">@type</code> değerleri içeriyor
              (Organization, Person, Article/BlogPosting/NewsArticle, Product, Service
              desteklenir).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th scope="col" className="py-2 pr-4 font-semibold">Alan</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Şemadaki değer</th>
                    <th scope="col" className="py-2 font-semibold">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((finding, idx) => (
                    <tr
                      key={`${finding.field}-${idx}`}
                      className={
                        finding.status === "verified"
                          ? "border-b border-slate-100"
                          : "border-b border-amber-100 bg-amber-50"
                      }
                    >
                      <td className="py-2 pr-4 font-mono text-xs text-slate-700">{finding.field}</td>
                      <td className="py-2 pr-4 text-slate-900 break-all">{finding.value}</td>
                      <td className="py-2">
                        {finding.status === "verified" ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Doğrulandı
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            Sayfada yok
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <a
            href="/tools/schema-checker/"
            className="block text-sm font-semibold text-slate-900 hover:text-slate-600 transition-colors"
          >
            Yapılandırılmış veri hatalarını detaylı görmek için Schema Checker aracını deneyin →
          </a>
        </div>
      </div>
    </main>
  );
}
