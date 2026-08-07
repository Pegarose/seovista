import type { Metadata } from "next";
import { FormShell } from "../../../src/components/form-pages";
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
    <FormShell
      title="SERP Preview"
      helper="Başlık ve meta açıklamanızın Google'da nasıl görüneceğini tahmini pixel ölçümüyle test edin."
    >
      <SerpPreviewTool
        initialTitle={firstValue(params.title)}
        initialDescription={firstValue(params.desc)}
        initialUrl={firstValue(params.url)}
      />
    </FormShell>
  );
}
