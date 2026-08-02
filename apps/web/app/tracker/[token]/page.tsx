import { listTrackerTargetsAction } from "../../../src/lib/tracker/actions";
import { TrackerDashboard } from "../../../src/components/tracker/tracker-dashboard";

export const dynamic = "force-dynamic";

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

  const result = await listTrackerTargetsAction(token);

  if (!result.success) {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Takip Paneli Bulunamadı
          </h1>
          <p className="text-slate-700">
            Takip paneli bağlantınız geçersiz veya bulunamadı. Lütfen bağlantıyı kontrol edin.
          </p>
        </div>
      </main>
    );
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
          <AddTargetForm token={token} email={result.email} />
        </div>
      </div>
    </main>
  );
}

function AddTargetForm({ token: _token, email }: { token: string; email: string }) {
  // Reuses the TrackerForm but pre-fills the email since the session is known.
  // For B1 simplicity, we use a simple form that calls the same action.
  return (
    <form action="/api/tracker/add" method="POST" className="space-y-4">
      <input type="hidden" name="knownEmail" value={email} />
      <p className="text-sm text-slate-600">
        Yeni hedef eklemek için{" "}
        <a href="/tracker" className="font-semibold text-slate-900 hover:text-slate-600 underline">
          takip formuna gidin
        </a>{" "}
        ve aynı e-posta adresini kullanın. Hedefleriniz bu panelde görünecek.
      </p>
    </form>
  );
}
