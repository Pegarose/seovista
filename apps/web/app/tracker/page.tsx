import { TrackerForm } from "../../src/components/tracker/tracker-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Anahtar Kelime Takibi - SeoVista",
  robots: { index: false, follow: false, nocache: true },
};

export default function TrackerPage() {
  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Anahtar Kelime Takibi
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Anahtar kelimenizi günlük olarak otomatik kontrol ettirin. Sıralama
            değişimlerini takip panelinden izleyin.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Yeni Hedef Ekle</h2>
          <TrackerForm />
        </div>

        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-600">
            Takip paneli bağlantınızı kaybederseniz, aynı e-posta ile yeni bir
            hedef eklediğinizde mevcut panelinize erişebilirsiniz.
          </p>
        </div>
      </div>
    </main>
  );
}
