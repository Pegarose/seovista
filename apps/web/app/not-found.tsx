import { Container, Section, Link } from "@seovista/ui";

export default function NotFoundPage(): React.ReactElement {
  return (
    <main id="main">
      <Section padding="xl" className="bg-mineral">
        <Container>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Page not found
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            The page you requested could not be found. It may have been moved or removed.
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex rounded-lg bg-spectral-blue px-5 py-3 font-medium text-paper transition-colors hover:bg-spectral-blue/90"
              underline="none"
            >
              Return to the home page
            </Link>
          </div>
        </Container>
      </Section>
    </main>
  );
}
