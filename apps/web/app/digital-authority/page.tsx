import { Container, Section } from "@/components/ui";
import { digitalAuthorityPage, findServiceByPath } from "../../src/content/site";
import { pageMetadataFrom } from "../../src/lib/metadata";
import { buildServicePageGraph } from "../../src/lib/jsonld";
import { JsonLd } from "../../src/components/json-ld";

export const metadata = pageMetadataFrom({
  title: digitalAuthorityPage.title,
  description: digitalAuthorityPage.description,
  canonicalPath: digitalAuthorityPage.canonical.path,
});

export default function DigitalAuthorityPage(): React.ReactElement {
  const service = findServiceByPath("/digital-authority/");
  if (!service) {
    throw new Error("Digital Authority service not found");
  }
  const graph = buildServicePageGraph(digitalAuthorityPage, service);

  return (
    <>
      <JsonLd graph={graph} />
      <main id="main">
        <Section padding="lg" className="bg-mineral">
          <Container>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {digitalAuthorityPage.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              {digitalAuthorityPage.description}
            </p>
          </Container>
        </Section>

        <Section padding="md">
          <Container>
            <p className="max-w-3xl text-lg leading-relaxed text-ink">
              {digitalAuthorityPage.body}
            </p>
          </Container>
        </Section>
      </main>
    </>
  );
}
