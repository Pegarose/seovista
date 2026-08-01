import type { Metadata } from "next";
import { SerpPreviewTool } from "../../../src/components/serp-preview/serp-preview-tool";

export const metadata: Metadata = {
  title: "SERP Preview — Google Sonuç Önizlemesi | SeoVista",
  description: "Sayfa başlığınızın ve meta açıklamanızın Google arama sonuçlarında nasıl görüneceğini tahmini pixel ölçümüyle önizleyin.",
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function SerpPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <main id="main" className="min-h-screen bg-gray-50 flex items-start justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight text-center">
          SERP Preview
        </h1>
        <p className="mt-2 text-sm text-gray-500 text-center">
          Başlık ve meta açıklamanızın Google'da nasıl görüneceğini tahmini pixel ölçümüyle test edin.
        </p>
        <SerpPreviewTool
          initialTitle={firstValue(params.title)}
          initialDescription={firstValue(params.desc)}
          initialUrl={firstValue(params.url)}
        />
      </div>
    </main>
  );
}
