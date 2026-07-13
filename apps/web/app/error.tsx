"use client";

import { useEffect } from "react";
import { Container, Section, Button, Link } from "@seovista/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main id="main">
      <Section padding="xl" className="bg-mineral">
        <Container>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Something went wrong
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            We encountered an unexpected error. You can try again or return to the home page.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
            <Link href="/" variant="default" underline="hover">
              Return to the home page
            </Link>
          </div>
        </Container>
      </Section>
    </main>
  );
}
