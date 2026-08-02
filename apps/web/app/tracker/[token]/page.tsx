import { notFound } from "next/navigation";
import { listTrackerTargetsAction } from "../../../src/lib/tracker/actions";
import { TrackerDashboard } from "../../../src/components/tracker/tracker-dashboard";

export const dynamic = "force-dynamic";

// Spec §8: invalid tokens must surface as 404. The token is a UUID issued by
// the tracker session flow; anything outside that shape is rejected before
// hitting the database.
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

  if (!result.success) {
    // Unknown token (or lookup failure) — render the 404 contract via
    // not-found.tsx rather than an inline 200 view.
    notFound();
  }

  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Takip Panelim
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Anahtar kelimeleriniz günlük olarak kontrol edilir. Bu sayfayı yer
            imlerine ekleyerek tekrar erişebilirsiniz.
          </p>
        </div>

        <TrackerDashboard
          token={token}
          targets={result.targets}
          email={result.email}
        />

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Yeni Hedef Ekle</h2>
          <p className="text-sm text-slate-600">
            Yeni hedef eklemek için{" "}
            <a href="/tracker" className="font-semibold text-slate-900 hover:text-slate-600 underline">
              takip formuna gidin
            </a>{" "}
            ve aynı e-posta adresini kullanın. Hedefleriniz bu panelde görünecek.
          </p>
        </div>
      </div>
    </main>
  );
}
