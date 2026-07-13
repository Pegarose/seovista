import { Container, Section, Link } from "@seovista/ui";
import { contactPage } from "../../src/content/site";
import { pageMetadataFrom } from "../../src/lib/metadata";
import { buildPageGraph } from "../../src/lib/jsonld";
import { JsonLd } from "../../src/components/json-ld";

export const metadata = pageMetadataFrom(contactPage);

export default function ContactPage(): React.ReactElement {
  const graph = buildPageGraph(contactPage);

  return (
    <>
      <JsonLd graph={graph} />
      <main id="main">
        <Section padding="lg" className="bg-mineral">
          <Container>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {contactPage.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">{contactPage.description}</p>
          </Container>
        </Section>

        <Section padding="md">
          <Container>
            <p className="max-w-3xl text-lg leading-relaxed text-ink">{contactPage.body}</p>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-ink">
              Email us at{" "}
              <Link href="mailto:hello@seovista.com" external>
                hello@seovista.com
              </Link>
              .
            </p>
          </Container>
        </Section>
      </main>
    </>
  );
}
