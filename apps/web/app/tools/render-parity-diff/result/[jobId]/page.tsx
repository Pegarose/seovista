import type { RenderParityResultPayload } from "@seovista/worker";
import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";
import { normalizeJobResultStatus } from "../../../../../src/lib/admin/job-result-guard";
import { UnknownJobStatusView } from "../../../../../src/components/result-pages";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return {
    title: "Render Parity Sonucu - SeoVista",
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

function SideCard({
  label,
  side,
}: {
  label: string;
  side: { url: string; status: number; title: string; metaDescription: string; canonical: string; h1: readonly string[]; tokenCount: number };
}) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <h2 className="text-lg font-bold text-slate-900">{label}</h2>
      <dl className="text-sm space-y-2">
        <div className="flex justify-between gap-4"><dt className="text-slate-500">Son URL</dt><dd className="font-mono text-xs text-slate-800 break-all text-right">{side.url}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-slate-500">HTTP</dt><dd className="font-mono text-slate-800">{side.status}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-slate-500">Başlık</dt><dd className="text-slate-800 text-right">{side.title || "—"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-slate-500">Meta açıklama</dt><dd className="text-slate-800 text-right">{side.metaDescription || "—"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-slate-500">Canonical</dt><dd className="font-mono text-xs text-slate-800 break-all text-right">{side.canonical || "—"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-slate-500">H1</dt><dd className="text-slate-800 text-right">{side.h1.length > 0 ? side.h1.join(" · ") : "—"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-slate-500">Metin token sayısı</dt><dd className="font-mono text-slate-800">{side.tokenCount}</dd></div>
      </dl>
    </div>
  );
}

export default async function RenderParityJobResultPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  if (!UUID_RE.test(jobId)) {
    return (
      <ErrorState
        title="İşlem Bulunamadı"
        body="İstenen render parity denetimi bulunamadı. Lütfen işlem kimliğini (Job ID) kontrol edip tekrar deneyin."
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
        body="Render parity denetimi hizmeti şu anda kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin."
      />
    );
  }

  interface RenderParityJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
  }
  let jobRow: RenderParityJobRow | undefined;
  try {
    const res = await db.query<RenderParityJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'render_parity_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId],
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query render_parity_audit job record:", err);
    return (
      <ErrorState
        title="Hizmet Geçici Olarak Kullanılamıyor"
        body="Render parity denetimi sonucu şu anda alınamıyor. Lütfen tekrar deneyin."
      />
    );
  }

  if (!jobRow) {
    return <ErrorState title="İşlem Bulunamadı" body="İstenen denetim kaydı sistemde bulunamadı." />;
  }

  const status = normalizeJobResultStatus(jobRow.status);

  if (isAuditInFlightStatus(status)) {
    return (
      <Shell>
        <h1 className="text-3xl font-display font-semibold text-slate-900 text-center">
          {status === "queued"
            ? "Render Parity Denetimi Sırada"
            : status === "running"
            ? "Render Parity Denetimi Çalışıyor..."
            : "Render Parity Denetimi Beklemede"}
        </h1>
        <AuditPoller jobId={jobId} initialStatus={status} />
      </Shell>
    );
  }

  if (status === "failed" || status === "timeout" || status === "permanent" || status === "permanent_failure") {
    return (
      <ErrorState
        title="Render Parity Denetimi Başarısız Oldu"
        body="Denetim sırasında bir hata oluştu veya zaman aşımına uğrandı. Lütfen URL'yi kontrol edip tekrar deneyin."
      />
    );
  }

  if (status === "unknown") {
    return <UnknownJobStatusView />;
  }

  let payload: RenderParityResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      const parsed = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as unknown;
      if (parsed && typeof parsed === "object" && (parsed as { kind?: unknown }).kind === "render-parity") {
        payload = parsed as RenderParityResultPayload;
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

  const p = payload!;

  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Render Parity Karşılaştırması
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
              <h2 className="text-xl font-bold text-slate-900">Parity Skoru</h2>
              <p className="text-sm text-slate-500 mt-1">
                Tarayıcı ve botcrawler sürümlerinin gösterim benzerliği. Düşük skor = tarayıcılar
                farklı (veya eksik) içerik görür.
              </p>
            </div>
            <div className="text-4xl font-extrabold text-slate-900" aria-label={`Skor: ${p.score}/100`}>
              {p.score}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Metin benzerliği</p>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${Math.round(p.renderedParityRatio * 100)}%` }}
                aria-hidden
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Metin benzerliği oranı: {Math.round(p.renderedParityRatio * 100)}%
            </p>
          </div>
        </div>

        {p.issues.length > 0 && (
          <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm" role="status">
            <p className="text-sm font-semibold text-amber-900 mb-2">
              {p.issues.length} fark tespit edildi
            </p>
            <ul className="list-disc pl-5 text-sm text-amber-800 space-y-1">
              {p.issues.map((issue, i) => (
                <li key={i}>
                  <span className="font-semibold uppercase text-[10px]">{issue.severity === "error" ? "Hata" : "Uyarı"}</span>
                  <span className="font-mono text-xs text-amber-700">[{issue.field}]</span> — {issue.description}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SideCard label="Varsayılan (browser) istek" side={p.default} />
          <SideCard label="Tarayıcı (bot) isteği" side={p.crawler} />
        </div>

        {p.h1OnlyInDefault.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Yalnızca varsayılanda olan H1'ler</h2>
            <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
              {p.h1OnlyInDefault.map((h1) => (
                <li key={h1} className="font-mono">"{h1}"</li>
              ))}
            </ul>
          </div>
        )}
        {p.h1OnlyInCrawler.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Yalnızca botcrawler'da olan H1'ler</h2>
            <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
              {p.h1OnlyInCrawler.map((h1) => (
                <li key={h1} className="font-mono">"{h1}"</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
