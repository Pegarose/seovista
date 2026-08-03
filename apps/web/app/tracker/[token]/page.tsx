import { notFound } from "next/navigation";
import { listTrackerTargetsAction, listAlertsAction } from "../../../src/lib/tracker/actions";
import { TrackerTargetCard } from "../../../src/components/tracker/tracker-target-card";
import { AddTargetForm } from "../../../src/components/tracker/add-target-form";
import { ConsentToggle } from "../../../src/components/tracker/consent-toggle";
import { AlertsList } from "../../../src/components/tracker/alerts-list";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return {
    title: "Takip Paneli - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function TrackerTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) notFound();

  const result = await listTrackerTargetsAction(token);
  const alertsResult = await listAlertsAction(token);
  const alerts = alertsResult.success ? alertsResult.alerts : [];

  if (!result.success) {
    notFound();
  }

  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">
              Takip Panelim
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              Anahtar kelimeleriniz günlük olarak kontrol edilir. Bu sayfayı yer
              imlerine ekleyerek tekrar erişebilirsiniz.
            </p>
          </div>
          <a
            href={`/tracker/${token}/export`}
            download
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
          >
            CSV İndir
          </a>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-600">
            Hesap: <span className="font-mono font-medium text-slate-800">{result.email}</span>
          </p>
        </div>

        <AddTargetForm token={token} />

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <ConsentToggle token={token} current={result.consent} />
          <AlertsList alerts={alerts} email={result.email} token={token} />
        </div>

        {result.targets.length === 0 ? (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
            <p className="text-slate-600">
              Henüz takip edilen anahtar kelime yok. Yukarıdaki formdan yeni bir hedef ekleyebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {result.targets.map((target) => (
              <TrackerTargetCard key={target.id} target={target} token={token} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
