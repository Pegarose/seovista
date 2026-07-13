import { Container, Section } from "@seovista/ui";
import { termsPage } from "../../src/content/site";
import { pageMetadataFrom } from "../../src/lib/metadata";
import { buildPageGraph } from "../../src/lib/jsonld";
import { JsonLd } from "../../src/components/json-ld";

export const metadata = pageMetadataFrom(termsPage);

export default function TermsPage(): React.ReactElement {
  const graph = buildPageGraph(termsPage);

  return (
    <>
      <JsonLd graph={graph} />
      <main id="main">
        <Section padding="lg" className="bg-mineral">
          <Container>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {termsPage.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">{termsPage.description}</p>
          </Container>
        </Section>

        <Section padding="md">
          <Container>
            <p className="max-w-3xl text-lg leading-relaxed text-ink">{termsPage.body}</p>
          </Container>
        </Section>
      </main>
    </>
  );
}
