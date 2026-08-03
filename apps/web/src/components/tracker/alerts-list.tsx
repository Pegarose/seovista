import type { AlertSummary } from "@seovista/worker";

const KIND_LABEL: Record<string, string> = {
  dropped_out_of_top10: "İlk 10'dan düştü",
  entered_top10: "İlk 10'a girdi",
  significant_drop: "Belirgin düşüş",
  significant_rise: "Belirgin yükseliş",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function detailText(alert: AlertSummary): string {
  if (alert.kind === "dropped_out_of_top10") return `#${alert.fromPosition} → İlk 10'da yok`;
  if (alert.kind === "entered_top10") return `İlk 10'da yok → #${alert.toPosition}`;
  return `#${alert.fromPosition} → #${alert.toPosition}`;
}

export function AlertsList({ alerts }: { alerts: AlertSummary[]; email: string; token: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">Uyarılar</h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-slate-600 mt-2">
          Henüz uyarı yok. Pozisyon değişikliklerinde burada görünecek.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{alert.keyword}</span>
                <span className="font-mono text-slate-500">{alert.domain}</span>
              </div>
              <div className="mt-1 text-slate-700">
                <span className="font-semibold">{KIND_LABEL[alert.kind] ?? alert.kind}</span>
                <span className="text-slate-500"> · {detailText(alert)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{formatDate(alert.observedAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
