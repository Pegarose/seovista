import { createFileRoute, Outlet, useRouter, Link } from "@tanstack/react-router";
import {
  EmptyState,
  InstrumentIndexSkeleton,
  RetryError,
} from "@/components/editorial";

/**
 * Layout route for /tools/*. Renders only <Outlet /> — page bodies live in
 * tools.index.tsx and tools.geo-readiness-checker.tsx.
 *
 * Shared pending / error / not-found boundaries live here so every child
 * route inherits accessible skeleton and recovery screens.
 */
export const Route = createFileRoute("/tools")({
  component: () => <Outlet />,
  pendingMs: 200,
  pendingMinMs: 300,
  pendingComponent: ToolsPendingSkeleton,
  errorComponent: ToolsErrorBoundary,
  notFoundComponent: ToolsNotFound,
});

function ToolsFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-24 md:px-16 md:py-40">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
        <div className="md:col-span-3">
          <span className="sticky top-24 block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">
            Instrument Library
          </span>
        </div>
        <div className="md:col-span-9">{children}</div>
      </div>
    </section>
  );
}

function ToolsPendingSkeleton() {
  return (
    <article className="bg-paper text-ink">
      <ToolsFrame>
        <InstrumentIndexSkeleton rows={4} />
      </ToolsFrame>
    </article>
  );
}

function ToolsErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <article className="bg-paper text-ink">
      <ToolsFrame>
        <RetryError
          title="This instrument page could not be rendered."
          description={
            error?.message ??
            "An unexpected error interrupted the page. Try again — if it persists, return to the instrument index."
          }
          onRetry={() => {
            reset();
            router.invalidate();
          }}
          retryLabel="Try again"
        />
      </ToolsFrame>
    </article>
  );
}

function ToolsNotFound() {
  return (
    <article className="bg-paper text-ink">
      <ToolsFrame>
        <EmptyState
          title="No instrument at this address."
          description="The instrument you were looking for is not in the library. Return to the index for what is currently available or in planning."
          action={
            <Link
              to="/tools"
              className="inline-flex items-center gap-2 rounded-full border border-hairline bg-paper px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ink transition-colors hover:border-signal hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              Back to instrument index
            </Link>
          }
        />
      </ToolsFrame>
    </article>
  );
}
