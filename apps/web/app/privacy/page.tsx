import { Container, Section } from "@seovista/ui";
import { privacyPage } from "../../src/content/site";
import { pageMetadataFrom } from "../../src/lib/metadata";
import { buildPageGraph } from "../../src/lib/jsonld";
import { JsonLd } from "../../src/components/json-ld";

export const metadata = pageMetadataFrom(privacyPage);

export default function PrivacyPage(): React.ReactElement {
  const graph = buildPageGraph(privacyPage);

  return (
    <>
      <JsonLd graph={graph} />
      <main id="main">
        <Section padding="lg" className="bg-mineral">
          <Container>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {privacyPage.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">{privacyPage.description}</p>
          </Container>
        </Section>

        <Section padding="md">
          <Container>
            <p className="max-w-3xl text-lg leading-relaxed text-ink">{privacyPage.body}</p>
          </Container>
        </Section>
      </main>
    </>
  );
}
