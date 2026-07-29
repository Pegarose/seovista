import { JsonLd } from "../../../src/components/json-ld";
import { checkerPage } from "../../../src/content/site";
import { buildPageGraph } from "../../../src/lib/jsonld";
import { pageMetadataFrom } from "../../../src/lib/metadata";

export const metadata = pageMetadataFrom(checkerPage);

export default function GeoReadinessCheckerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd graph={buildPageGraph(checkerPage)} />
      {children}
    </>
  );
}
