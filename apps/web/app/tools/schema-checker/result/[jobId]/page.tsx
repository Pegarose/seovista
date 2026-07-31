import { getAdminDb } from "../../../../../src/lib/admin/db";
import { SchemaScoreOverview } from "../../../../../src/components/schema-checker/schema-score-overview";
import { SchemaGraphTree } from "../../../../../src/components/schema-checker/schema-graph-tree";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { CrewCtaView } from "../../../../../src/components/geo-checker/crew-cta-view";
import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return {
    title: "Schema Denetim Sonucu - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

interface SchemaAuditResultPayload {
  rawScriptCount: number;
  validNodes: Record<string, unknown>[];
  parseErrors: string[];
  prohibitedClaims: Array<{ field: string; reason: string }>;
  score: number;
}

export default async function SchemaJobResultPage({
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
            İstenen denetim sonucu bulunamadı. Lütfen işlem kimliğini (Job ID) kontrol edip tekrar deneyin.
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
            Schema denetim hizmeti şu anda kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin.
          </p>
        </div>
      </main>
    );
  }

  let jobRow;
  try {
    const res = await db.query(
      `SELECT id, target, service, status, result_payload, created_at, updated_at
       FROM job_records WHERE id = $1 AND service = 'schema_audit'`,
      [jobId]
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query schema_audit job record:", err);
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Hizmet Geçici Olarak Kullanılamıyor
          </h1>
          <p className="text-slate-700">
            Schema denetim sonucu şu anda alınamıyor. Lütfen tekrar deneyin.
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

  const status = jobRow.status as string;

  if (isAuditInFlightStatus(status)) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-8">
        <h1 className="text-3xl font-display font-semibold text-slate-900 text-center">
          {status === "queued"
            ? "Schema Denetimi Sırada"
            : status === "running"
            ? "Schema Denetimi Çalışıyor..."
            : "Schema Denetimi Beklemede"}
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
            Denetim Başarısız Oldu
          </h1>
          <p className="text-slate-700">
            Schema denetim işlemi sırasında bir hata oluştu veya zaman aşımına uğrandı. Lütfen hedef URL&apos;yi kontrol edip tekrar deneyin.
          </p>
        </div>
      </main>
    );
  }

  let payload: SchemaAuditResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      payload = typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload;
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
            Denetim tamamlandı ancak sonuç verisi okunamadı. Lütfen sayfayı yenileyiniz.
          </p>
        </div>
      </main>
    );
  }

  const safePayload = payload!;
  const scoreBand = safePayload.score >= 80 ? "high" : safePayload.score >= 50 ? "medium" : "low";

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Schema &amp; Yapısal Veri Denetim Sonucu
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Hedef URL:{" "}
            <span className="font-mono font-medium text-slate-800 break-all">
              {jobRow.target}
            </span>
          </p>
        </div>

        <SchemaScoreOverview
          score={safePayload.score}
          rawScriptCount={safePayload.rawScriptCount}
          parseErrorCount={safePayload.parseErrors?.length ?? 0}
          prohibitedClaimCount={safePayload.prohibitedClaims?.length ?? 0}
        />

        {safePayload.prohibitedClaims && safePayload.prohibitedClaims.length > 0 && (
          <div className="bg-red-50 p-6 rounded-xl border border-red-200 shadow-sm space-y-3">
            <h2 className="text-lg font-bold text-red-900 flex items-center gap-2">
              <span role="img" aria-label="Uyarı">⚠️</span> Yasaklı ve Hileli İddia Uyarıları
            </h2>
            <p className="text-sm text-red-700">
              Arama motorları ve AI sistemleri (Google, Perplexity) tarafından cezalandırılmasına yol açabilecek hileli Schema etiketleri tespit edildi:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-red-800 font-medium">
              {safePayload.prohibitedClaims.map((claim, idx) => (
                <li key={idx}>
                  <strong className="font-mono">{claim.field}:</strong> {claim.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {safePayload.parseErrors && safePayload.parseErrors.length > 0 && (
          <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 shadow-sm space-y-3">
            <h2 className="text-lg font-bold text-amber-900">Ayrıştırma / Sözdizimi Hataları</h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-amber-800 font-mono">
              {safePayload.parseErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <SchemaGraphTree nodes={safePayload.validNodes || []} />

        <CrewCtaView scoreBand={scoreBand} />
      </div>
    </main>
  );
}
