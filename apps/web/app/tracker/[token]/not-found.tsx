export default function TrackerNotFoundPage(): React.ReactElement {
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
