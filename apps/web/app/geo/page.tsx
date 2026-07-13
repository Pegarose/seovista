import { Container, Section } from "@/components/ui";
import { geoPage, findServiceByPath } from "../../src/content/site";
import { pageMetadataFrom } from "../../src/lib/metadata";
import { buildServicePageGraph } from "../../src/lib/jsonld";
import { JsonLd } from "../../src/components/json-ld";

export const metadata = pageMetadataFrom({
  title: geoPage.title,
  description: geoPage.description,
  canonicalPath: geoPage.canonical.path,
});

export default function GeoPage(): React.ReactElement {
  const service = findServiceByPath("/geo/");
  if (!service) {
    throw new Error("GEO service not found");
  }
  const graph = buildServicePageGraph(geoPage, service);

  return (
    <>
      <JsonLd graph={graph} />
      <main id="main">
        <Section padding="lg" className="bg-mineral">
          <Container>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {geoPage.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              {geoPage.description}
            </p>
          </Container>
        </Section>

        <Section padding="md">
          <Container>
            <p className="max-w-3xl text-lg leading-relaxed text-ink">
              {geoPage.body}
            </p>
          </Container>
        </Section>
      </main>
    </>
  );
}
