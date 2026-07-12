"use client";

import { useEffect } from "react";

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
    <main id="main" className="px-4 py-8">
      <h1>Something went wrong</h1>
      <p>We encountered an unexpected error. Please try again.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
      <a href="/">Return to the home page</a>
    </main>
  );
}
