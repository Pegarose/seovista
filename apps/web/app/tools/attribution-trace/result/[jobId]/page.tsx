import Link from "next/link";
import type { AttributionTraceResultPayload } from "@seovista/worker";
import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";
import { normalizeJobResultStatus } from "../../../../../src/lib/admin/job-result-guard";
import { UnknownJobStatusView } from "../../../../../src/components/result-pages";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return {
    title: "Attribution Trace Sonucu · SeoVista",
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

type VerdictKind = "self" | "external" | "misattributed" | "unverifiable";

const KIND_META: Record<VerdictKind, { label: string; badge: string }> = {
  self: {
    label: "Kendi içeriğiniz",
    badge: "border-emerald-300 bg-emerald-100 text-emerald-800",
  },
  external: {
    label: "Dış kaynak",
    badge: "border-sky-300 bg-sky-100 text-sky-800",
  },
  misattributed: {
    label: "Yanlış atıf",
    badge: "border-rose-300 bg-rose-100 text-rose-800",
  },
  unverifiable: {
    label: "Doğrulanamayan",
    badge: "border-slate-300 bg-slate-100 text-slate-700",
  },
};

function MetricTile({
  label,
  value,
  borderClass,
}: {
  label: string;
  value: number;
  borderClass: string;
}) {
  return (
    <div className={`bg-white p-4 rounded-xl border-l-4 border border-slate-200 shadow-sm ${borderClass}`}>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default async function AttributionTraceJobResultPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  if (!UUID_RE.test(jobId)) {
    return (
      <ErrorState
        title="İşlem Bulunamadı"
        body="İstenen Attribution Trace denetimi sonucu bulunamadı. Lütfen işlem kimliğini (Job ID) kontrol edip tekrar deneyin."
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
        body="Attribution Trace denetimi hizmeti şu anda kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin."
      />
    );
  }

  interface AttributionTraceJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
  }
  let jobRow: AttributionTraceJobRow | undefined;
  try {
    const res = await db.query<AttributionTraceJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'attribution_trace_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId],
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query attribution_trace_audit job record:", err);
    return (
      <ErrorState
        title="Hizmet Geçici Olarak Kullanılamıyor"
        body="Attribution Trace denetimi sonucu şu anda alınamıyor. Lütfen tekrar deneyin."
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

  const status = normalizeJobResultStatus(jobRow.status);

  if (isAuditInFlightStatus(status)) {
    return (
      <Shell>
        <h1 className="text-3xl font-display font-semibold text-slate-900 text-center">
          {status === "queued"
            ? "Attribution Trace Denetimi Sırada"
            : status === "running"
            ? "Attribution Trace Denetimi Çalışıyor..."
            : "Attribution Trace Denetimi Beklemede"}
        </h1>
        <AuditPoller jobId={jobId} initialStatus={status} />
      </Shell>
    );
  }

  if (status === "failed" || status === "timeout" || status === "permanent" || status === "permanent_failure") {
    return (
      <ErrorState
        title="Denetim Başarısız Oldu"
        body="Denetim sıraylayıcısı (worker) alan adını reddetmiş olabilir ya da sayfa çekme işlemi zaman aşımına uğradı. Lütfen URL'yi kontrol edip tekrar deneyin."
      />
    );
  }

  if (status === "unknown") {
    return <UnknownJobStatusView />;
  }

  let payload: AttributionTraceResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      const parsed = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: unknown }).kind === "attribution-trace"
      ) {
        payload = parsed as AttributionTraceResultPayload;
      }
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    return (
      <ErrorState
        title="Sonuç Verisi Kullanılamıyor"
        body="Denetim tamamlandı ancak sonuç verisi okunamadı. Lütfen sayfayı yenileyiniz."
      />
    );
  }

  const safePayload = payload;
  const serpSources = safePayload.serpSources ?? [];

  const resolveSourceUrl = (bestSourceId: string): { label: string; url: string } | null => {
    if (bestSourceId === "self") {
      const domain = jobRow.target ?? "";
      return {
        label: jobRow.target ?? "Siteniz",
        url: domain.startsWith("http") ? domain : `https://${domain}/`,
      };
    }
    const src = serpSources.find((s) => s.id === bestSourceId);
    if (!src || !src.url) return null;
    return { label: src.label, url: src.url };
  };

  return (
    <main id="main" className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Attribution Trace Sonucu
          </h1>
          <div className="mt-3">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-mono text-slate-700 break-all">
              {jobRow.target ?? "—"}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">İzlenebilirlik Skoru</h2>
              <p className="text-sm text-slate-500 mt-1">
                Yapıştırılan AI yanıtındaki iddiaların gözlemlenebilir kaynaklarla metinsel
                örtüşmesi. Düşük skor = pek çok iddia herhangi bir kaynağa izlenemedi.
              </p>
            </div>
            <div className="flex items-baseline gap-1" aria-label={`Skor: ${safePayload.score}/100`}>
              <span className="text-5xl font-extrabold text-slate-900">{safePayload.score}</span>
              <span className="text-lg font-semibold text-slate-400">/100</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile label="Toplam iddia" value={safePayload.totalClaims} borderClass="border-l-slate-400" />
          <MetricTile label="Kendi içeriğinizle desteklenen" value={safePayload.selfClaims} borderClass="border-l-emerald-500" />
          <MetricTile label="Dış kaynak" value={safePayload.externalClaims} borderClass="border-l-sky-500" />
          <MetricTile label="Doğrulanamayan" value={safePayload.unverifiableClaims + safePayload.misattributedClaims} borderClass="border-l-rose-500" />
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">İddia Dökümü</h2>
          {safePayload.verdicts.length === 0 ? (
            <p className="text-sm text-slate-600">
              Yanıtta denetlenecek iddia bulunamadı.
            </p>
          ) : (
            <ul className="space-y-3">
              {safePayload.verdicts.map((verdict, idx) => {
                const meta = KIND_META[verdict.kind];
                const similarityPct = Math.round(verdict.bestSimilarity * 100);
                const source = verdict.bestSourceId ? resolveSourceUrl(verdict.bestSourceId) : null;
                return (
                  <li
                    key={`${idx}-${verdict.claim.slice(0, 32)}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm space-y-2"
                  >
                    <p className="text-sm text-slate-800">{verdict.claim}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.badge}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        Benzerlik: %{similarityPct}
                      </span>
                    </div>
                    {source && (
                      <p className="text-xs text-slate-600">
                        Kaynak:{" "}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono break-all text-slate-900 underline decoration-slate-300 hover:decoration-slate-600"
                        >
                          {source.label}
                        </a>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Bu skor yalnızca yapıştırılan AI yanıtı ile gözlemlenebilir kaynaklar arasındaki metin
          örtüşmesini ölçer; LLM'in nasıl karar verdiğini veya sıralamanızı doğrudan etkilemez.
        </p>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <Link
            href="/tools/schema-truth-check/"
            className="block text-sm font-semibold text-slate-900 hover:text-slate-600 transition-colors"
          >
            Sitenizin iddialarını sayfa metniyle doğrulamak için Schema Truth aracını da deneyin →
          </Link>
        </div>
      </div>
    </main>
  );
}
