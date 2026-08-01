import { getAdminDb } from "../../../../../src/lib/admin/db";
import { CrawlerAccessMatrix } from "../../../../../src/components/ai-crawler-checker/crawler-access-matrix";
import { CrawlerIssues } from "../../../../../src/components/ai-crawler-checker/crawler-issues";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { CrewCtaView } from "../../../../../src/components/geo-checker/crew-cta-view";
import { CrewReportSection } from "../../../../../src/components/crew-report/crew-report-section";
import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";
import {
  normalizeJobResultStatus,
  UnknownJobStatusView,
} from "../../../../../src/lib/admin/job-result-guard";
import { getSchemaScoreBand, type SchemaScoreBand } from "../../../../../src/lib/score-band";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return {
    title: "AI Crawler Denetim Sonucu - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

interface AiCrawlerAuditResultPayload {
  score: number;
  robotsTxtFound: boolean;
  robotsTxtUrl: string;
  sitemaps: string[];
  crawlers: Array<{
    userAgent: string;
    label: string;
    category: "ai-training" | "ai-search" | "search";
    status: "allowed" | "blocked" | "partial";
  }>;
  conflicts: Array<{ description: string; lines: string[] }>;
  recommendations: string[];
  parseErrors: string[];
}

const BAND_PRESENTATION: Record<SchemaScoreBand, { statusText: string; statusBg: string }> = {
  excellent: {
    statusText: "Mükemmel",
    statusBg: "bg-green-50 text-green-700 border-green-200",
  },
  good: {
    statusText: "İyi",
    statusBg: "bg-green-50 text-green-700 border-green-200",
  },
  needs_improvement: {
    statusText: "İyileştirilebilir",
    statusBg: "bg-amber-50 text-amber-700 border-amber-200",
  },
  poor: {
    statusText: "Zayıf",
    statusBg: "bg-red-50 text-red-700 border-red-200",
  },
  critical: {
    statusText: "Kritik / Hatalı",
    statusBg: "bg-red-50 text-red-700 border-red-200",
  },
};

export default async function AiCrawlerJobResultPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  if (!UUID_RE.test(jobId)) {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
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
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Hizmet Geçici Olarak Kullanılamıyor
          </h1>
          <p className="text-slate-700">
            AI crawler denetim hizmeti şu anda kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin.
          </p>
        </div>
      </main>
    );
  }

  interface AiCrawlerJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
  }
  let jobRow: AiCrawlerJobRow | undefined;
  try {
    // Results live in job_results (JSONB), joined via correlation_id — the
    // same contract the geo repository's getJobResultPayload uses. The
    // queue_name filter scopes the lookup to AI crawler audits.
    const res = await db.query<AiCrawlerJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'ai_crawler_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId]
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query ai_crawler_audit job record:", err);
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Hizmet Geçici Olarak Kullanılamıyor
          </h1>
          <p className="text-slate-700">
            AI crawler denetim sonucu şu anda alınamıyor. Lütfen tekrar deneyin.
          </p>
        </div>
      </main>
    );
  }

  if (!jobRow) {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
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
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-8">
        <h1 className="text-3xl font-display font-semibold text-slate-900 text-center">
          {status === "queued"
            ? "AI Crawler Denetimi Sırada"
            : status === "running"
            ? "AI Crawler Denetimi Çalışıyor..."
            : "AI Crawler Denetimi Beklemede"}
        </h1>
        <AuditPoller jobId={jobId} initialStatus={status} />
      </main>
    );
  }

  if (status === "failed" || status === "timeout" || status === "permanent" || status === "permanent_failure") {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Denetim Başarısız Oldu
          </h1>
          <p className="text-slate-700">
            AI crawler denetim işlemi sırasında bir hata oluştu veya zaman aşımına uğrandı. Lütfen hedef URL&apos;yi kontrol edip tekrar deneyin.
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

  let payload: AiCrawlerAuditResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      payload = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as AiCrawlerAuditResultPayload;
    } catch {
      payload = null;
    }
  }

  if (status === "completed" && !payload) {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
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
  const crawlers = safePayload.crawlers ?? [];
  const sitemaps = safePayload.sitemaps ?? [];
  const conflicts = safePayload.conflicts ?? [];
  const recommendations = safePayload.recommendations ?? [];
  const parseErrors = safePayload.parseErrors ?? [];
  const scoreBand = getSchemaScoreBand(safePayload.score);
  const { statusText, statusBg } = BAND_PRESENTATION[scoreBand];

  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            AI Crawler Erişim Denetim Sonucu
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Hedef URL:{" "}
            <span className="font-mono font-medium text-slate-800 break-all">
              {jobRow.target}
            </span>
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">AI Görünürlük Skoru</h2>
              <p className="text-sm text-slate-500 mt-1">
                robots.txt politikanızın AI arama ve geleneksel arama botlarına açıklık özeti.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-4xl font-extrabold text-slate-900" aria-label={`Skor: ${safePayload.score}`}>
                {safePayload.score}
              </div>
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusBg}`}
                role="status"
              >
                {statusText}
              </span>
            </div>
          </div>
        </div>

        {safePayload.robotsTxtFound ? (
          <div className="bg-green-50 p-6 rounded-xl border border-green-200 shadow-sm space-y-2">
            <h2 className="text-lg font-bold text-green-900">robots.txt Bulundu</h2>
            <p className="text-sm text-green-800">
              <span className="font-mono break-all">{safePayload.robotsTxtUrl}</span> adresindeki
              robots.txt dosyanız başarıyla alındı ve ayrıştırıldı.
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 shadow-sm space-y-2">
            <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
              <span role="img" aria-label="Uyarı">⚠️</span> robots.txt Bulunamadı
            </h2>
            <p className="text-sm text-amber-800">
              <span className="font-mono break-all">{safePayload.robotsTxtUrl}</span> adresinde bir
              robots.txt dosyası bulunamadı. Dosya yokken tüm botlar varsayılan olarak sitenize
              erişebilir; net bir erişim politikası için robots.txt oluşturmanız önerilir.
            </p>
          </div>
        )}

        {sitemaps.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Sitemap Dosyaları</h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-slate-700 font-mono break-all">
              {sitemaps.map((sitemap, idx) => (
                <li key={idx}>{sitemap}</li>
              ))}
            </ul>
          </div>
        )}

        <CrawlerAccessMatrix crawlers={crawlers} />

        {parseErrors.length > 0 && (
          <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 shadow-sm space-y-3">
            <h2 className="text-lg font-bold text-amber-900">Ayrıştırma / Sözdizimi Hataları</h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-amber-800 font-mono">
              {parseErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <CrawlerIssues conflicts={conflicts} recommendations={recommendations} />

        <CrewCtaView scoreBand={scoreBand} />

        <CrewReportSection sourceJobId={jobId} tool="ai-crawler" />
      </div>
    </main>
  );
}
